import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { getStoryRound, storyPool, type StoryKind } from '../src/storyGames.ts';
import { oceanConcepts, dailyConcepts } from '../src/concepts.ts';
import { createInitialState, startPlan, completeTask, answerMatch, startGame, answerStory, advanceGame, claimGame, validateState, type Language, type State, type TrialItem } from '../src/engine.ts';

const items: TrialItem[] = JSON.parse(readFileSync(new URL('../src/trial-content.json', import.meta.url), 'utf8')).items;
function ready(kind: StoryKind, language: Language = 'en-US', toy = 'red-monster') {
  let state = createInitialState(); state.settings.language = language;
  state = startPlan(state, items);
  while (!state.plan!.completedAt) {
    const task = state.plan!.tasks[state.plan!.index];
    if (task.kind === 'match') for (const id of task.optionIds) state = answerMatch(state, task.id, id, id, new Date(), true);
    else state = completeTask(state, { taskId: task.id, outcome: 'independent_correct', promptPlayed: true });
  }
  state = startGame(state, toy, new Date(), kind);
  // Keep exercising the existing v1-v3 paid saves after the recipe kitchen ships.
  if (kind === 'kitchen') { state.game!.story!.version = 3; delete state.game!.cooking; }
  return state;
}
function round(state: State) { const g = state.game!; return getStoryRound(g.id, g.progress!, g.kind as StoryKind, g.language!, g.story!.version); }
function correct(state: State) { const r = round(state); return answerStory(state, state.game!.id, state.game!.progress!, r.choices.indexOf(r.target), true); }

test('new Mandarin story pools match English, and v1 paid saves keep their original rounds', () => {
  for (const kind of ['hide', 'kitchen'] as const) {
    assert.deepEqual(storyPool(kind, 'zh-CN', 2), storyPool(kind, 'en-US', 2));
    const state = ready(kind, 'zh-CN', 'grandpa-shark');
    assert.equal(state.game!.story!.version, 3);
    for (const concept of storyPool(kind, 'zh-CN', 2)) assert.ok(items.some(item => item.language === 'zh-CN' && item.concept === concept && item.audio.prompt));
    state.game!.story!.version = 1;
    const expected = getStoryRound(state.game!.id, 0, kind, 'zh-CN', 1);
    validateState(state);
    const restored = JSON.parse(JSON.stringify(state));
    assert.deepEqual(round(restored), expected);
    const next = answerStory(restored, state.game!.id, 0, expected.choices.indexOf(expected.target), true);
    assert.equal(next.game!.progress, 1); validateState(next);
  }
});

test('both story games use recorded local prompts and stable distinct rounds in both languages', () => {
  for (const kind of ['hide', 'kitchen'] as const) for (const language of ['en-US', 'zh-CN'] as const) {
    for (const concept of storyPool(kind, language)) {
      const item = items.find(item => item.concept === concept && item.language === language);
      assert.ok(item?.audio.prompt);
      assert.ok(existsSync(new URL(`../public${item.audio.prompt}`, import.meta.url)));
    }
    for (let n = 0; n < 50; n++) {
      const rounds = [0,1,2].map(i => getStoryRound(`game-${n}`, i, kind, language));
      assert.equal(new Set(rounds.map(r => r.target)).size, 3);
      assert.equal(new Set(rounds.map(r => r.choices.indexOf(r.target))).size, 3);
      rounds.forEach((r, i) => {
        assert.equal(new Set(r.choices).size, 3); assert.ok(r.choices.includes(r.target));
        assert.deepEqual(r, getStoryRound(`game-${n}`, i, kind, language));
        assert.ok(r.choices.every(c => storyPool(kind, language).includes(c)));
      });
    }
  }
  for (const n of [-1, .5, 3, NaN, Infinity]) assert.throws(() => getStoryRound('bad', n, 'hide', 'en-US'));
});

test('a wrong hiding place survives reload without spending, advancing or changing choices', () => {
  const state = ready('hide'), r = round(state), slot = r.choices.findIndex(c => c !== r.target);
  let next = answerStory(state, state.game!.id, 0, slot, true);
  next = answerStory(next, state.game!.id, 0, slot, true);
  validateState(next); next = JSON.parse(JSON.stringify(next)); validateState(next);
  assert.deepEqual(next.game!.story!.opened, [slot]); assert.deepEqual(round(next), r);
  assert.equal(next.game!.progress, 0); assert.deepEqual(next.ledger, state.ledger); assert.deepEqual(next.events, state.events);
  assert.deepEqual(correct(next).game!.story!.opened, []);
});

test('unheard, invalid, repeated and stale actions cannot advance a story round', () => {
  for (const kind of ['hide', 'kitchen'] as const) {
    const state = ready(kind), id = state.game!.id, r = round(state), slot = r.choices.indexOf(r.target);
    for (const [gameId, progress, choice, heard] of [[id,0,slot,false],['stale',0,slot,true],[id,1,slot,true],[id,0,-1,true],[id,0,3,true],[id,0,.5,true],[id,NaN,slot,true]] as const) {
      assert.deepEqual(answerStory(state, gameId, progress, choice, heard).game, state.game);
    }
    assert.deepEqual(advanceGame(state, id, 0).game, state.game);
    const next = correct(state);
    assert.equal(next.game!.progress, 1);
    assert.deepEqual(answerStory(next, id, 0, slot, true).game, next.game);
    assert.throws(() => claimGame(next));
  }
});

test('wrong kitchen food leaves progress unchanged and retries are free', () => {
  const state = ready('kitchen'), r = round(state);
  const next = answerStory(state, state.game!.id, 0, r.choices.findIndex(c => c !== r.target), true);
  assert.deepEqual(next.game, state.game); assert.deepEqual(next.ledger, state.ledger); validateState(next);
});

test('three correct answers award exactly one toy, with no extra coin or learning evidence', () => {
  for (const kind of ['hide', 'kitchen'] as const) for (const language of ['en-US', 'zh-CN'] as const) {
    const initial = ready(kind, language);
    let state = initial;
    for (let i = 0; i < 3; i++) { state = correct(state); validateState(state); }
    state = claimGame(state); state = claimGame(state); validateState(state);
    assert.equal(state.collections.length, 1); assert.equal(state.collections[0].toyId, 'red-monster');
    assert.equal(state.balance, 0); assert.deepEqual(state.ledger, initial.ledger); assert.deepEqual(state.events, initial.events);
    assert.deepEqual(answerStory(state, state.game!.id, 2, 0, true).game, state.game);
  }
});

test('changing the parent language does not change an already paid story game', () => {
  const state = ready('kitchen'), r = round(state);
  state.settings.language = 'zh-CN'; validateState(state);
  assert.deepEqual(round(state), r); assert.equal(correct(state).game!.progress, 1);
});

test('save validation rejects malformed or contradictory story data', () => {
  const original = ready('hide'), r = round(original), correctSlot = r.choices.indexOf(r.target), wrong = (correctSlot + 1) % 3;
  const mutations: ((g: any) => void)[] = [
    g => { delete g.story }, g => { g.story.version = 4 }, g => { g.story.opened = [wrong, wrong] },
    g => { g.story.opened = [-1] }, g => { g.story.opened = [3] }, g => { g.story.opened = ['0'] },
    g => { g.story.opened = [correctSlot] }, g => { delete g.language }, g => { g.progress = .5 },
    g => { g.kind = 'kitchen'; g.story.opened = [wrong] }, g => { g.kind = 'bubbles' },
    g => { g.progress = 3; g.story.opened = [wrong] }, g => { g.bubbleMode = 'listen-find' },
    g => { g.claw = { position: 50, target: 50, attempts: 0, caught: false } }, g => { g.pusher = {} },
  ];
  for (const mutate of mutations) { const state = structuredClone(original); mutate(state.game); assert.throws(() => validateState(state)); }
});

test('new sea and daily friends can be earned from both story games in both languages', () => {
  for (const language of ['en-US', 'zh-CN'] as const) for (const kind of ['hide','kitchen'] as const) for (const toy of [...oceanConcepts, ...dailyConcepts]) {
    let state = ready(kind, language, toy);
    for (let i = 0; i < 3; i++) state = correct(state);
    state = claimGame(state); validateState(state);
    assert.equal(state.collections[0].toyId, toy); assert.equal(state.balance, 0);
    if ((oceanConcepts as readonly string[]).includes(toy)) assert.ok(!storyPool(kind, language, 3).includes(toy));
  }
});
