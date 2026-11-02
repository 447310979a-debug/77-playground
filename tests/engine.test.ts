import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expansionConcepts, themeConcepts, oceanConcepts, dailyConcepts, wardrobeGardenConcepts, vehicleConcepts, familyVehicleConcepts, homeNatureConcepts } from '../src/concepts.ts';
import {
  createInitialState, startPlan, completeTask, answerMatch, recordAttempt, recordExposure, startGame, advanceGame, answerBubble, claimGame,
  addActiveTime, dayKey, getDayUsage, getRemainingSeconds, validateState, moveClaw, attemptClaw, CLAW_CATCH_RADIUS, savePusher, PUSHER_GOAL,
  moveRoomToy, type State, type TrialItem,
} from '../src/engine.ts';
import { createPusherScene, dropPusherCoin, stepPusher, type PusherScene } from '../src/pusher.ts';
import { getBubbleRound } from '../src/bubbles.ts';

const morning = new Date('2026-10-20T02:00:00Z');
const tomorrow = new Date('2026-10-21T02:00:00Z');
const items: TrialItem[] = ['cat', 'dog', 'fish', 'bird', 'ball', 'book', 'water', 'rice'].map((concept, index) => ({
  id: `zh-${concept}`, concept: concept as TrialItem['concept'], language: 'zh-CN',
  target: ['猫', '狗', '鱼', '鸟', '球', '书', '水', '米'][index],
  label: concept, prompt: concept, example: concept, audio: { label: '', prompt: '', example: '' }, offlinePrompt: concept, theme: 'test',
}));
function createChineseState(): State {
  const state = createInitialState();
  state.settings.language = 'zh-CN';
  state.settings.parentManaged = false;
  return state;
}
function completeCurrent(state: State, now = morning, outcome: 'introduced' | 'independent_correct' | 'assisted' = 'independent_correct'): State {
  const task = state.plan!.tasks[state.plan!.index];
  if (task.kind === 'match') {
    let next = outcome === 'assisted' ? recordAttempt(state, task.id, now) : state;
    for (const id of task.optionIds) next = answerMatch(next, task.id, id, id, now, true);
    return next;
  }
  return completeTask(state, { taskId: task.id, outcome, promptPlayed: true }, now);
}
function finish(state: State, now = morning): State {
  let result = state;
  while (result.plan && !result.plan.completedAt) result = completeCurrent(result, now);
  validateState(result);
  return result;
}
function catchClaw(state: State, now = morning): State {
  const game = state.game!;
  return attemptClaw(moveClaw(state, game.id, game.claw!.target, now), game.id, game.claw!.attempts, now);
}

test('LAN HTTP can browse, learn, save and play without randomUUID', t => {
  t.mock.method(crypto, 'randomUUID', () => { throw new Error('randomUUID is unavailable on LAN HTTP'); });
  let state = recordExposure(createChineseState(), items[0], morning);
  state = finish(startPlan(state, items, morning));
  state = claimGame(catchClaw(startGame(JSON.parse(JSON.stringify(state)), 'dog', morning)), morning);
  validateState(state);
  assert.equal(state.balance, 0);
  assert.equal(state.collections.length, 1);
  assert.equal(new Set([state.events[0].sessionId, state.plan!.id, state.game!.id]).size, 3);
});

test('new plan is immutable, five slots introduce only two items and evidence stays separate', () => {
  const original = createChineseState();
  const planned = startPlan(original, items, morning);
  assert.equal(original.plan, null);
  assert.equal(planned.plan!.tasks.length, 5);
  assert.notStrictEqual(planned.plan!.tasks[2].optionIds, planned.plan!.tasks[4].optionIds);
  assert.deepEqual(getDayUsage(planned, morning).introducedIds, ['zh-cat']);
  const completed = finish(planned);
  assert.deepEqual(getDayUsage(completed, morning).introducedIds, ['zh-cat', 'zh-dog']);
  assert.deepEqual(completed.events.map(event => [event.ability, event.outcome]), [
    ['exposure', 'introduced'], ['exposure', 'introduced'],
    ['zh_listening', 'independent_correct'], ['zh_listening', 'independent_correct'],
    ['zh_character_recognition', 'independent_correct'],
  ]);
  assert.equal(completed.balance, 1);
});

test('same task double submission cannot answer next task or duplicate reward', () => {
  let state = startPlan(createChineseState(), items, morning);
  const first = { taskId: state.plan!.tasks[0].id, outcome: 'introduced' as const, promptPlayed: true };
  state = completeTask(state, first, morning);
  state = completeTask(state, first, morning);
  assert.equal(state.plan!.index, 1);
  state = finish(state);
  const last = { taskId: state.plan!.tasks[4].id, outcome: 'independent_correct' as const, promptPlayed: true };
  state = completeTask(state, last, morning);
  state = startPlan(state, items, morning);
  assert.equal(state.balance, 1);
  assert.equal(state.ledger.length, 1);
  assert.equal(state.events.length, 5);
});

test('cross-day continuation records the actual day, and another round can start immediately', () => {
  let state = startPlan(createChineseState(), items, morning);
  const planId = state.plan!.id;
  state = completeCurrent(state, tomorrow);
  assert.equal(state.plan!.id, planId);
  assert.deepEqual(getDayUsage(state, morning).introducedIds, ['zh-cat']);
  assert.deepEqual(getDayUsage(state, tomorrow).introducedIds, ['zh-dog']);
  state = finish(state, tomorrow);
  assert.equal(getDayUsage(state, morning).rewardPlanId, undefined);
  assert.equal(getDayUsage(state, tomorrow).rewardPlanId, planId);
  const repeated = startPlan(state, items, tomorrow);
  assert.notEqual(repeated.plan!.id, planId);
  const nextDay = new Date('2026-10-22T02:00:00Z');
  const newPlan = startPlan(repeated, items, nextDay);
  assert.equal(newPlan.plan!.id, repeated.plan!.id);
  assert.equal(newPlan.balance, 1);
});

test('zero new items handles an empty library, single item stays demonstration, language quotas combine', () => {
  let empty = createChineseState();
  empty.settings.dailyNewCap = 0;
  assert.equal(startPlan(empty, items, morning).plan, null);
  assert.equal(startPlan(createChineseState(), [], morning).plan, null);
  const one = startPlan(createChineseState(), items.slice(0, 1), morning);
  assert.ok(one.plan!.tasks.every(task => task.kind === 'learn'));
  const done = finish(one);
  assert.ok(done.events.every(event => event.ability === 'exposure'));
  const en = items.map(item => ({ ...item, id: item.id.replace('zh-', 'en-'), language: 'en-US' as const }));
  const bilingual = finish(startPlan(createChineseState(), items, morning));
  bilingual.settings.language = 'en-US';
  bilingual.plan = null;
  assert.equal(startPlan(bilingual, en, morning).plan, null);
});

test('lowering new cap while paused converts pending new tasks into familiar demonstration', () => {
  let state = startPlan(createChineseState(), items, morning);
  state.settings.dailyNewCap = 0;
  state = completeCurrent(state);
  assert.equal(state.plan!.tasks[1].itemId, 'zh-cat');
  state = finish(state);
  assert.deepEqual(getDayUsage(state, morning).introducedIds, ['zh-cat']);
  assert.ok(state.events.every(event => event.ability === 'exposure'));
});

test('hints survive save/reload and missing audio cannot create independent listening evidence', () => {
  let state = startPlan(createChineseState(), items, morning);
  state = completeCurrent(completeCurrent(state));
  const id = state.plan!.tasks[state.plan!.index].id;
  state = JSON.parse(JSON.stringify(recordAttempt(state, id, morning)));
  state = completeCurrent(state);
  assert.equal(state.events.at(-1)!.outcome, 'assisted');
  assert.equal(state.events.at(-1)!.attempts, 2);
  const nextId = state.plan!.tasks[state.plan!.index].id;
  state = completeTask(state, { taskId: nextId, outcome: 'independent_correct', promptPlayed: false }, morning);
  assert.equal(state.events.at(-1)!.outcome, 'assisted');
  validateState(state);
});

test('game debit and award are idempotent across reload and next-day resumption', () => {
  const rewarded = finish(startPlan(createChineseState(), items, morning));
  let state = startGame(rewarded, 'rabbit', morning);
  const id = state.game!.id;
  state = startGame(JSON.parse(JSON.stringify(state)), 'bear', morning);
  assert.equal(state.game!.id, id);
  assert.equal(state.balance, 0);
  assert.equal(state.ledger.length, 2);
  state = claimGame(catchClaw(state, tomorrow), tomorrow);
  state = claimGame(state, tomorrow);
  assert.equal(state.collections.length, 1);
  assert.equal(state.collections[0].toyId, 'rabbit');
  validateState(state);
});

test('limited mode still enforces balance and a 45-second reserve without a daily game cap', () => {
  assert.throws(() => startGame(createChineseState(), 'cat', morning), /一枚游戏币/);
  let state = finish(startPlan(createChineseState(), items, morning));
  assert.throws(() => startGame(addActiveTime(state, 436, morning), 'cat', morning), /明天/);
  const exact = startGame(addActiveTime(state, 435, morning), 'cat', morning);
  assert.equal(exact.balance, 0);
  state = claimGame(catchClaw(startGame(state, 'cat', morning)), morning);
  assert.throws(() => startGame(state, 'dog', morning), /一枚游戏币/);
  state = finish(startPlan(state, items, morning));
  assert.equal(startGame(state, 'dog', morning).balance, 0);
  assert.throws(() => startGame(createChineseState(), 'unknown', morning), /已有/);
});

test('usage uses Shanghai boundary and is not reset by settings or navigation', () => {
  const afterMidnight = new Date('2026-10-20T16:00:10Z');
  assert.equal(dayKey(afterMidnight), '2026-10-21');
  const state = addActiveTime(createChineseState(), 20, afterMidnight);
  assert.equal(state.dayUsage['2026-10-20'].activeSeconds, 10);
  assert.equal(state.dayUsage['2026-10-21'].activeSeconds, 10);
  const exhausted = addActiveTime(state, 200, new Date('2026-10-20T16:05:00Z'));
  exhausted.settings.budgetSeconds = 180;
  assert.equal(getRemainingSeconds(exhausted, afterMidnight), 0);
  assert.throws(() => startPlan(exhausted, items, afterMidnight), /进度已经保存/);
  assert.throws(() => addActiveTime(state, -1, afterMidnight), /无效/);
  validateState(state);
});

test('system date reversal cannot mint extra rewards', () => {
  const state = finish(startPlan(createChineseState(), items, tomorrow), tomorrow);
  assert.throws(() => startPlan(state, items, morning), /日期/);
});

test('water listening compares the same cup with water and empty, without introducing a new word', () => {
  let state = startPlan(createChineseState(), [items[6], items[7]], morning);
  state = completeCurrent(completeCurrent(state));
  assert.equal(state.plan!.tasks[2].kind, 'choice');
  assert.deepEqual([...state.plan!.tasks[2].optionIds].sort(), ['empty-cup', 'zh-water']);
  assert.equal(state.introduced['empty-cup'], undefined);
  validateState(finish(state));
});

test('backup validation rejects wallet manipulation, duplicate claims and invalid state shape', () => {
  const state = claimGame(catchClaw(startGame(finish(startPlan(createChineseState(), items, morning)), 'bear', morning)), morning);
  validateState(state);
  assert.throws(() => validateState({ ...state, balance: 200 }), /存档/);
  assert.throws(() => validateState({ ...state, collections: [...state.collections, state.collections[0]] }), /存档/);
  assert.throws(() => validateState({ ...state, ledger: [...state.ledger, state.ledger[0]] }), /存档/);
  assert.throws(() => validateState({ ...state, schemaVersion: 2 }), /存档/);
  assert.throws(() => validateState({ ...state, plan: { ...state.plan, index: 0 } }), /存档/);
  assert.throws(() => validateState({ ...state, settings: { ...state.settings, dailyNewCap: 50 } }), /存档/);
});

test('all eight concepts remain reachable even when every answer needs assistance, and reviews rotate', () => {
  let state = createChineseState();
  const laterReviewed = new Set<string>();
  for (let offset = 0; offset < 16; offset++) {
    const now = new Date(morning.getTime() + offset * 86400000);
    state = startPlan(state, items, now);
    if (offset >= 8) for (const task of state.plan!.tasks) laterReviewed.add(task.itemId);
    while (state.plan && !state.plan.completedAt) state = completeCurrent(state, now, 'assisted');
  }
  assert.equal(Object.keys(state.introduced).length, 8);
  assert.equal(laterReviewed.size, 8);
  validateState(state);
});

test('exhausted budget pauses a paid game without losing its debit or prize', () => {
  let state = startGame(finish(startPlan(createChineseState(), items, morning)), 'cat', morning);
  const gameId = state.game!.id;
  state = addActiveTime(state, 480, morning);
  assert.throws(() => startGame(state, 'dog', morning), /进度已经保存/);
  assert.throws(() => claimGame(state, morning), /进度已经保存/);
  state = claimGame(catchClaw(startGame(state, 'dog', tomorrow), tomorrow), tomorrow);
  assert.equal(state.game!.id, gameId);
  assert.equal(state.balance, 0);
  assert.equal(state.collections.length, 1);
  validateState(state);
});

test('backup cannot forget a reward day or an already paid game', () => {
  const rewarded = finish(startPlan(createChineseState(), items, morning));
  const lostRewardDay = structuredClone(rewarded);
  delete lostRewardDay.dayUsage[dayKey(morning)].rewardPlanId;
  assert.throws(() => validateState(lostRewardDay), /存档/);
  const paid = startGame(rewarded, 'cat', morning);
  assert.throws(() => validateState({ ...paid, game: null }), /存档/);
});

test('browsing records exposure without formal introductions, rewards, or claiming that audio played', () => {
  const original = createChineseState();
  original.settings.dailyNewCap = 0;
  let state = recordExposure(original, items[0], morning);
  state = recordExposure(state, items[0], morning);
  assert.equal(original.events.length, 0);
  assert.equal(state.events.length, 2);
  assert.notEqual(state.events[0].eventId, state.events[1].eventId);
  assert.ok(state.events.every(event => event.ability === 'exposure' && event.outcome === 'introduced' && !event.promptPlayed && event.taskId.startsWith('browse:')));
  assert.equal(Object.keys(state.introduced).length, 0);
  assert.deepEqual(getDayUsage(state, morning).introducedIds, []);
  assert.equal(state.balance, 0);
  assert.equal(state.ledger.length, 0);
  assert.equal(startPlan(state, items, morning).plan, null);
  validateState(state);
});

test('browsing preserves a pending plan and observes the same daily time budget', () => {
  const planned = startPlan(createChineseState(), items, morning);
  const browsed = recordExposure(planned, items[7], morning);
  assert.deepEqual(browsed.plan, planned.plan);
  assert.deepEqual(browsed.introduced, planned.introduced);
  assert.throws(() => recordExposure(addActiveTime(browsed, 480, morning), items[7], morning), /进度已经保存/);
  validateState(browsed);
});

test('new profiles start in English while existing Chinese settings and plans are preserved', () => {
  const fresh = createInitialState();
  assert.equal(fresh.settings.language, 'en-US');
  const englishItems = items.map(item => ({ ...item, id: item.id.replace('zh-', 'en-'), language: 'en-US' as const }));
  const completed = finish(startPlan(fresh, [...items, ...englishItems], morning));
  assert.equal(completed.plan!.language, 'en-US');
  assert.deepEqual(completed.events.map(event => event.ability), ['exposure', 'exposure', 'en_listening', 'en_listening', 'en_listening']);
  const existing = startPlan(createChineseState(), items, morning);
  const restored: State = JSON.parse(JSON.stringify(existing));
  validateState(restored);
  assert.equal(startPlan(restored, [...items, ...englishItems], tomorrow).settings.language, 'zh-CN');
  assert.equal(restored.plan!.language, 'zh-CN');
});

for (const kind of ['pusher', 'bubbles'] as const) {
  test(`legacy ${kind}: three persisted steps, duplicate-safe input, one debit, one prize`, () => {
    const rewarded = finish(startPlan(createChineseState(), items, morning));
    let state = startGame(rewarded, 'cat', morning, kind);
    // A schema 1 pusher from before the simulation retains its paid three-step game.
    if (kind === 'pusher') { delete state.game!.pusher; state.game!.progress = 0; }
    else { delete state.game!.bubbleMode; delete state.game!.bubblePoolVersion; delete state.game!.language; }
    const id = state.game!.id;
    assert.equal(state.game!.kind, kind);
    assert.equal(state.game!.progress, 0);
    assert.equal(state.balance, 0);
    assert.throws(() => claimGame(state, morning), /完成这局/);
    assert.equal(advanceGame(state, 'stale-game', 0, morning).game!.progress, 0);
    assert.equal(advanceGame(state, id, 1, morning).game!.progress, 0);
    for (let progress = 0; progress < 3; progress++) {
      const before = state;
      state = advanceGame(state, id, progress, morning);
      assert.equal(before.game!.progress, progress);
      assert.equal(state.game!.progress, progress + 1);
      state = advanceGame(state, id, progress, morning);
      assert.equal(state.game!.progress, progress + 1);
      state = JSON.parse(JSON.stringify(state));
      validateState(state);
      state = startGame(state, 'dog', morning, kind === 'pusher' ? 'bubbles' : 'pusher');
      assert.equal(state.game!.id, id);
      assert.equal(state.game!.kind, kind);
      assert.equal(state.balance, 0);
    }
    state = advanceGame(state, id, 3, morning);
    state = claimGame(state, morning);
    state = claimGame(state, morning);
    state = advanceGame(state, id, 2, morning);
    assert.equal(state.game!.progress, 3);
    assert.equal(state.collections.length, 1);
    assert.equal(state.collections[0].toyId, 'cat');
    assert.equal(state.ledger.filter(entry => entry.kind === 'spend').length, 1);
    assert.equal(state.balance, 0);
    assert.throws(() => startGame(state, 'dog', morning, 'claw'), /一枚游戏币/);
    validateState(state);
  });

  test(`legacy ${kind}: budget and midnight preserve a paid partial game`, () => {
    let state = startGame(finish(startPlan(createChineseState(), items, morning)), 'fish', morning, kind);
    if (kind === 'pusher') { delete state.game!.pusher; state.game!.progress = 0; }
    else { delete state.game!.bubbleMode; delete state.game!.bubblePoolVersion; delete state.game!.language; }
    const id = state.game!.id;
    state = advanceGame(state, id, 0, morning);
    state = addActiveTime(state, 480, morning);
    assert.throws(() => advanceGame(state, id, 1, morning), /进度已经保存/);
    state = JSON.parse(JSON.stringify(state));
    state = startGame(state, 'dog', tomorrow, 'claw');
    assert.equal(state.game!.kind, kind);
    assert.equal(state.game!.progress, 1);
    state = advanceGame(state, id, 1, tomorrow);
    state = advanceGame(state, id, 2, tomorrow);
    state = claimGame(state, tomorrow);
    assert.equal(state.balance, 0);
    assert.equal(state.ledger.filter(entry => entry.kind === 'spend').length, 1);
    assert.equal(state.collections.length, 1);
    assert.equal(getDayUsage(state, tomorrow).gameId, undefined);
    validateState(state);
  });
}

test('legacy claw backups without kind or progress still load, resume and claim', () => {
  const state = startGame(finish(startPlan(createChineseState(), items, morning)), 'rabbit', morning);
  delete state.game!.kind;
  delete state.game!.progress;
  delete state.game!.claw;
  const legacy: State = JSON.parse(JSON.stringify(state));
  validateState(legacy);
  const advanced = advanceGame(legacy, legacy.game!.id, 0, morning);
  assert.equal(advanced.game!.progress, undefined);
  const resumed = startGame(advanced, 'dog', tomorrow, 'bubbles');
  assert.equal(resumed.game!.id, legacy.game!.id);
  assert.equal(resumed.game!.kind, undefined);
  const claimed = claimGame(resumed, tomorrow);
  assert.equal(claimed.collections.length, 1);
  assert.equal(claimed.balance, 0);
  validateState(claimed);
});

test('listening bubbles require three correct answers and ignore wrong, duplicate or stale inputs', () => {
  let state = startGame(finish(startPlan(createChineseState(), items, morning)), 'fish', morning, 'bubbles');
  const id = state.game!.id;
  assert.equal(state.game!.bubbleMode, 'listen-find');
  const events = structuredClone(state.events);
  for (let progress = 0; progress < 3; progress++) {
    const round = getBubbleRound(id, 'fish', progress, state.game!.bubblePoolVersion, state.game!.language);
    assert.throws(() => claimGame(state, morning), /完成这局/);
    assert.equal(advanceGame(state, id, progress, morning).game!.progress, progress);
    for (const choice of [...round.choices.filter(choice => choice !== round.target), 'unknown']) {
      assert.equal(answerBubble(state, id, progress, choice, morning).game!.progress, progress);
    }
    assert.equal(answerBubble(state, 'stale-game', progress, round.target, morning).game!.progress, progress);
    assert.equal(answerBubble(state, id, progress + 1, round.target, morning).game!.progress, progress);
    const before = state;
    state = answerBubble(state, id, progress, round.target, morning);
    assert.equal(before.game!.progress, progress);
    assert.equal(state.game!.progress, progress + 1);
    state = answerBubble(state, id, progress, round.target, morning);
    assert.equal(state.game!.progress, progress + 1);
    state = JSON.parse(JSON.stringify(state));
    validateState(state);
    state = startGame(state, 'dog', morning, 'claw');
    assert.equal(state.game!.id, id);
    if (progress < 2) assert.deepEqual(getBubbleRound(id, state.game!.toyId, progress + 1, state.game!.bubblePoolVersion, state.game!.language), getBubbleRound(id, 'fish', progress + 1, state.game!.bubblePoolVersion, state.game!.language));
  }
  state = claimGame(claimGame(state, morning), morning);
  state = answerBubble(state, id, 2, getBubbleRound(id, 'fish', 2, state.game!.bubblePoolVersion, state.game!.language).target, morning);
  assert.equal(state.game!.progress, 3);
  assert.equal(state.balance, 0);
  assert.equal(state.ledger.filter(entry => entry.kind === 'spend').length, 1);
  assert.equal(state.collections.length, 1);
  assert.equal(state.collections[0].toyId, 'fish');
  assert.deepEqual(state.events, events);
  validateState(state);
});

test('listening bubble progress survives budget exhaustion, midnight and legacy resume', () => {
  for (const legacy of [false, true]) {
    let state = startGame(finish(startPlan(createChineseState(), items, morning)), 'fish', morning, 'bubbles');
    if (legacy) { delete state.game!.bubbleMode; delete state.game!.bubblePoolVersion; delete state.game!.language; }
    const id = state.game!.id;
    state = legacy ? advanceGame(state, id, 0, morning) : answerBubble(state, id, 0, getBubbleRound(id, 'fish', 0, state.game!.bubblePoolVersion, state.game!.language).target, morning);
    state = addActiveTime(state, 480, morning);
    assert.throws(() => answerBubble(state, id, 1, getBubbleRound(id, 'fish', 1, state.game!.bubblePoolVersion, state.game!.language).target, morning), /进度已经保存/);
    state = JSON.parse(JSON.stringify(state));
    validateState(state);
    state = startGame(state, 'dog', tomorrow, 'claw');
    assert.equal(state.game!.id, id);
    assert.equal(state.game!.progress, 1);
    for (let progress = 1; progress < 3; progress++) state = answerBubble(state, id, progress, getBubbleRound(id, 'fish', progress, state.game!.bubblePoolVersion, state.game!.language).target, tomorrow);
    state = claimGame(state, tomorrow);
    assert.equal(state.collections.length, 1);
    assert.equal(state.balance, 0);
    assert.equal(state.ledger.filter(entry => entry.kind === 'spend').length, 1);
    validateState(state);
  }
});

test('bubble mode validation rejects malformed modes, incompatible games and unsupported new prizes', () => {
  const rewarded = finish(startPlan(createChineseState(), items, morning));
  const state = startGame(rewarded, 'fish', morning, 'bubbles');
  for (const patch of [{ bubbleMode: null }, { bubbleMode: true }, { bubbleMode: 'unknown' }, { kind: 'claw' }, { kind: 'pusher' }, { toyId: 'water' }]) {
    assert.throws(() => validateState({ ...state, game: { ...state.game, ...patch } }), /存档/);
  }
  for (const toy of ['water', 'rice']) assert.throws(() => startGame(rewarded, toy, morning, 'bubbles'), /已有录音|英文乐园/);
  const claw = startGame(rewarded, 'cat', morning);
  assert.deepEqual(answerBubble(claw, claw.game!.id, 0, 'cat', morning), claw);
  const legacy = structuredClone(state);
  delete legacy.game!.bubbleMode;
  delete legacy.game!.bubblePoolVersion;
  delete legacy.game!.language;
  legacy.game!.toyId = 'sheep';
  validateState(legacy);
  const next = answerBubble(legacy, legacy.game!.id, 0, getBubbleRound(legacy.game!.id, 'sheep', 0).target, morning);
  assert.equal(next.game!.progress, 1);
  assert.equal(next.game!.toyId, 'sheep');
  validateState(next);
});

test('game backup validation rejects unknown kinds, missing or invalid progress and early claims', () => {
  const state = startGame(finish(startPlan(createChineseState(), items, morning)), 'cat', morning, 'bubbles');
  for (const patch of [{ kind: 'unknown' }, { kind: null }, { progress: undefined }, { progress: -1 }, { progress: 4 }, { progress: 0.5 }, { progress: '3' }, { kind: undefined, progress: 2 }]) {
    assert.throws(() => validateState({ ...state, game: { ...state.game, ...patch } }), /存档/);
  }
  const earlyClaim = structuredClone(state);
  earlyClaim.game!.claimedAt = morning.toISOString();
  earlyClaim.collections.push({ gameId: state.game!.id, toyId: 'cat', collectedAt: morning.toISOString() });
  assert.throws(() => validateState(earlyClaim), /存档/);
  assert.throws(() => startGame(createChineseState(), 'cat', morning, 'unknown' as never), /已有的小游戏/);
  validateState(state);
});

test('parent-managed mode reaches all twenty concepts in one day and rewards each distinct round once', () => {
  const concepts: TrialItem['concept'][] = ['cat', 'dog', 'fish', 'bird', 'ball', 'book', 'water', 'rice', 'apple', 'banana', 'orange', 'strawberry', 'rabbit', 'bear', 'duck', 'car', 'bus', 'sun', 'moon', 'red-monster'];
  const expanded = concepts.map(concept => ({ ...items[0], concept, id: `en-${concept}`, language: 'en-US' as const, target: concept }));
  let state = createInitialState();
  state.settings.dailyNewCap = 0;
  state.settings.budgetSeconds = 180;
  state = addActiveTime(state, 3600, morning);
  assert.equal(getRemainingSeconds(state, morning), Infinity);
  for (let round = 0; round < 20; round++) {
    const previousPlan = state.plan?.id;
    state = startPlan(state, expanded, morning);
    assert.notEqual(state.plan!.id, previousPlan);
    state = finish(state);
    const lastTask = state.plan!.tasks.at(-1)!;
    state = completeTask(state, { taskId: lastTask.id, outcome: 'independent_correct', promptPlayed: true }, morning);
    assert.equal(state.balance, round + 1);
    assert.equal(state.ledger.length, round + 1);
    assert.equal(getDayUsage(state, morning).rewardPlanId, state.plan!.id);
  }
  assert.equal(Object.keys(state.introduced).length, 20);
  assert.equal(state.events.length, 100);
  validateState(JSON.parse(JSON.stringify(state)));
});

test('multiple games share the same day without duplicate debits, prizes or stale daily references', () => {
  const englishItems = items.map(item => ({ ...item, language: 'en-US' as const }));
  let state = createInitialState();
  for (const kind of ['claw', 'pusher', 'bubbles'] as const) {
    state = finish(startPlan(state, englishItems, morning));
    state = startGame(state, 'red-monster', morning, kind);
    const id = state.game!.id;
    state = startGame(JSON.parse(JSON.stringify(state)), 'dog', morning, 'claw');
    assert.equal(state.game!.id, id);
    if (kind === 'claw') state = catchClaw(state);
    else if (kind === 'pusher') state = savePusher(state, id, { ...state.game!.pusher!, fallen: PUSHER_GOAL }, morning);
    else for (let progress = 0; progress < 3; progress++) state = answerBubble(state, id, progress, getBubbleRound(id, state.game!.toyId, progress, state.game!.bubblePoolVersion, state.game!.language).target, morning);
    state = claimGame(state, morning);
    state = claimGame(state, morning);
    assert.equal(getDayUsage(state, morning).gameId, id);
    validateState(state);
  }
  assert.equal(state.balance, 0);
  assert.equal(state.ledger.filter(entry => entry.kind === 'reward').length, 3);
  assert.equal(state.ledger.filter(entry => entry.kind === 'spend').length, 3);
  assert.equal(state.collections.length, 3);
  for (const property of ['rewardPlanId', 'gameId'] as const) {
    const stale = structuredClone(state);
    stale.dayUsage[dayKey(morning)][property] = state.ledger.find(entry => property === 'rewardPlanId' ? entry.planId : entry.gameId)![property === 'rewardPlanId' ? 'planId' : 'gameId'];
    assert.throws(() => validateState(stale), /存档/);
  }
  const duplicate = structuredClone(state);
  duplicate.ledger.push({ ...duplicate.ledger[0], id: 'different-id-same-plan' });
  duplicate.balance++;
  assert.throws(() => validateState(duplicate), /存档/);
});

test('existing saves without parentManaged unlock continued play without erasing progress or settings', () => {
  let state = finish(startPlan(createChineseState(), items, morning));
  state = addActiveTime(state, 480, morning);
  delete state.settings.parentManaged;
  const legacy: State = JSON.parse(JSON.stringify(state));
  validateState(legacy);
  assert.equal(getRemainingSeconds(legacy, morning), Infinity);
  const resumed = startPlan(legacy, items, morning);
  assert.notEqual(resumed.plan!.id, legacy.plan!.id);
  assert.equal(resumed.settings.language, 'zh-CN');
  assert.equal(resumed.settings.budgetSeconds, 480);
  assert.equal(resumed.balance, legacy.balance);
  assert.deepEqual(resumed.events, legacy.events);
  assert.deepEqual(resumed.ledger, legacy.ledger);
  assert.equal(finish(resumed).balance, 2);
  assert.throws(() => validateState({ ...legacy, settings: { ...legacy.settings, parentManaged: 'true' } }), /存档/);
});

test('claw misses can retry on the same coin; position and attempts survive reload with duplicate-safe catching', () => {
  let state = startGame(finish(startPlan(createChineseState(), items, morning)), 'red-monster', morning);
  const id = state.game!.id;
  assert.ok(Math.abs(state.game!.claw!.position - state.game!.claw!.target) > CLAW_CATCH_RADIUS, 'A new claw game requires aiming before catching');
  assert.throws(() => claimGame(state, morning), /爪子/);
  assert.equal(moveClaw(state, 'stale-game', 0, morning).game!.claw!.position, 50);
  state = moveClaw(state, id, -10, morning);
  assert.equal(state.game!.claw!.position, 0);
  state = attemptClaw(state, id, 0, morning);
  assert.equal(state.game!.claw!.caught, false);
  assert.equal(state.game!.claw!.attempts, 1);
  state = attemptClaw(state, id, 0, morning);
  assert.equal(state.game!.claw!.attempts, 1);
  assert.equal(state.ledger.filter(entry => entry.kind === 'spend').length, 1);
  assert.throws(() => claimGame(state, morning), /爪子/);
  state = JSON.parse(JSON.stringify(state));
  validateState(state);
  state = startGame(state, 'cat', morning, 'pusher');
  assert.equal(state.game!.id, id);
  assert.equal(state.game!.claw!.position, 0);
  state = moveClaw(state, id, state.game!.claw!.target + CLAW_CATCH_RADIUS + 0.1, morning);
  state = attemptClaw(state, id, 1, morning);
  assert.equal(state.game!.claw!.caught, false);
  state = moveClaw(state, id, state.game!.claw!.target + CLAW_CATCH_RADIUS, morning);
  state = attemptClaw(state, id, 2, morning);
  assert.equal(state.game!.claw!.caught, true);
  assert.equal(state.game!.claw!.attempts, 3);
  state = JSON.parse(JSON.stringify(state));
  state = moveClaw(state, id, 0, morning);
  state = attemptClaw(state, id, 3, morning);
  assert.equal(state.game!.claw!.attempts, 3);
  state = claimGame(state, morning);
  state = claimGame(state, morning);
  assert.equal(state.collections.length, 1);
  assert.equal(state.balance, 0);
  validateState(state);
});

test('claw rejects malformed saved positions, impossible catches, early claims and non-finite input', () => {
  const state = startGame(finish(startPlan(createChineseState(), items, morning)), 'cat', morning);
  for (const patch of [{ position: NaN }, { position: Infinity }, { position: -1 }, { position: 101 }, { target: '50' }, { target: -1 }, { attempts: 0.5 }, { attempts: -1 }, { caught: 'true' }, { caught: true }, { position: 0, target: 100, attempts: 1, caught: true }]) {
    assert.throws(() => validateState({ ...state, game: { ...state.game, claw: { ...state.game!.claw, ...patch } } }), /存档/);
  }
  const earlyClaim = structuredClone(state);
  earlyClaim.game!.claimedAt = morning.toISOString();
  earlyClaim.collections.push({ gameId: state.game!.id, toyId: 'cat', collectedAt: morning.toISOString() });
  assert.throws(() => validateState(earlyClaim), /存档/);
  assert.throws(() => validateState({ ...state, game: { ...state.game, kind: 'pusher', progress: 0 } }), /存档/);
  assert.throws(() => moveClaw(state, state.game!.id, NaN, morning), /位置无效/);
  assert.equal(moveClaw(state, state.game!.id, 200, morning).game!.claw!.position, 100);
  assert.equal(attemptClaw(state, state.game!.id, -1, morning).game!.claw!.attempts, 0);
  assert.equal(attemptClaw(state, 'stale-game', 0, morning).game!.claw!.attempts, 0);
  const exhausted = addActiveTime(state, 480, morning);
  assert.throws(() => moveClaw(exhausted, state.game!.id, 0, morning), /进度已经保存/);
  assert.throws(() => attemptClaw(exhausted, state.game!.id, 0, morning), /进度已经保存/);
  validateState(state);
});

test('physical pusher starts a seeded scene and cannot complete through progress clicks', () => {
  let state = startGame(finish(startPlan(createChineseState(), items, morning)), 'cat', morning, 'pusher');
  const game = state.game!;
  assert.deepEqual(game.pusher, createPusherScene(Number.parseInt(game.id.slice(0, 8), 16)));
  assert.equal(game.progress, undefined);
  for (let progress = 0; progress < 3; progress++) state = advanceGame(state, game.id, progress, morning);
  assert.deepEqual(state.game!.pusher, game.pusher);
  assert.equal(state.game!.progress, undefined);
  state.game!.progress = 3;
  assert.throws(() => claimGame(state, morning), /完成这局/);
  assert.equal(state.collections.length, 0);
  assert.equal(state.balance, 0);
  validateState(state);
});

test('physical pusher snapshots clone the simulation and resume the paid game across reload and midnight', () => {
  const original = startGame(finish(startPlan(createChineseState(), items, morning)), 'cat', morning, 'pusher');
  const id = original.game!.id;
  const scene = structuredClone(original.game!.pusher!);
  dropPusherCoin(scene, 30);
  for (let frame = 0; frame < 12; frame++) stepPusher(scene, 1 / 60);
  const saved = savePusher(original, id, scene, morning);
  assert.equal(original.game!.pusher!.drops, 0);
  assert.deepEqual(saved.game!.pusher, scene);
  assert.notStrictEqual(saved.game!.pusher, scene);
  assert.notStrictEqual(saved.game!.pusher!.coins, scene.coins);
  dropPusherCoin(scene, 70);
  assert.equal(saved.game!.pusher!.drops, 1);
  const restored: State = JSON.parse(JSON.stringify(saved));
  validateState(restored);
  const resumed = startGame(restored, 'dog', tomorrow, 'claw');
  assert.equal(resumed.game!.id, id);
  assert.deepEqual(resumed.game!.pusher, saved.game!.pusher);
  assert.deepEqual(resumed.ledger, saved.ledger);
  assert.equal(resumed.balance, 0);
  assert.equal(getDayUsage(resumed, tomorrow).gameId, undefined);
  validateState(resumed);
});

test('physical pusher ignores stale, regressing and post-claim snapshots', () => {
  let state = startGame(finish(startPlan(createChineseState(), items, morning)), 'cat', morning, 'pusher');
  const id = state.game!.id;
  const scene = { ...structuredClone(state.game!.pusher!), tick: 2.5, drops: 2, fallen: 1 };
  state = savePusher(state, id, scene, morning);
  assert.strictEqual(savePusher(state, 'stale-game', scene, morning), state);
  for (const patch of [{ tick: 2 }, { drops: 1 }, { fallen: 0 }]) {
    assert.strictEqual(savePusher(state, id, { ...scene, ...patch }, morning), state);
  }
  state = savePusher(state, id, { ...scene, tick: 3, fallen: PUSHER_GOAL }, morning);
  state = claimGame(state, morning);
  assert.strictEqual(savePusher(state, id, { ...scene, tick: 4, fallen: PUSHER_GOAL + 1 }, morning), state);
  const claw = startGame(finish(startPlan(createChineseState(), items, morning)), 'dog', morning);
  assert.strictEqual(savePusher(claw, claw.game!.id, scene, morning), claw);
  validateState(state);
});

test('physical pusher requires eight fallen coins and awards the collection exactly once', () => {
  let state = startGame(finish(startPlan(createChineseState(), items, morning)), 'rabbit', morning, 'pusher');
  const id = state.game!.id;
  state = savePusher(state, id, { ...state.game!.pusher!, fallen: PUSHER_GOAL - 1 }, morning);
  assert.throws(() => claimGame(state, morning), /完成这局/);
  state = savePusher(state, id, { ...state.game!.pusher!, fallen: PUSHER_GOAL }, morning);
  state = claimGame(state, morning);
  state = claimGame(JSON.parse(JSON.stringify(state)), morning);
  assert.equal(state.collections.length, 1);
  assert.equal(state.collections[0].toyId, 'rabbit');
  assert.equal(state.ledger.filter(entry => entry.kind === 'spend').length, 1);
  assert.equal(state.balance, 0);
  validateState(state);
});

test('physical pusher rejects malformed snapshots and imported premature prizes', () => {
  const state = startGame(finish(startPlan(createChineseState(), items, morning)), 'cat', morning, 'pusher');
  const scene = state.game!.pusher!;
  const coin = scene.coins[0];
  const malformed: unknown[] = [null, {}, { ...scene, coins: null },
    ...[{ tick: -1 }, { tick: Infinity }, { drops: 0.5 }, { fallen: -1 }, { fallen: Number.MAX_SAFE_INTEGER + 1 }, { nextId: 0 }].map(patch => ({ ...scene, ...patch })),
    ...[{ x: NaN }, { y: Infinity }, { vx: '0' }, { vy: -Infinity }, { id: 1.5 }, { id: -1 }, { level: 2 }, { fall: -1 }, { fall: 2 },
      { z: NaN }, { vz: Infinity }, { chute: -1 }, { tilt: Infinity }, { spin: 'fast' }, { support: coin.id }, { support: scene.nextId },
    ].map(patch => ({ ...scene, coins: [{ ...coin, ...patch }] })),
    { ...scene, coins: [{ ...coin, id: 1, support: 2 }, { ...coin, id: 2, support: 1 }] },
    { ...scene, coins: [coin, coin] },
    { ...scene, nextId: 122, coins: Array.from({ length: 121 }, (_, id) => ({ ...coin, id })) },
  ];
  for (const invalid of malformed) {
    assert.throws(() => savePusher(state, state.game!.id, invalid as PusherScene, morning), /进度无效/);
    assert.throws(() => validateState({ ...state, game: { ...state.game, pusher: invalid } }), /存档/);
  }
  const earlyClaim = structuredClone(state);
  earlyClaim.game!.claimedAt = morning.toISOString();
  earlyClaim.collections.push({ gameId: state.game!.id, toyId: 'cat', collectedAt: morning.toISOString() });
  assert.throws(() => validateState(earlyClaim), /存档/);
  assert.throws(() => validateState({ ...state, game: { ...state.game, kind: 'bubbles', progress: 0 } }), /存档/);
  validateState(state);
});

test('a legacy partial pusher may adopt physics without losing its paid game or bypassing the goal', () => {
  let state = startGame(finish(startPlan(createChineseState(), items, morning)), 'cat', morning, 'pusher');
  delete state.game!.pusher;
  state.game!.progress = 2;
  validateState(state);
  const id = state.game!.id;
  const ledger = structuredClone(state.ledger);
  state = savePusher(state, id, createPusherScene(), morning);
  assert.deepEqual(state.ledger, ledger);
  assert.equal(state.balance, 0);
  state = advanceGame(state, id, 2, morning);
  assert.equal(state.game!.progress, 2);
  assert.throws(() => claimGame(state, morning), /完成这局/);
  validateState(JSON.parse(JSON.stringify(state)));
});


test('Mandarin offers sentence listening and sound matching without treating it as character recognition', () => {
  const content = JSON.parse(readFileSync(new URL('../src/trial-content.json', import.meta.url), 'utf8')).items as TrialItem[];
  for (const recognition of [false, true]) {
    let state = createInitialState(); state.settings.language = 'zh-CN'; state.settings.recognition = recognition;
    const kinds = new Set<string>();
    for (let round = 0; round < 8; round++) {
      state = startPlan(state, content, morning);
      for (const task of state.plan!.tasks) {
        kinds.add(task.matchMode === 'listen' ? 'listen' : task.kind);
        if (!recognition) assert.notEqual(task.ability, 'zh_character_recognition');
        if (task.matchMode === 'listen') {
          assert.equal(task.ability, 'zh_listening');
        }
      }
      state = finish(state); validateState(JSON.parse(JSON.stringify(state)));
    }
    assert.ok(kinds.has('sentence') && kinds.has('listen'));
    assert.ok(state.events.some(e => e.taskKind === 'match' && e.ability === 'zh_listening' && e.promptPlayed));
    if (recognition) assert.ok(kinds.has('character') && kinds.has('match'));
  }
});

test('all 117 English items enter lessons and matching while Chinese is also complete', () => {
  const content = JSON.parse(readFileSync(new URL('../src/trial-content.json', import.meta.url), 'utf8')).items as TrialItem[];
  let state = createInitialState();
  const matched = new Set<string>();
  const sentences = new Set<string>();
  for (let round = 0; round < 175; round++) {
    const moment = new Date(morning.getTime() + round * 60000);
    state = startPlan(state, content, moment);
    for (const task of state.plan!.tasks) {
      if (task.kind === 'match') task.optionIds.forEach(id => matched.add(id));
      if (task.kind === 'sentence') sentences.add(task.itemId);
      assert.ok(task.optionIds.every(id => id === 'empty-cup' || content.some(item => item.id === id && item.language === 'en-US')));
    }
    state = finish(state, moment);
  }
  const english = content.filter(item => item.language === 'en-US');
  assert.equal(english.length, 117);
  assert.equal(Object.keys(state.introduced).length, 117);
  assert.deepEqual(english.filter(item => expansionConcepts.includes(item.concept as typeof expansionConcepts[number])).filter(item => !matched.has(item.id)).map(item => item.concept), []);
  assert.ok(english.some(item => expansionConcepts.includes(item.concept as typeof expansionConcepts[number]) && sentences.has(item.id)));
  const pending = startPlan(state, content, morning);
  pending.settings.language = 'zh-CN';
  assert.deepEqual(startPlan(pending, content, morning).plan, pending.plan);
  let chinese = finish(pending);
  for (let round = 0; round < 110; round++) chinese = finish(startPlan(chinese, content, morning));
  assert.equal(Object.keys(chinese.introduced).filter(id => id.startsWith('zh')).length, 117);
  assert.equal(chinese.plan!.language, 'zh-CN');
  validateState(JSON.parse(JSON.stringify(chinese)));
});

test('new English prizes work in all three games and an English bubble round survives switching to Chinese', () => {
  const englishItems = items.map(item => ({ ...item, language: 'en-US' as const }));
  const rewarded = finish(startPlan(createInitialState(), englishItems, morning));
  for (const kind of ['claw', 'pusher', 'bubbles'] as const) for (const toy of [...expansionConcepts,...themeConcepts,...oceanConcepts,...dailyConcepts,...wardrobeGardenConcepts,...vehicleConcepts,...familyVehicleConcepts,...homeNatureConcepts]) {
    let state = startGame(rewarded, toy, morning, kind);
    const id = state.game!.id;
    assert.equal(state.game!.language, 'en-US');
    state.settings.language = 'zh-CN';
    state = JSON.parse(JSON.stringify(state));
    validateState(state);
    assert.deepEqual(startGame(state, 'cat', morning, 'claw').game, state.game);
    if (kind === 'claw') state = catchClaw(state);
    else if (kind === 'pusher') state = savePusher(state, id, { ...state.game!.pusher!, fallen: PUSHER_GOAL }, morning);
    else {
      assert.equal(state.game!.bubblePoolVersion, 10);
      const rounds = [0, 1, 2].map(progress => getBubbleRound(id, toy, progress, state.game!.bubblePoolVersion, state.game!.language));
      assert.ok(rounds.some(round => round.target === toy));
      for (const [progress, round] of rounds.entries()) {
        const wrong = round.choices.find(choice => choice !== round.target)!;
        assert.equal(answerBubble(state, id, progress, wrong, morning).game!.progress, progress);
        state = answerBubble(state, id, progress, round.target, morning);
        assert.equal(state.game!.progress, progress + 1);
      }
    }
    state = claimGame(state, morning);
    assert.equal(state.collections[0].toyId, toy);
    assert.equal(claimGame(state, morning).collections.length, 1);
    validateState(state);
    const chinese = structuredClone(rewarded);
    chinese.settings.language = 'zh-CN';
    assert.equal(startGame(chinese, toy, morning, kind).game!.toyId, toy);
  }
});

test('versioned bubble saves reject missing languages and unknown pool versions', () => {
  const englishItems = items.map(item => ({ ...item, language: 'en-US' as const }));
  const state = startGame(finish(startPlan(createInitialState(), englishItems, morning)), 'cow', morning, 'bubbles');
  for (const patch of [{ language: undefined }, { language: 'xx' }, { bubblePoolVersion: 11 }, { bubblePoolVersion: null }, { bubblePoolVersion: undefined }]) {
    assert.throws(() => validateState({ ...state, game: { ...state.game, ...patch } }), /存档/);
  }
});


test('room moves preserve rewards and collection, clamp to region, and survive JSON restore', () => {
  let state = createInitialState();
  const content = JSON.parse(readFileSync(new URL('../src/trial-content.json', import.meta.url), 'utf8')).items as TrialItem[];
  for (const id of ['car', 'star']) {
    state = finish(startPlan(state, content, morning));
    state = claimGame(catchClaw(startGame(state, id, morning)), morning);
  }
  assert.equal(state.scenePositions, undefined);
  validateState(state);
  const moved = moveRoomToy(moveRoomToy(state, 'car', { x: 900, y: -90 }), 'star', { x: -90, y: 900 });
  assert.deepEqual(moved.scenePositions, { car: { x: 64, y: 66 }, star: { x: 21, y: 57 } });
  const { scenePositions, ...rest } = moved;
  assert.deepEqual(rest, state);
  assert.equal(state.scenePositions, undefined);
  const restored = JSON.parse(JSON.stringify(moved));
  validateState(restored);
  assert.deepEqual(restored.scenePositions, scenePositions);
  assert.deepEqual(moveRoomToy(restored, 'car', { x: 50, y: 80 }).scenePositions?.star, scenePositions?.star);
  assert.throws(() => moveRoomToy(state, 'cat', { x: 20, y: 50 }));
  assert.throws(() => moveRoomToy(state, 'car', { x: NaN, y: 50 }));
  assert.throws(() => moveRoomToy(state, 'car', { x: 30, y: Infinity }));
  for (const invalid of [null, [], { car: { x: 500, y: 80 } }, { star: { x: 50, y: 90 } }, { cat: { x: 24, y: 56 } }, { car: { x: '30', y: 80 } }, { car: { x: NaN, y: 80 } }]) {
    assert.throws(() => validateState({ ...state, scenePositions: invalid }));
  }
});
