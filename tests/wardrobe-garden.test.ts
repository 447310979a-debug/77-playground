import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { clothingConcepts, gardenConcepts, wardrobeGardenConcepts } from '../src/concepts.ts';
import { TOY_IDS } from '../src/engine.ts';
import { bubbleConcepts, getBubbleRound } from '../src/bubbles.ts';
import { makeRoomPages, roomMoveBounds } from '../src/rooms.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url));
const json = (path: string) => JSON.parse(read(path).toString());

test('12 bilingual discoveries preserve every existing lesson and recording', () => {
  const before = json('../output/vocabulary-v26/trial-before.json');
  const current = json('../src/trial-content.json');
  for (const item of before.items) assert.deepEqual(current.items.find((i: any) => i.id === item.id), item);
  assert.deepEqual(current.systemAudio, before.systemAudio);
  const previousClips = json('../output/vocabulary-v26/manifest-before.json').clips;
  const clips = json('../public/audio/manifest.json').clips;
  for (const clip of previousClips) assert.deepEqual(clips.find((c: any) => c.id === clip.id), clip);
  const added = current.items.filter((i: any) => i.contentSource === 'bilingual-expansion-v26');
  assert.equal(added.length, 24);
  for (const language of ['zh-CN', 'en-US']) {
    assert.deepEqual(added.filter((i: any) => i.language === language).map((i: any) => i.concept), [...wardrobeGardenConcepts]);
  }
  const addedClips = clips.filter((c: any) => added.some((i: any) => i.id === c.item_id));
  assert.equal(addedClips.length, 84);
  for (const clip of addedClips) {
    assert.equal(clip.normalization.version, 'v26-vocabulary-fixed-gain');
    assert.ok(Math.abs(clip.normalization.measured_lufs + 18) <= .2);
    assert.ok(clip.normalization.true_peak_dbtp <= -1.5);
  }
  for (const clip of clips) assert.equal(createHash('sha256').update(read('../public' + clip.path)).digest('hex'), clip.sha256);
  assert.equal(added.find((i: any) => i.concept === 'pants' && i.language === 'en-US').example, 'These are my pants.');
});

test('new bubble rounds include the selected new friend and keep previous saved pools intact', () => {
  for (const language of ['zh-CN', 'en-US'] as const) {
    assert.equal(bubbleConcepts(7, language).length, 89);
    assert.deepEqual(bubbleConcepts(7, language).slice(0, 77), bubbleConcepts(6, language));
    for (const friend of wardrobeGardenConcepts) {
      const rounds = [0, 1, 2].map(p => getBubbleRound('new-wardrobe-garden', friend, p, 7, language));
      assert.ok(rounds.some(round => round.target === friend));
      assert.equal(new Set(rounds.map(round => round.target)).size, 3);
      assert.ok(rounds.every(round => round.choices.includes(round.target) && new Set(round.choices).size === 3));
    }
  }
});

test('new friends have their own room pages, sensible movement limits, and leave old seats intact', () => {
  const previous = TOY_IDS.filter(id => !(wardrobeGardenConcepts as readonly string[]).includes(id));
  const pages = makeRoomPages([...TOY_IDS]);
  for (const toy of makeRoomPages(previous).flatMap(p => p.toys)) assert.deepEqual(pages.flatMap(p => p.toys).find(t => t.id === toy.id), toy);
  for (const id of wardrobeGardenConcepts) {
    const page = pages.find(p => p.toys.some(toy => toy.id === id))!;
    const { seat } = page.toys.find(toy => toy.id === id)!;
    const bounds = roomMoveBounds(page.kind, id, seat);
    assert.ok(seat.x >= bounds.left && seat.x <= bounds.right && seat.y >= bounds.top && seat.y <= bounds.bottom);
    if ((clothingConcepts as readonly string[]).includes(id)) assert.equal(page.kind, id === 'backpack' ? 'entry' : 'wardrobe');
    if ((gardenConcepts as readonly string[]).includes(id)) assert.equal(page.kind, ['butterfly','bee'].includes(id) ? 'garden' : 'meadow');
    if (id === 'backpack') assert.match(seat.place, /挂钩/);
    if (id === 'butterfly' || id === 'bee') { assert.match(seat.place, /上空/); assert.ok(bounds.bottom <= 57); }
    if (['ant', 'snail', 'ladybug', 'mushroom'].includes(id)) { assert.match(seat.place, /草地/); assert.ok(bounds.top >= 76); }
  }
});
