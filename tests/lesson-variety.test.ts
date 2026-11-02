import test from 'node:test';
import assert from 'node:assert/strict';
import { answerMatch, completeTask, createInitialState, recordAttempt, startPlan, validateState, type State, type TrialItem } from '../src/engine.ts';

const now = new Date('2026-10-21T02:00:00Z');
const english: TrialItem[] = ['cat', 'dog', 'fish', 'bird', 'ball', 'book', 'water', 'rice'].map(concept => ({
  id: `en-${concept}`, concept: concept as TrialItem['concept'], language: 'en-US', target: concept,
  label: concept, prompt: `Find ${concept}`, example: `I see ${concept}`,
  audio: { label: `/audio/${concept}.mp3`, prompt: `/audio/find-${concept}.mp3`, example: `/audio/see-${concept}.mp3` }, offlinePrompt: concept, theme: 'test',
}));
const chinese = english.map(item => ({ ...item, id: item.id.replace('en-', 'zh-'), language: 'zh-CN' as const }));

function completeCurrent(state: State): State {
  const task = state.plan!.tasks[state.plan!.index];
  if (task.kind === 'match') return task.optionIds.reduce((next, id) => answerMatch(next, task.id, id, id, now, true), state);
  return completeTask(state, { taskId: task.id, outcome: 'independent_correct', promptPlayed: true }, now);
}
function completedRounds(count: number, state = createInitialState(), items = english): State {
  for (let i = 0; i < count; i++) {
    state = startPlan(state, items, now);
    while (!state.plan!.completedAt) state = completeCurrent(state);
  }
  validateState(state);
  return state;
}
function atMatch(): State {
  let state = startPlan(completedRounds(2), english, now);
  while (state.plan!.tasks[state.plan!.index].kind !== 'match') state = completeCurrent(state);
  return state;
}

test('first rounds use two choices; later rounds use familiar distractors and two familiar word-picture pairs', () => {
  const first = startPlan(createInitialState(), english, now);
  assert.deepEqual(first.plan!.tasks.map(task => task.kind), ['learn', 'learn', 'choice', 'choice', 'choice']);
  assert.ok(first.plan!.tasks.filter(task => task.kind === 'choice').every(task => task.optionIds.length === 2));
  const prior = completedRounds(2);
  const known = new Set(Object.keys(prior.introduced));
  let later = startPlan(prior, english, now);
  const [a, b, choiceA, choiceB, match] = later.plan!.tasks;
  assert.equal(choiceA.optionIds.length, 3);
  assert.equal(choiceB.optionIds.length, 3);
  for (const id of choiceA.optionIds.filter(id => id !== a.itemId && id !== b.itemId)) assert.ok(known.has(id));
  assert.equal(match.kind, 'match');
  assert.equal(match.ability, 'en_word_recognition');
  assert.ok(match.optionIds.every(id => known.has(id)));
  later = completeCurrent(completeCurrent(later));
  assert.ok(later.plan!.tasks[2].optionIds.every(id => later.introduced[id]));
  validateState(later);
});

test('English sentence listening starts after three completed rounds and still needs played audio', () => {
  let state = startPlan(completedRounds(3), english, now);
  assert.equal(state.plan!.tasks[3].kind, 'sentence');
  while (state.plan!.index < 3) state = completeCurrent(state);
  const task = state.plan!.tasks[3];
  assert.equal(task.ability, 'en_listening');
  assert.ok(english.find(item => item.id === task.itemId)!.audio.example);
  state = completeTask(state, { taskId: task.id, outcome: 'independent_correct', promptPlayed: false }, now);
  assert.equal(state.events.at(-1)!.outcome, 'assisted');
  validateState(state);
});

test('progression is per language and Chinese matching follows the recognition setting', () => {
  const englishProgress = completedRounds(3);
  englishProgress.settings.language = 'zh-CN';
  const firstChinese = startPlan(englishProgress, [...english, ...chinese], now);
  assert.ok(firstChinese.plan!.tasks.every(task => task.kind !== 'match' && task.kind !== 'sentence'));
  assert.equal(firstChinese.plan!.tasks[2].optionIds.length, 2);
  const initial = createInitialState();
  initial.settings.language = 'zh-CN';
  const progress = completedRounds(2, initial, chinese);
  const enabled = startPlan(progress, chinese, now);
  assert.equal(enabled.plan!.tasks[4].kind, 'match');
  assert.equal(enabled.plan!.tasks[4].ability, 'zh_character_recognition');
  progress.settings.recognition = false;
  const disabled = startPlan(progress, chinese, now);
  assert.equal(disabled.plan!.tasks[4].kind, 'match');
  assert.equal(disabled.plan!.tasks[4].matchMode, 'listen');
  assert.equal(disabled.plan!.tasks[4].ability, 'zh_listening');
  assert.equal(disabled.plan!.tasks[4].optionIds.length, 2);
  validateState(enabled);
  validateState(disabled);
});

test('matching persists the first pair, rejects premature completion, and rewards a completed round once', () => {
  let state = atMatch();
  const task = state.plan!.tasks[4];
  const [first, second] = [...task.optionIds].reverse();
  const beforeEvents = state.events.length;
  const beforeBalance = state.balance;
  state = completeTask(state, { taskId: task.id, outcome: 'independent_correct', promptPlayed: true }, now);
  assert.equal(state.plan!.index, 4);
  state = answerMatch(state, task.id, first, first, now);
  assert.deepEqual(state.plan!.tasks[4].matchedIds, [first]);
  assert.equal(state.events.length, beforeEvents);
  state = JSON.parse(JSON.stringify(state));
  validateState(state);
  const resumed = startPlan(state, english, now);
  assert.deepEqual(resumed.plan, state.plan);
  state = answerMatch(resumed, task.id, first, first, now);
  assert.equal(state.plan!.tasks[4].attempts, 1);
  state = answerMatch(state, task.id, second, second, now);
  assert.equal(state.plan!.index, 5);
  assert.equal(state.balance, beforeBalance + 1);
  assert.equal(state.events.length, beforeEvents + 1);
  assert.equal(state.events.at(-1)!.contentId, first);
  assert.equal(state.events.at(-1)!.outcome, 'independent_correct');
  assert.equal(state.events.at(-1)!.promptPlayed, false);
  assert.equal(state.events.at(-1)!.attempts, 2);
  assert.deepEqual(answerMatch(state, task.id, second, second, now), state);
  validateState(JSON.parse(JSON.stringify(state)));
});

test('wrong matches and explicit help survive reload and cannot become independent evidence', () => {
  for (const assistedBy of ['mistake', 'help']) {
    let state = atMatch();
    const task = state.plan!.tasks[4];
    const [a, b] = task.optionIds;
    state = assistedBy === 'mistake' ? answerMatch(state, task.id, a, b, now) : recordAttempt(state, task.id, now);
    assert.equal(state.plan!.tasks[4].hintUsed, true);
    assert.deepEqual(state.plan!.tasks[4].matchedIds, []);
    state = JSON.parse(JSON.stringify(state));
    validateState(state);
    state = answerMatch(answerMatch(state, task.id, a, a, now), task.id, b, b, now);
    assert.equal(state.events.at(-1)!.outcome, 'assisted');
    assert.equal(state.events.at(-1)!.attempts, 3);
    validateState(state);
  }
});

test('matching ignores unknown, stale and already used card IDs', () => {
  let state = atMatch();
  const task = state.plan!.tasks[4];
  const [a, b] = task.optionIds;
  for (const [taskId, wordId, pictureId] of [[task.id, 'unknown', a], [task.id, a, 'unknown'], ['old-task', a, a]]) {
    assert.deepEqual(answerMatch(state, taskId, wordId, pictureId, now), state);
  }
  state = answerMatch(state, task.id, a, a, now);
  for (const [wordId, pictureId] of [[a, b], [b, a], [a, a]]) assert.deepEqual(answerMatch(state, task.id, wordId, pictureId, now), state);
  validateState(state);
});

test('import validation rejects malformed matching progress, bad ability and inflated choice counts', () => {
  const state = atMatch();
  const task = state.plan!.tasks[4];
  for (const patch of [
    { matchedIds: undefined }, { matchedIds: ['unknown'] }, { matchedIds: [task.optionIds[0], task.optionIds[0]], attempts: 2 },
    { matchedIds: [...task.optionIds], attempts: 2 }, { matchedIds: [task.optionIds[0]], attempts: 0 },
    { ability: 'en_listening' }, { optionIds: [task.itemId, 'unknown'] },
  ]) {
    const invalid = structuredClone(state);
    Object.assign(invalid.plan!.tasks[4], patch);
    assert.throws(() => validateState(invalid), /存档/);
  }
  const tooMany = structuredClone(state);
  tooMany.plan!.tasks[2].optionIds = ['en-cat', 'en-dog', 'en-fish', 'en-bird'];
  assert.throws(() => validateState(tooMany), /存档/);
  const completed = completeCurrent(state);
  completed.events.at(-1)!.contentId = 'unknown';
  assert.throws(() => validateState(completed), /存档/);
});

test('old two-option plans remain valid and are not rebuilt when resumed', () => {
  let state = startPlan(createInitialState(), english, now);
  state = completeCurrent(state);
  const restored: State = JSON.parse(JSON.stringify(state));
  assert.ok(restored.plan!.tasks.every(task => task.matchedIds === undefined));
  validateState(restored);
  const resumed = startPlan(restored, english, now);
  assert.deepEqual(resumed.plan, state.plan);
  assert.equal(resumed.schemaVersion, 1);
});

test('visual match evidence can omit audio while old and new character listening evidence cannot', () => {
  const initial = createInitialState();
  initial.settings.language = 'zh-CN';
  const firstRound = completedRounds(1, initial, chinese);
  assert.equal(firstRound.events.at(-1)!.taskKind, 'character');
  for (const taskKind of [undefined, 'character'] as const) {
    const invalid = structuredClone(firstRound);
    invalid.events.at(-1)!.taskKind = taskKind;
    invalid.events.at(-1)!.promptPlayed = false;
    assert.throws(() => validateState(invalid), /存档/);
  }
  const legacy = structuredClone(firstRound);
  for (const event of legacy.events) delete event.taskKind;
  validateState(legacy);
  const matched = completedRounds(2, firstRound, chinese);
  assert.equal(matched.events.at(-1)!.taskKind, 'match');
  assert.equal(matched.events.at(-1)!.ability, 'zh_character_recognition');
  assert.equal(matched.events.at(-1)!.outcome, 'independent_correct');
  assert.equal(matched.events.at(-1)!.promptPlayed, false);
  validateState(matched);
});

test('sixth English round introduces listening pairs, requires heard audio and preserves partial progress', () => {
  let state = startPlan(completedRounds(5), english, now);
  while (state.plan!.index < 4) state = completeCurrent(state);
  const task = state.plan!.tasks[4], [a,b] = task.optionIds;
  assert.equal(task.matchMode, 'listen');
  assert.equal(task.ability, 'en_listening');
  assert.deepEqual(answerMatch(state, task.id, a, a, now), state);
  state = answerMatch(state, task.id, a, a, now, true);
  assert.deepEqual(state.plan!.tasks[4].matchedIds, [a]);
  state = JSON.parse(JSON.stringify(state)); validateState(state);
  state = answerMatch(state, task.id, b, a, now, true);
  assert.equal(state.plan!.index, 4);
  state = answerMatch(state, task.id, b, b, now, true);
  validateState(state);
  assert.equal(state.events.at(-1)!.ability, 'en_listening');
  assert.equal(state.events.at(-1)!.promptPlayed, true);
  assert.equal(state.events.filter(e => e.taskId === task.id).length, 1);
  const next = startPlan(state, english, now);
  assert.equal(next.plan!.tasks[4].matchMode, undefined);
  const malformed = structuredClone(next); malformed.plan!.tasks[0].matchMode = 'listen';
  assert.throws(() => validateState(malformed));
});
