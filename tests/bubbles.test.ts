import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BUBBLE_CONCEPTS, bubbleConcepts, getBubbleRound } from '../src/bubbles.ts';

test('v5 shares all 57 recorded friends while old Mandarin pools retain their questions', () => {
  assert.deepEqual(bubbleConcepts(5, 'zh-CN'), bubbleConcepts(5, 'en-US'));
  assert.equal(bubbleConcepts(5, 'zh-CN').length, 57);
  for (let version = 1; version <= 4; version++) for (let progress = 0; progress < 3; progress++) {
    assert.deepEqual(getBubbleRound('saved-chinese-game', 'fish', progress, version, 'zh-CN'), getBubbleRound('saved-chinese-game', 'fish', progress, 1, 'zh-CN'));
  }
});

test('all bubble choices have existing Chinese and English local prompts', () => {
  const content = JSON.parse(readFileSync(new URL('../src/trial-content.json', import.meta.url), 'utf8'));
  const available = new Set(content.items.filter((item: { language: string }) => item.language === 'zh-CN').map((item: { concept: string }) => item.concept));
  available.delete('water');
  available.delete('rice');
  assert.ok(BUBBLE_CONCEPTS.every(c => available.has(c)));
  assert.equal(BUBBLE_CONCEPTS.length, 18);
  for (const concept of BUBBLE_CONCEPTS) for (const language of ['zh-CN', 'en-US']) {
    const item = content.items.find((item: { concept: string; language: string }) => item.concept === concept && item.language === language);
    assert.ok(item?.audio.prompt, `${language} ${concept} needs a listening prompt`);
    assert.ok(existsSync(new URL(`../public${item.audio.prompt}`, import.meta.url)), `${language} ${concept} audio is local`);
  }
});

test('saved game yields three distinct targets, distinct choices and changing answer positions', () => {
  for (const toy of BUBBLE_CONCEPTS) for (let id = 0; id < 40; id++) {
    const rounds = [0, 1, 2].map(progress => getBubbleRound(`game-${id}`, toy, progress));
    assert.equal(new Set(rounds.map(round => round.target)).size, 3);
    assert.ok(rounds.some(round => round.target === toy));
    assert.equal(new Set(rounds.map(round => round.choices.indexOf(round.target))).size, 3);
    for (const [progress, round] of rounds.entries()) {
      assert.equal(round.choices.length, 3);
      assert.equal(new Set(round.choices).size, 3);
      assert.equal(round.choices.filter(choice => choice === round.target).length, 1);
      assert.ok(round.choices.every(choice => BUBBLE_CONCEPTS.includes(choice)));
      assert.deepEqual(round, getBubbleRound(`game-${id}`, toy, progress));
    }
  }
});

test('legacy prize fallbacks use recorded prompts and invalid rounds are rejected', () => {
  for (const toy of ['sheep', 'horse', 'boat', 'water', 'rice']) {
    const rounds = [0, 1, 2].map(progress => getBubbleRound('legacy-game', toy, progress));
    assert.equal(new Set(rounds.map(round => round.target)).size, 3);
    assert.ok(rounds.every(round => BUBBLE_CONCEPTS.includes(round.target)));
  }
  for (const progress of [-1, 0.5, 3, NaN, Infinity]) assert.throws(() => getBubbleRound('game', 'cat', progress));
});


test('new bubble pool contains 38 English friends while legacy and Chinese rounds retain 18', () => {
  const content = JSON.parse(readFileSync(new URL('../src/trial-content.json', import.meta.url), 'utf8'));
  for (const language of ['en-US', 'zh-CN'] as const) {
    const pool = bubbleConcepts(2, language);
    assert.equal(pool.length, language === 'en-US' ? 38 : 18);
    for (const toy of pool) for (let id = 0; id < 12; id++) {
      const rounds = [0, 1, 2].map(progress => getBubbleRound(`v8-${id}`, toy, progress, 2, language));
      assert.equal(new Set(rounds.map(round => round.target)).size, 3);
      assert.ok(rounds.some(round => round.target === toy));
      assert.equal(new Set(rounds.map(round => round.choices.indexOf(round.target))).size, 3);
      for (const round of rounds) {
        assert.equal(new Set(round.choices).size, 3);
        for (const concept of round.choices) assert.ok(content.items.find((item: { concept: string; language: string }) => item.concept === concept && item.language === language)?.audio.prompt);
      }
    }
  }
  assert.deepEqual(bubbleConcepts(), BUBBLE_CONCEPTS);
  assert.deepEqual(getBubbleRound('legacy-game', 'sheep', 0), { target: 'duck', choices: ['dog', 'duck', 'orange'] });
});

test('v13 bubble prizes have recorded words without altering the v2 pool', () => {
  assert.equal(bubbleConcepts(3).length, 50);
  assert.equal(bubbleConcepts(2).length, 38);
  assert.equal(bubbleConcepts(3, 'zh-CN').length, 18);
  for (const toy of ['turtle','crab','whale','dolphin','lion','tiger','elephant','monkey','bed','lamp','pillow','blanket']) {
    assert.ok([0,1,2].map(i => getBubbleRound('v13',toy,i,3)).some(round => round.target === toy));
  }
});

test('v16 adds seven ocean prizes while older bubble questions retain their pools', () => {
  assert.equal(bubbleConcepts(4).length, 57);
  assert.equal(bubbleConcepts(3).length, 50);
  assert.equal(bubbleConcepts(2).length, 38);
  assert.equal(bubbleConcepts(4, 'zh-CN').length, 18);
  for (const toy of ['baby-shark','mama-shark','papa-shark','grandma-shark','grandpa-shark','octopus','starfish']) {
    const rounds = [0,1,2].map(i => getBubbleRound('ocean-game',toy,i,4));
    assert.ok(rounds.some(r => r.target === toy));
    assert.equal(new Set(rounds.map(r => r.target)).size, 3);
    for (const r of rounds) assert.equal(new Set(r.choices).size, 3);
    assert.ok(!bubbleConcepts(3).includes(toy as typeof BUBBLE_CONCEPTS[number]));
  }
});
