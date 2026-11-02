#!/usr/bin/env python3
"""Stage new speech batches with the approved local voices; append only after verification."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]

def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

norm = module('normalize-audio')
male = module('preview-chinese-male')
english = module('prepare-english-audio')
parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['zh', 'en', 'apply'])
parser.add_argument('--batch', default='kitchen-v22', choices=['kitchen-v22', 'panda-race-v25', 'vocabulary-v26', 'vehicles-v27', 'family-vehicles-v28', 'countdown-v29', 'vocabulary-v30'])
parser.add_argument('--seed-offset', type=int, default=0, help='Seed for retaking rejected clips; completed clips are preserved.')
args = parser.parse_args()
OUT = ROOT / 'output' / args.batch
STAGE = OUT / 'audio'
STAGE.mkdir(parents=True, exist_ok=True)
plan = json.loads((OUT / 'audio-plan.json').read_text())

if args.mode == 'apply':
    manifest = ROOT / 'public/audio/manifest.json'
    original = json.loads(manifest.read_text())
    additions = []
    for clip in plan:
        record = json.loads((STAGE / (clip['id'] + '.json')).read_text())
        assert all(record[k] == v for k, v in clip.items())
        stats = norm.measure(STAGE / Path(clip['path']).name)
        assert stats['sha256'] == record['sha256'] and abs(stats['integrated_lufs'] + 18) <= .2 and stats['true_peak_dbtp'] <= -1.5
        additions.append(record)
    existing = {c['id']: c for c in original['clips']}
    for clip in original['clips']:
        assert norm.sha256(ROOT / 'public' / clip['path'].lstrip('/')) == clip['sha256']
    for clip in additions:
        assert clip['id'] not in existing or existing[clip['id']] == clip
    backup = OUT / 'manifest-before.json'
    if not backup.exists(): backup.write_bytes(manifest.read_bytes())
    for clip in additions: shutil.copy2(STAGE / Path(clip['path']).name, ROOT / 'public' / clip['path'].lstrip('/'))
    original['clips'].extend(c for c in additions if c['id'] not in existing)
    temporary = manifest.with_suffix('.json.next')
    temporary.write_text(json.dumps(original, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(manifest)
    print(f"Verified and installed {len(additions)} clips; existing speech unchanged.")
    raise SystemExit

os.environ.update(HF_HUB_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', TOKENIZERS_PARALLELISM='false', ORT_DISABLE_TELEMETRY='1')
import numpy as np
import soundfile as sf
language = 'zh-CN' if args.mode == 'zh' else 'en-US'
if args.mode == 'zh':
    import mlx.core as mx
    from mlx_audio.tts.utils import load_model
    sources = json.loads((male.MODELS / 'sources.json').read_text())
    for f in sources['files']: assert male.digest(male.MODELS / f['path']) == f['sha256']
    model = load_model(male.MODELS)
else:
    import onnxruntime as ort
    from kokoro_onnx import Kokoro
    english.ensure_models()
    options = ort.SessionOptions(); options.intra_op_num_threads = 2; options.inter_op_num_threads = 1
    model = Kokoro.from_session(ort.InferenceSession(str(english.MODELS / 'kokoro-v1.0.onnx'), sess_options=options, providers=['CPUExecutionProvider']), str(english.MODELS / 'voices-v1.0.bin'))
delay = norm.limiter_delay()
for index, clip in enumerate(c for c in plan if c['language'] == language):
    destination = STAGE / Path(clip['path']).name
    record_file = STAGE / (clip['id'] + '.json')
    if record_file.exists() and destination.exists():
        record = json.loads(record_file.read_text())
        if all(record.get(k) == v for k, v in clip.items()) and norm.sha256(destination) == record['sha256']: continue
    if args.mode == 'zh':
        instruction = male.STYLES['D-playful'] + '准确完整读出给定文字，吐字清楚。'
        limit = (2.8 if len(clip['text']) <= 3 else 3.6) if clip['role'] == 'label' else 9
        for attempt in range(3):
            mx.random.seed({'kitchen-v22':772200, 'panda-race-v25':772500, 'vocabulary-v26':772600, 'vehicles-v27':772700, 'family-vehicles-v28':772800, 'countdown-v29':772900, 'vocabulary-v30':773000}[args.batch] + index + attempt * 1000 + args.seed_offset)
            r = list(model.generate_custom_voice(text=clip['text'] + ('。' if clip['role'] == 'label' else ''), speaker='Uncle_Fu', language='Chinese', instruct=instruction, temperature=.4, max_tokens=220))[0]
            samples, rate = np.array(r.audio).reshape(-1), r.sample_rate
            if r.token_count < 220 and .3 < len(samples)/rate < limit and np.isfinite(samples).all(): break
            print('Rejected duration:', clip['id'], len(samples)/rate, flush=True)
        assert r.token_count < 220 and .3 < len(samples)/rate < limit, clip['id']
        voice = {'generator': 'Qwen3-TTS 1.7B CustomVoice 8bit / local Metal -> ffmpeg MP3', 'voice': 'Uncle_Fu', 'voice_style': 'D-playful', 'instruction': male.STYLES['D-playful'], 'synthesis_instruction': instruction, 'model_source': sources['repo'], 'model_revision': sources['revision']}
    else:
        samples, rate = model.create(clip['text'] + ('.' if clip['role'] == 'label' else ''), voice='af_heart', speed=.96, lang='en-us')
        voice = {'generator': 'Kokoro-82M v1.0 FP32 / local ONNX -> ffmpeg MP3', 'voice': 'af_heart', 'speed': .96, 'model_sha256': english.ASSETS['kokoro-v1.0.onnx'][1]}
    assert rate == 24000 and .3 < len(samples)/rate < 9 and np.isfinite(samples).all()
    wav = destination.with_suffix('.wav'); raw = destination.with_suffix('.raw.mp3')
    sf.write(wav, np.concatenate([np.zeros(1920), samples, np.zeros(3600)]), rate, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-ar', '44100', '-ac', '1', '-b:a', '96k', str(raw)], check=True)
    before = norm.measure(raw); gain = -18 - before['integrated_lufs']
    for attempt in range(24):
        filters = f"volume={gain}dB,aresample=192000,apad=pad_len={delay},alimiter=limit=0.707945784:attack=5:release=50:level=false,atrim=start_sample={delay},asetpts=PTS-STARTPTS,aresample=44100,atrim=end_sample={before['decoded_samples']}"
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-af',filters,'-ar','44100','-ac','1','-b:a','96k',str(destination)],check=True)
        after = norm.measure(destination); error = -18 - after['integrated_lufs']
        if abs(error) <= .15: break
        gain += error * .5
    assert abs(error) <= .2 and after['true_peak_dbtp'] <= -1.5
    record = {**clip, **voice, **{k:after[k] for k in ['sha256','size_bytes','duration_ms']}, 'media_type':'audio/mpeg','status':'generated','human_review_status':'pending','device_playback_status':'pending','normalization':{'version':{'kitchen-v22':'v22-kitchen-fixed-gain','panda-race-v25':'v25-race-fixed-gain','vocabulary-v26':'v26-vocabulary-fixed-gain','vehicles-v27':'v27-vehicles-fixed-gain','family-vehicles-v28':'v28-family-vehicles-fixed-gain', 'countdown-v29':'v29-countdown-fixed-gain', 'vocabulary-v30':'v30-vocabulary-fixed-gain'}[args.batch],'target_lufs':-18,'measured_lufs':after['integrated_lufs'],'true_peak_dbtp':after['true_peak_dbtp']},'measurement':after}
    record_file.write_text(json.dumps(record,ensure_ascii=False,indent=2))
    print(clip['id'], after['duration_ms'], after['integrated_lufs'], flush=True)
