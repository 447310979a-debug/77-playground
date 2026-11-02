#!/usr/bin/env python3
"""Create Qwen Mandarin male auditions; never write application audio or saves."""
import hashlib
import importlib.util
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / '.tools/qwen3-tts/models/customvoice-8bit'
OUTPUT = ROOT / 'output/chinese-male-v18/qwen'
STYLES = {
    'C-conversation': '用标准普通话自然说话，语气温和，吐字清楚，语速适中，句间自然停顿。',
    'D-playful': '用标准普通话，像爸爸陪小朋友一起玩游戏，亲切、轻松，带一点微笑。语速适中，顺着句子的意思自然说话。',
}
SAMPLE_IDS = ['zh_021-label', 'zh_021-prompt', 'system-zh-game', 'zh_custom_grandma_shark-example', 'zh_custom_grandpa_shark-example']


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def main():
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    os.environ['TOKENIZERS_PARALLELISM'] = 'false'
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model

    sources = json.loads((MODELS / 'sources.json').read_text())
    for file in sources['files']:
        assert digest(MODELS / file['path']) == file['sha256'], file['path']
    manifest_path = ROOT / 'public/audio/manifest.json'
    before = manifest_path.read_bytes()
    clips = json.loads(before)['clips']
    by_id = {clip['id']: clip for clip in clips}
    assert len(clips) >= 491 and all(by_id[key]['language'] == 'zh-CN' for key in SAMPLE_IDS)
    for clip in clips:
        assert digest(ROOT / 'public' / clip['path'].lstrip('/')) == clip['sha256']
    spec = importlib.util.spec_from_file_location('normalization', ROOT / 'scripts/normalize-audio.py')
    norm = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(norm)
    delay = norm.limiter_delay()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    print('Loading local model', flush=True)
    model = load_model(MODELS)
    assert model.tokenizer is not None and model.speech_tokenizer is not None
    records = []
    for style, instruction in STYLES.items():
        directory = OUTPUT / style
        directory.mkdir(exist_ok=True)
        parts = []
        for index, key in enumerate(SAMPLE_IDS):
            clip = by_id[key]
            mx.random.seed(77 + index)
            results = list(model.generate_custom_voice(
                text=clip['text'], speaker='Uncle_Fu', language='Chinese',
                instruct=instruction, temperature=.7, max_tokens=200,
            ))
            assert len(results) == 1
            result = results[0]
            samples = np.array(result.audio, dtype=np.float32).reshape(-1)
            rate = result.sample_rate
            assert rate == 24000 and .3 < len(samples) / rate < 13 and result.token_count < 200, key
            assert np.isfinite(samples).all() and np.max(np.abs(samples)) > .01, key
            sf.write(directory / (key + '.wav'), samples, rate, subtype='PCM_16')
            parts.extend([samples, np.zeros(round(rate * .45), dtype=np.float32)])
            print(style, key, round(len(samples) / rate, 2), 'sec', flush=True)
        reel = directory / 'source.wav'
        sf.write(reel, np.concatenate(parts), rate, subtype='PCM_16')
        raw = directory / 'source.mp3'
        destination = directory / 'preview.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(reel), '-ar', '44100', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', str(raw)], check=True)
        measured = norm.measure(raw)
        gain = -18 - measured['integrated_lufs']
        for attempt in range(4):
            filters = f"volume={gain}dB,aresample=192000,apad=pad_len={delay},alimiter=limit=0.707945784:attack=5:release=50:level=false,atrim=start_sample={delay},asetpts=PTS-STARTPTS,aresample=44100,atrim=end_sample={measured['decoded_samples']}"
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-af', filters, '-ar', '44100', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', str(destination)], check=True)
            after = norm.measure(destination)
            error = -18 - after['integrated_lufs']
            if abs(error) < .15:
                break
            gain += error
        assert abs(error) < .2 and after['true_peak_dbtp'] <= -1.5
        assert after['decoded_samples'] == measured['decoded_samples']
        records.append({'style': style, 'speaker': 'Uncle_Fu', 'instruction': instruction, 'texts': [by_id[key]['text'] for key in SAMPLE_IDS], 'source': sources['repo'], 'revision': sources['revision'], 'before': measured, 'after': after, 'human_review': 'pending'})
        (OUTPUT / 'verification.json').write_text(json.dumps(records, ensure_ascii=False, indent=2))
        print('READY', destination, flush=True)
    assert manifest_path.read_bytes() == before
    assert all(digest(ROOT / 'public' / clip['path'].lstrip('/')) == clip['sha256'] for clip in clips)
    print(f'Verified all {len(clips)} application clips unchanged.', flush=True)


if __name__ == '__main__':
    main()
