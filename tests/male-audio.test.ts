import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = (path: string) => readFileSync(new URL(path, import.meta.url));
const json = (path: string) => JSON.parse(read(path).toString());
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('the approved D voice covers every Chinese role while preserving English, paths and learning content', () => {
  const current = json('../src/trial-content.json'), previous = json('../references/audio-pre-v20/trial-content.json');
  for (const old of previous.items) assert.deepEqual(current.items.find((i: any) => i.id === old.id), old);
  assert.deepEqual(current.systemAudio, previous.systemAudio);
  const catalog = json('../src/catalog.json');
  for (const old of json('../references/audio-pre-v20/catalog.json')) {
    const next = catalog.find((i: any) => i.id === old.id);
    assert.deepEqual({...next, available: old.available}, old);
  }
  const before = json('../references/audio-pre-v20/manifest.json').clips;
  const after = json('../public/audio/manifest.json').clips.filter((c: any) => before.some((old: any) => old.id === c.id));
  const approved = json('../output/chinese-male-v18/qwen/verification.json').find((r: any) => r.style === 'D-playful');
  assert.equal(after.length, before.length);
  assert.equal(after.filter((c: any) => c.language === 'zh-CN').length, 359);
  for (const old of before) {
    const clip = after.find((c: any) => c.id === old.id);
    for (const key of ['id','item_id','role','language','text','path','source']) assert.deepEqual(clip[key], old[key]);
    assert.equal(hash(read('../references/audio-pre-v20/' + old.path.split('/').at(-1))), old.sha256);
    assert.equal(hash(read('../public' + clip.path)), clip.sha256);
    if (clip.language === 'en-US') { assert.deepEqual(clip, old); continue; }
    assert.equal(clip.voice, approved.speaker);
    assert.equal(clip.voice_style, approved.style);
    assert.equal(clip.instruction, approved.instruction);
    assert.equal(clip.model_revision, approved.revision);
    assert.equal(clip.normalization.version, 'v20-qwen-D-fixed-gain');
    assert.ok(Math.abs(clip.normalization.measured_lufs + 18) <= .2);
    assert.ok(clip.normalization.true_peak_dbtp <= -1.5);
    assert.ok(clip.duration_ms > 400 && clip.duration_ms < 14000);
    assert.notEqual(clip.sha256, old.sha256);
  }
});
