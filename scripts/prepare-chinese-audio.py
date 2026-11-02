#!/usr/bin/env python3
"""Render the approved D Mandarin voice locally, normalize, then replace the checked batch."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'output/chinese-audio-v20'
BACKUP = ROOT / 'references/audio-pre-v20'
MANIFEST = ROOT / 'public/audio/manifest.json'
VERSION = 'v20-qwen-D-fixed-gain'
VOICE = 'Uncle_Fu'
STYLE = 'D-playful'
BASE_KEYS = ['id', 'item_id', 'role', 'language', 'text', 'path', 'source']


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


audition = load_script('preview-chinese-male')
norm = load_script('normalize-audio')
digest = audition.digest
INSTRUCTION = audition.STYLES[STYLE]


def duration_limit(clip):
    return (2.8 if len(clip['text']) <= 3 else 3.6) if clip['role'] == 'label' else max(4.5, len(clip['text']) * .42 + 1)


def synthesis_text(clip):
    # A sentence ending stops the model from continuing isolated labels with filler.
    return clip['text'] + ('。' if clip['role'] == 'label' else '')


def main(apply=False, check=False, single=False):
    original_bytes = MANIFEST.read_bytes()
    original = json.loads(original_bytes)
    clips = original['clips']
    chinese = [c for c in clips if c['language'] == 'zh-CN']
    assert len(clips) == 631 and len(chinese) == 359
    assert len({c['id'] for c in clips}) == len({c['path'] for c in clips}) == len(clips)
    for c in clips:
        assert re.fullmatch(r'/audio/[a-zA-Z0-9_-]+\.mp3', c['path'])
        assert digest(ROOT / 'public' / c['path'].lstrip('/')) == c['sha256'], c['id']
    old = json.loads((BACKUP / 'manifest.json').read_text())
    assert [{k:c[k] for k in BASE_KEYS} for c in old['clips']] == [{k:c[k] for k in BASE_KEYS} for c in clips]
    assert [c for c in old['clips'] if c['language']=='en-US'] == [c for c in clips if c['language']=='en-US']
    for c in old['clips']:
        assert digest(BACKUP / Path(c['path']).name) == c['sha256']
    done = all(c.get('voice') == VOICE and c.get('voice_style') == STYLE and c.get('normalization',{}).get('version') == VERSION for c in chinese)
    if check or done:
        assert done, 'The complete approved batch is not installed'
        with ThreadPoolExecutor(max_workers=4) as pool:
            stats = list(pool.map(lambda c:norm.measure(ROOT/'public'/c['path'].lstrip('/')), chinese))
        for c,s in zip(chinese,stats):
            assert s['sha256']==c['sha256'] and s['duration_ms']==c['duration_ms']
            assert s['integrated_lufs'] is not None and abs(s['integrated_lufs']+18)<=.2 and s['true_peak_dbtp']<=-1.5, c['id']
            assert c['instruction']==INSTRUCTION and c['normalization']['measured_lufs']==s['integrated_lufs']
        report={'checked':len(chinese),'english_preserved':272,'after':norm.summarize(stats)}
        (OUTPUT/'check.json').write_text(json.dumps(report,indent=2))
        print('PASS',json.dumps(report),flush=True)
        return
    assert (BACKUP/'manifest.json').read_bytes()==original_bytes
    sources=json.loads((audition.MODELS/'sources.json').read_text())
    for file in sources['files']:
        assert digest(audition.MODELS/file['path'])==file['sha256']
    approved=next(r for r in json.loads((audition.OUTPUT/'verification.json').read_text()) if r['style']==STYLE)
    assert approved['instruction']==INSTRUCTION and approved['revision']==sources['revision']
    assert digest(audition.OUTPUT/STYLE/'preview.mp3')==approved['after']['sha256']
    stage=OUTPUT/'staged';stage.mkdir(parents=True,exist_ok=True)
    records={};pending=[]
    for c in chinese:
        expected={k:c[k] for k in BASE_KEYS}
        expected.update(voice=VOICE,voice_style=STYLE,instruction=INSTRUCTION,model_source=sources['repo'],model_revision=sources['revision'])
        record_file=stage/(c['id']+'.json');destination=stage/Path(c['path']).name
        if record_file.exists() and destination.exists():
            record=json.loads(record_file.read_text())
            if all(record.get(k)==v for k,v in expected.items()) and digest(destination)==record['sha256'] and record['normalization']['version']==VERSION and record['duration_ms'] <= duration_limit(c) * 1000:
                records[c['id']]=record;continue
        pending.append((c,expected))
    print(f'Resuming {len(records)}/359; generating {len(pending)} remaining clips',flush=True)
    os.environ.update(HF_HUB_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',TOKENIZERS_PARALLELISM='false')
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model
    delay=norm.limiter_delay()

    def save(c,expected,samples,rate,origin,token_count=None):
        assert rate==24000 and .25<len(samples)/rate<13 and np.isfinite(samples).all() and np.max(np.abs(samples))>.01,c['id']
        destination=stage/Path(c['path']).name
        wav=stage/(c['id']+'.wav');raw=stage/(c['id']+'.raw.mp3')
        sf.write(wav,np.concatenate([np.zeros(round(rate*.08)),samples,np.zeros(round(rate*.15))]),rate,subtype='PCM_16')
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-ar','44100','-ac','1','-codec:a','libmp3lame','-b:a','96k',str(raw)],check=True)
        before=norm.measure(raw)
        assert before['integrated_lufs'] is not None,c['id']
        gain=-18-before['integrated_lufs']
        for attempt in range(24):
            filters=f"volume={gain}dB,aresample=192000,apad=pad_len={delay},alimiter=limit=0.707945784:attack=5:release=50:level=false,atrim=start_sample={delay},asetpts=PTS-STARTPTS,aresample=44100,atrim=end_sample={before['decoded_samples']}"
            subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-af',filters,'-ar','44100','-ac','1','-codec:a','libmp3lame','-b:a','96k',str(destination)],check=True)
            after=norm.measure(destination);error=-18-after['integrated_lufs']
            if abs(error)<=.15:break
            # Small steps avoid oscillating around the loudness gate on short words.
            gain+=error*.5
        assert abs(error)<=.2 and after['true_peak_dbtp']<=-1.5,c['id']
        assert after['decoded_samples']==before['decoded_samples'] and after['duration_ms']==before['duration_ms']
        record={**expected,**{k:after[k] for k in ['size_bytes','sha256','duration_ms']},'generator':'Qwen3-TTS 1.7B CustomVoice 8bit / mlx-audio 0.6.1 / local Metal -> PCM WAV -> ffmpeg libmp3lame','synthesis_origin':origin,'token_count':token_count,'model_license':'Apache-2.0','media_type':'audio/mpeg','status':'generated','human_review_status':'voice-style-approved-2026-10-25; individual-clip-review-pending','device_playback_status':'pending','normalization':{'version':VERSION,'target_lufs':-18,'method':'integrated_lufs','measured_lufs':after['integrated_lufs'],'true_peak_dbtp':after['true_peak_dbtp']},'measurement':after,'source_measurement':before}
        (stage/(c['id']+'.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2))
        records[c['id']]=record
        print(f"{len(records)}/359 {c['id']} {after['duration_ms']} ms {after['integrated_lufs']} LUFS",flush=True)

    to_generate=[]
    for c,expected in pending:
        if c['id'] in audition.SAMPLE_IDS:
            i=audition.SAMPLE_IDS.index(c['id']);assert approved['texts'][i]==c['text']
            samples,rate=sf.read(audition.OUTPUT/STYLE/(c['id']+'.wav'),dtype='float32')
            save(c,expected,samples,rate,'approved-D-audition-waveform')
        else:to_generate.append((c,expected))
    if to_generate:
        model=load_model(audition.MODELS)
        batch_size=1 if single else 4
        generation_instruction=INSTRUCTION + ('准确完整读出给定文字，吐字清楚。' if single else '')
        temperature=.4 if single else .7
        for offset in range(0,len(to_generate),batch_size):
            batch=to_generate[offset:offset+batch_size];mx.random.seed(577+sum(map(ord,batch[0][0]['id'])) if single else 7700+offset)
            started=time.monotonic()
            results=list(model.generate_custom_voice(text=synthesis_text(batch[0][0]),speaker=VOICE,language='Chinese',instruct=generation_instruction,temperature=temperature,max_tokens=200)) if single else list(model.batch_generate(texts=[synthesis_text(c) for c,_ in batch],voices=[VOICE]*len(batch),instructs=[INSTRUCTION]*len(batch),lang_code='Chinese',temperature=.7,max_tokens=200))
            assert len(results)==len(batch)
            if not single:assert {r.sequence_idx for r in results}==set(range(len(batch)))
            for r in results:
                index=0 if single else r.sequence_idx
                c,expected=batch[index]
                seed_base=17700+offset+index
                for retry in range(3):
                    if r.token_count<200 and len(r.audio)/r.sample_rate+.26 <= duration_limit(c):break
                    print('Retry unusually long speech:', c['id'], flush=True)
                    mx.random.seed(seed_base+retry*1000)
                    r=list(model.generate_custom_voice(text=synthesis_text(c),speaker=VOICE,language='Chinese',instruct=generation_instruction,temperature=temperature,max_tokens=200))[0]
                assert len(r.audio)/r.sample_rate+.26 <= duration_limit(c) and r.token_count<200, ('Speech duration',c['id'])
                save(c,{**expected,'synthesis_text':synthesis_text(c),'synthesis_instruction':generation_instruction,'temperature':temperature},np.array(r.audio,dtype=np.float32).reshape(-1),r.sample_rate,'same-model-speaker-and-D-instruction',r.token_count)
            print(f'Batch {round(time.monotonic()-started,1)} sec',flush=True)
            mx.clear_cache()
    assert len(records)==359 and MANIFEST.read_bytes()==original_bytes
    assert all(digest(ROOT/'public'/c['path'].lstrip('/'))==c['sha256'] for c in clips)
    updated={**original,'generation':'Mandarin: approved Qwen3-TTS Uncle_Fu D-playful; English: preserved Kokoro af_heart. Local speech, uniform -18 LUFS.','clips':[records.get(c['id'],c) for c in clips]}
    (OUTPUT/'manifest.json').write_text(json.dumps(updated,ensure_ascii=False,indent=2)+'\n')
    if not apply:
        print('Staged only; application unchanged.',flush=True);return
    try:
        for c in chinese:
            destination=ROOT/'public'/c['path'].lstrip('/');temporary=destination.with_suffix('.mp3.next');shutil.copy2(stage/destination.name,temporary);temporary.replace(destination)
        temporary=MANIFEST.with_suffix('.json.next');shutil.copy2(OUTPUT/'manifest.json',temporary);temporary.replace(MANIFEST)
        assert all(digest(ROOT/'public'/c['path'].lstrip('/'))==c['sha256'] for c in updated['clips'])
    except BaseException:
        for c in chinese:shutil.copy2(BACKUP/Path(c['path']).name,ROOT/'public'/c['path'].lstrip('/'))
        MANIFEST.write_bytes(original_bytes)
        raise
    print('Applied all 359 Mandarin D clips; 272 English clips preserved.',flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    mode=parser.add_mutually_exclusive_group();mode.add_argument('--apply',action='store_true');mode.add_argument('--check',action='store_true')
    parser.add_argument('--single',action='store_true',help='Render remaining or rejected clips individually, as in the approved audition.')
    args=parser.parse_args();main(args.apply,args.check,args.single)
