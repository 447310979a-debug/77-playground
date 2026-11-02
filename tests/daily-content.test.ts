import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dailyConcepts, freshFoodConcepts } from '../src/concepts.ts';
import { bubbleConcepts, getBubbleRound } from '../src/bubbles.ts';
import { getStoryRound, storyPool } from '../src/storyGames.ts';
import { makeRoomPages, roomFor, roomMoveBounds } from '../src/rooms.ts';

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

test('20 shared discoveries preserve old teaching entries, catalog fields and English recordings', () => {
  const current = json('../src/trial-content.json'), previous = json('../references/trial-content-pre-v19.json');
  for (const item of previous.items) assert.deepEqual(current.items.find((row: any) => row.id === item.id), item);
  assert.deepEqual(current.systemAudio, previous.systemAudio);
  const catalog = json('../src/catalog.json');
  for (const item of json('../references/catalog-pre-v19.json')) {
    const next = catalog.find((row: any) => row.id === item.id);
    // Previously unavailable original entries can now become playable.
    assert.deepEqual({...next, available: item.available}, item);
  }
  const audio = json('../public/audio/manifest.json');
  const oldAudio = json('../references/audio-pre-v19/manifest.json');
  for (const clip of oldAudio.clips.filter((clip: any) => clip.language === 'en-US')) {
    assert.deepEqual(audio.clips.find((row: any) => row.id === clip.id), clip);
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../public${clip.path}`, import.meta.url))).digest('hex'), clip.sha256);
  }
  for (const language of ['zh-CN', 'en-US']) {
    const added = current.items.filter((row: any) => row.language === language && row.contentSource === 'bilingual-expansion-v19');
    assert.deepEqual(added.map((row: any) => row.concept), [...dailyConcepts]);
    assert.ok(added.every((row: any) => row.example && row.prompt && row.audio.example && row.offlinePrompt));
  }
  const newClips = audio.clips.filter((clip: any) => !clip.id.startsWith('kitchen22-') && !clip.id.startsWith('race-v25-') && !oldAudio.clips.some((old: any) => old.id === clip.id) && current.items.some((i: any) => i.id === clip.item_id && i.contentSource === 'bilingual-expansion-v19'));
  assert.equal(newClips.length, 140);
  for (const clip of newClips) {
    assert.equal(clip.normalization.version, clip.language === 'zh-CN' ? 'v20-qwen-D-fixed-gain' : 'v19-daily-fixed-gain');
    assert.ok(Math.abs(clip.normalization.measured_lufs + 18) <= .2);
    assert.ok(clip.normalization.true_peak_dbtp <= -1.5);
  }
});

test('new bubble pools share 77 friends and include each prize without changing old pools', () => {
  for (const language of ['en-US', 'zh-CN'] as const) {
    assert.equal(bubbleConcepts(6, language).length, 77);
    assert.deepEqual(bubbleConcepts(6, language).slice(0, 57), bubbleConcepts(5, language));
    for (const concept of dailyConcepts) {
      const rounds = [0,1,2].map(progress => getBubbleRound('daily-round', concept, progress, 6, language));
      assert.ok(rounds.some(round => round.target === concept));
      assert.equal(new Set(rounds.map(round => round.target)).size, 3);
      assert.ok(rounds.every(round => new Set(round.choices).size === 3));
    }
  }
});

test('new kitchen uses all ten foods and old paid kitchen rounds keep their original choices', () => {
  for (const language of ['en-US', 'zh-CN'] as const) {
    assert.equal(storyPool('kitchen', language, 3).length, 18);
    for (const food of freshFoodConcepts) assert.ok(storyPool('kitchen', language, 3).includes(food));
    assert.equal(storyPool('kitchen', language, 2).length, 8);
    for (let n = 0; n < 40; n++) {
      const rounds = [0,1,2].map(progress => getStoryRound(`kitchen-${n}`, progress, 'kitchen', language, 3));
      assert.equal(new Set(rounds.map(round => round.target)).size, 3);
      assert.ok(rounds.every(round => new Set(round.choices).size === 3));
      assert.deepEqual(getStoryRound(`old-${n}`, 0, 'kitchen', language, 2), getStoryRound(`old-${n}`, 0, 'kitchen', 'en-US', 1));
    }
  }
});

test('new toys have stable positions on supporting surfaces and keep their movement constraints', () => {
  const pages = makeRoomPages([...dailyConcepts]);
  for (const id of dailyConcepts) {
    const room = pages.find(page => page.toys.some(toy => toy.id === id))!;
    const toy = room.toys.find(toy => toy.id === id)!;
    const bounds = roomMoveBounds(room.kind, id, toy.seat);
    assert.ok(toy.seat.x >= bounds.left && toy.seat.x <= bounds.right);
    assert.ok(toy.seat.y >= bounds.top && toy.seat.y <= bounds.bottom);
    if (['bicycle','fire-truck','ambulance'].includes(id)) assert.match(toy.seat.place, /马路|自行车道/);
    if (['airplane','helicopter','rainbow','rain','snowflake'].includes(id)) assert.match(toy.seat.place, /天空/);
    if (id === 'boat') assert.match(toy.seat.place, /池塘水面/);
    if (freshFoodConcepts.includes(id as typeof freshFoodConcepts[number])) {
      assert.ok(['orchard','market','vegetables'].includes(roomFor(id)));
      assert.ok(toy.seat.y >= 24, 'Tall food must stay inside the kitchen frame');
    }
  }
});
