import { makeRoomPages as legacyRoomPages, roomMoveBounds as legacyRoomBounds } from './rooms-v28.ts';
import { makeRoomPages, roomMoveBounds, clampRoomPosition, type RoomPosition } from './rooms.ts';
import { createPusherScene, type PusherScene } from './pusher.ts';
import { bubbleConcepts, getBubbleRound } from './bubbles.ts';
import { getStoryRound } from './storyGames.ts';
import { getRecipeRound, isRecipeId, type RecipeId } from './recipes.ts';
import { racePlan, RACE_REQUIRED_SECONDS, type PandaRace } from './pandaRace.ts';

import { expansionConcepts, themeConcepts, oceanConcepts, dailyConcepts, wardrobeGardenConcepts, vehicleConcepts, familyVehicleConcepts, isAmbiguousVehiclePair, type Concept } from './concepts.ts';
export type Language = 'zh-CN' | 'en-US';
export type { Concept } from './concepts.ts';
export interface TrialItem {
  id: string;
  concept: Concept;
  language: Language;
  target: string;
  label: string;
  prompt: string;
  example: string;
  pictureNote?: string;
  actionHint?: string;
  characterPrompt?: string;
  audio: { label: string; prompt: string; example: string; character?: string };
  offlinePrompt: string;
  theme: string;
}
export interface Settings {
  language: Language;
  dailyNewCap: 0 | 1 | 2;
  budgetSeconds: 180 | 300 | 480 | 600;
  recognition: boolean;
  parentManaged?: boolean;
}
export type Ability = 'exposure' | 'zh_listening' | 'en_listening' | 'zh_character_recognition' | 'en_word_recognition';
export type Outcome = 'introduced' | 'independent_correct' | 'assisted';
export interface Task {
  id: string;
  kind: 'learn' | 'choice' | 'character' | 'match' | 'sentence';
  itemId: string;
  optionIds: string[];
  ability: Ability;
  attempts: number;
  hintUsed: boolean;
  promptPlayed: boolean;
  matchedIds?: string[];
  matchMode?: 'listen';
  outcome?: Outcome;
  completedAt?: string;
}
export interface Plan {
  id: string;
  language: Language;
  createdAt: string;
  tasks: Task[];
  index: number;
  completedAt?: string;
  rewarded: boolean;
}
export interface DayUsage {
  activeSeconds: number;
  introducedIds: string[];
  rewardPlanId?: string;
  gameId?: string;
}
export interface LearningEvent {
  eventId: string;
  taskId: string;
  taskKind?: Task['kind'];
  sessionId: string;
  contentId: string;
  ability: Ability;
  occurredAt: string;
  dayKey: string;
  outcome: Outcome;
  attempts: number;
  hintUsed: boolean;
  promptPlayed: boolean;
}
export interface LedgerEntry {
  id: string;
  kind: 'reward' | 'spend' | 'race-reward';
  delta: 1 | -1;
  dayKey: string;
  createdAt: string;
  planId?: string;
  gameId?: string;
  raceId?: string;
}
export type GameKind = 'claw' | 'pusher' | 'bubbles' | 'hide' | 'kitchen';
export interface Game {
  id: string;
  toyId: string;
  startedAt: string;
  dayKey: string;
  claimedAt?: string;
  kind?: GameKind;
  progress?: 0 | 1 | 2 | 3;
  claw?: { position: number; target: number; attempts: number; caught: boolean };
  pusher?: PusherScene;
  story?: { version: 1 | 2 | 3 | 4; opened: number[] };
  cooking?: { recipe: RecipeId; served: boolean };
  bubbleMode?: 'listen-find';
  bubblePoolVersion?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  language?: Language;
}
export interface Collection { toyId: string; gameId: string; collectedAt: string }
export interface State {
  schemaVersion: 1;
  settings: Settings;
  plan: Plan | null;
  balance: number;
  ledger: LedgerEntry[];
  game: Game | null;
  race?: PandaRace;
  collections: Collection[];
  roomPositions?: Record<string, RoomPosition>;
  scenePositions?: Record<string, RoomPosition>;
  events: LearningEvent[];
  introduced: Record<string, { firstAt: string; dayKey: string }>;
  dayUsage: Record<string, DayUsage>;
  latestDayKey: string;
}
export const TOY_IDS = ['bear', 'rabbit', 'cat', 'dog', 'duck', 'sheep', 'horse', 'fish', 'bird', 'ball', 'car', 'boat', 'book', 'water', 'rice', 'apple', 'banana', 'orange', 'strawberry', 'bus', 'sun', 'moon', 'red-monster', ...expansionConcepts.filter(concept => concept !== 'horse' && concept !== 'sheep'), ...themeConcepts, ...oceanConcepts, ...dailyConcepts.filter(concept => concept !== 'boat'), ...wardrobeGardenConcepts, ...vehicleConcepts, ...familyVehicleConcepts] as const;
export const CLAW_CATCH_RADIUS = 12;
export const PUSHER_GOAL = 8;
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
function createId(): string {
  // Unlike randomUUID, getRandomValues also works on the iPad's local HTTP address.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function dayKey(now: Date = new Date()): string {
  const parts = dateFormatter.formatToParts(now);
  return ['year', 'month', 'day'].map(part => parts.find(value => value.type === part)!.value).join('-');
}
export function createInitialState(): State {
  return {
    schemaVersion: 1,
    settings: { language: 'en-US', dailyNewCap: 2, budgetSeconds: 480, recognition: true, parentManaged: true },
    plan: null, balance: 0, ledger: [], game: null, collections: [], events: [],
    introduced: {}, dayUsage: {}, latestDayKey: '',
  };
}
export function getDayUsage(state: State, now: Date = new Date()): DayUsage {
  return state.dayUsage[dayKey(now)] ?? { activeSeconds: 0, introducedIds: [] };
}
export function startPandaRace(state: State, picked: number, now: Date = new Date()): State {
  if (!Number.isInteger(picked) || picked < 0 || picked > 4) throw new Error('先选一只你想支持的小猪。');
  if (state.race && !state.race.settledAt) return state;
  if (state.game && !state.game.claimedAt) throw new Error('先把正在玩的小游戏完成，再来赛跑吧。');
  requireTime(state, now);
  if (getRemainingSeconds(state, now) < RACE_REQUIRED_SECONDS) throw new Error('剩余时间不够一场赛跑，请爸爸妈妈调整后再来玩。');
  const next = nextState(state, now);
  next.race = { id: createId(), seed: crypto.getRandomValues(new Uint32Array(1))[0], picked, language: state.settings.language, startedAt: now.toISOString() };
  return next;
}
export function finishPandaRace(state: State, raceId: string, now: Date = new Date()): State {
  const race = state.race;
  if (!race || race.id !== raceId || race.settledAt || now.getTime() - Date.parse(race.startedAt) < racePlan(race.seed).duration) return state;
  const next = nextState(state, now);
  next.race!.settledAt = now.toISOString();
  if (race.picked === racePlan(race.seed).order[0] && !next.ledger.some(entry => entry.raceId === race.id)) {
    next.ledger.push({ id: `race:${race.id}`, kind: 'race-reward', delta: 1, raceId: race.id, dayKey: dayKey(now), createdAt: now.toISOString() });
    next.balance++;
  }
  return next;
}
export function getRemainingSeconds(state: State, now: Date = new Date()): number {
  if (state.settings.parentManaged !== false) return Infinity;
  return Math.max(0, state.settings.budgetSeconds - getDayUsage(state, now).activeSeconds);
}
function nextState(state: State, now: Date): State {
  const today = dayKey(now);
  if (state.latestDayKey && today < state.latestDayKey) throw new Error('设备日期早于已保存的日期，请家长检查日期设置。');
  const next = structuredClone(state);
  next.latestDayKey = today;
  next.dayUsage[today] ??= { activeSeconds: 0, introducedIds: [] };
  return next;
}
function requireTime(state: State, now: Date): void {
  if (getRemainingSeconds(state, now) <= 0) throw new Error('今天先玩到这里，进度已经保存，明天可以接着玩。');
}
function makeTask(planId: string, index: number, item: TrialItem, kind: Task['kind'], options: string[]): Task {
  return {
    id: `${planId}:task:${index}`, kind, itemId: item.id,
    optionIds: (kind === 'choice' || kind === 'sentence') && item.concept === 'water' ? [item.id, 'empty-cup'] : [...options],
    ability: kind === 'learn' ? 'exposure' : kind === 'match' ? item.language === 'zh-CN' ? 'zh_character_recognition' : 'en_word_recognition' : kind === 'character' ? 'zh_character_recognition' : item.language === 'zh-CN' ? 'zh_listening' : 'en_listening',
    attempts: 0, hintUsed: false, promptPlayed: false,
    ...(kind === 'match' ? { matchedIds: [] } : {}),
  };
}
// A changed cap can turn a pending new item into a familiar demonstration without discarding completed slots.
function presentCurrent(state: State, now: Date): void {
  const task = state.plan?.tasks[state.plan.index];
  if (!task) return;
  const today = dayKey(now);
  const usage = state.dayUsage[today];
  if (!state.introduced[task.itemId]) {
    if (state.settings.parentManaged === false && usage.introducedIds.length >= state.settings.dailyNewCap) {
      const known = state.plan!.tasks.find(candidate => state.introduced[candidate.itemId]);
      if (!known) throw new Error('今天的新内容额度已用完，可以明天继续，或由家长选择已经接触过的内容。');
      task.itemId = known.itemId;
      task.kind = 'learn';
      task.ability = 'exposure';
      task.optionIds = [known.itemId];
      delete task.matchedIds;
      delete task.matchMode;
    } else {
      state.introduced[task.itemId] = { firstAt: now.toISOString(), dayKey: today };
      usage.introducedIds.push(task.itemId);
    }
  }
  if (task.kind !== 'learn' && task.optionIds.some(id => id !== 'empty-cup' && !state.introduced[id])) {
    task.kind = 'learn';
    task.ability = 'exposure';
    task.optionIds = [task.itemId];
    delete task.matchedIds;
      delete task.matchMode;
  }
}
function dueForReview(state: State, item: TrialItem, today: string): boolean {
  const events = state.events.filter(event => event.contentId === item.id && event.ability !== 'exposure');
  const last = events.at(-1);
  if (!last || last.outcome === 'assisted') return true;
  const independentDays = new Set(events.filter(event => event.outcome === 'independent_correct').map(event => event.dayKey)).size;
  const days = [1, 3, 7][Math.min(Math.max(independentDays - 1, 0), 2)];
  return (Date.parse(`${today}T00:00:00+08:00`) - Date.parse(`${last.dayKey}T00:00:00+08:00`)) / 86400000 >= days;
}
export function startPlan(state: State, items: TrialItem[], now: Date = new Date()): State {
  const next = nextState(state, now);
  requireTime(next, now);
  if (next.plan && !next.plan.completedAt) {
    presentCurrent(next, now);
    return next;
  }
  const today = dayKey(now);
  const usage = next.dayUsage[today];
  const available = items.filter(item => item.language === next.settings.language);
  const lastSeen = (id: string) => next.events.filter(event => event.contentId === id).at(-1)?.occurredAt ?? next.introduced[id].firstAt;
  const known = available.filter(item => next.introduced[item.id]).sort((a, b) => lastSeen(a.id).localeCompare(lastSeen(b.id)));
  const freshLimit = next.settings.parentManaged === false ? Math.max(0, next.settings.dailyNewCap - usage.introducedIds.length) : 2;
  const fresh = available.filter(item => !next.introduced[item.id]).slice(0, freshLimit);
  const due = known.filter(item => dueForReview(next, item, today));
  const selected = [...due.slice(0, fresh.length ? 1 : 2), ...fresh, ...known].filter((item, index, list) => list.findIndex(other => other.id === item.id) === index).slice(0, 2);
  if (!selected.length) { next.plan = null; return next; }
  const id = createId();
  const [a, b] = selected;
  const options = selected.map(item => item.id);
  const languageIds = new Set(available.map(item => item.id));
  const languageSessions = new Set(next.events.filter(event => languageIds.has(event.contentId)).map(event => event.sessionId));
  const completedRounds = next.ledger.filter(entry => entry.kind === 'reward' && languageSessions.has(entry.planId!)).length;
  const progressed = completedRounds >= 2 && known.length >= 3;
  if (progressed) {
    const distractor = known.find(item => !options.includes(item.id));
    if (distractor) options.push(distractor.id);
  }
  let tasks: Task[];
  if (!b) {
    tasks = Array.from({ length: 5 }, (_, index) => makeTask(id, index, a, 'learn', [a.id]));
  } else {
    const character = a.language === 'zh-CN' && next.settings.recognition;
    const quiz = (index: number, item: TrialItem, kind: Task['kind']) => {
      const distinct = options.filter(option => !isAmbiguousVehiclePair(item.concept, available.find(candidate => candidate.id === option)!.concept));
      return makeTask(id, index, item, distinct.length >= 2 ? kind : 'learn', distinct);
    };
    tasks = [
      makeTask(id, 0, a, 'learn', [a.id]), makeTask(id, 1, b, 'learn', [b.id]),
      quiz(2, a, 'choice'), quiz(3, b, completedRounds >= 3 ? 'sentence' : 'choice'),
      quiz(4, a, character ? 'character' : 'choice'),
    ];
    if (progressed) {
      const pair = [...selected.filter(item => next.introduced[item.id]), ...known].filter((item, index, list) => list.findIndex(other => other.id === item.id) === index).filter((item, index, list) => index === 0 || !isAmbiguousVehiclePair(list[0].concept, item.concept)).slice(0, 2);
      if (pair.length === 2) {
        tasks[4] = makeTask(id, 4, pair[0], 'match', pair.map(item => item.id));
        if ((a.language === 'zh-CN' && !next.settings.recognition) || completedRounds >= 5 && completedRounds % 2 === 1) { tasks[4].matchMode = 'listen'; tasks[4].ability = a.language === 'zh-CN' ? 'zh_listening' : 'en_listening'; }
      }
    }
    // Shuffle independently so neither the task type nor a stable screen position reveals the answer.
    for (const task of tasks) for (let i = task.optionIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [task.optionIds[i], task.optionIds[j]] = [task.optionIds[j], task.optionIds[i]];
    }
  }
  next.plan = { id, language: next.settings.language, createdAt: now.toISOString(), tasks, index: 0, rewarded: false };
  presentCurrent(next, now);
  return next;
}
export function recordExposure(state: State, item: TrialItem, now: Date = new Date()): State {
  const next = nextState(state, now);
  requireTime(next, now);
  const id = `browse:${createId()}`;
  next.events.push({
    eventId: `${id}:viewed`, taskId: id, sessionId: id, contentId: item.id,
    ability: 'exposure', occurredAt: now.toISOString(), dayKey: dayKey(now),
    outcome: 'introduced', attempts: 1, hintUsed: false, promptPlayed: false,
  });
  return next;
}
export function recordAttempt(state: State, taskId: string, now: Date = new Date()): State {
  const next = nextState(state, now);
  const task = next.plan?.tasks[next.plan.index];
  if (!task || task.id !== taskId || task.completedAt) return next;
  requireTime(next, now);
  task.attempts += 1;
  task.hintUsed = true;
  return next;
}
export interface TaskResult { taskId: string; outcome: Outcome; promptPlayed: boolean }
export function answerMatch(state: State, taskId: string, wordId: string, pictureId: string, now: Date = new Date(), heard = false): State {
  const next = nextState(state, now);
  const task = next.plan?.tasks[next.plan.index];
  if (!task || task.id !== taskId || task.kind !== 'match' || task.completedAt || !task.matchedIds || !task.optionIds.includes(wordId) || !task.optionIds.includes(pictureId) || task.matchedIds.includes(wordId) || task.matchedIds.includes(pictureId)) return next;
  if (task.matchMode === 'listen' && !heard) return next;
  requireTime(next, now);
  if (wordId !== pictureId) return recordAttempt(next, taskId, now);
  task.attempts += 1;
  task.matchedIds.push(wordId);
  if (task.matchedIds.length !== task.optionIds.length) return next;
  return completeTask(next, { taskId, outcome: 'independent_correct', promptPlayed: task.matchMode === 'listen' }, now);
}
export function completeTask(state: State, result: TaskResult, now: Date = new Date()): State {
  const next = nextState(state, now);
  const plan = next.plan;
  const task = plan?.tasks[plan.index];
  if (!plan || !task || task.id !== result.taskId || task.completedAt) return next;
  if (task.kind === 'match' && (!task.matchedIds || task.optionIds.some(id => !task.matchedIds!.includes(id)))) return next;
  requireTime(next, now);
  presentCurrent(next, now);
  const today = dayKey(now);
  const occurredAt = now.toISOString();
  const outcome: Outcome = task.kind === 'learn'
    ? result.outcome === 'assisted' ? 'assisted' : 'introduced'
    : result.outcome === 'independent_correct' && (result.promptPlayed || task.kind === 'match') && !task.hintUsed ? 'independent_correct' : 'assisted';
  task.outcome = outcome;
  task.promptPlayed = result.promptPlayed;
  task.completedAt = occurredAt;
  if (task.kind !== 'match') task.attempts += 1;
  if (outcome === 'assisted') task.hintUsed = true;
  // A two-pair match records one observation; the remaining pair can be solved by elimination.
  next.events.push({ eventId: `${task.id}:completed`, taskId: task.id, taskKind: task.kind, sessionId: plan.id, contentId: task.kind === 'match' ? task.matchedIds![0] : task.itemId, ability: task.ability, occurredAt, dayKey: today, outcome, attempts: task.attempts, hintUsed: task.hintUsed, promptPlayed: task.promptPlayed });
  plan.index += 1;
  if (plan.index === plan.tasks.length) {
    plan.completedAt = occurredAt;
    const usage = next.dayUsage[today];
    if (!next.ledger.some(entry => entry.kind === 'reward' && entry.planId === plan.id)) {
      next.ledger.push({ id: `reward:${plan.id}`, kind: 'reward', delta: 1, planId: plan.id, dayKey: today, createdAt: occurredAt });
      next.balance += 1;
      plan.rewarded = true;
      usage.rewardPlanId = plan.id;
    }
  } else {
    presentCurrent(next, now);
  }
  return next;
}
export function startGame(state: State, toyId: string, now: Date = new Date(), kind: GameKind = 'claw', recipe: RecipeId = 'salad'): State {
  const next = nextState(state, now);
  if (next.game && !next.game.claimedAt) { requireTime(next, now); return next; }
  if (!(TOY_IDS as readonly string[]).includes(toyId)) throw new Error('请选择乐园里已有的小伙伴。');
  if (!['claw', 'pusher', 'bubbles', 'hide', 'kitchen'].includes(kind)) throw new Error('请选择乐园里已有的小游戏。');
  if (kind === 'kitchen' && !isRecipeId(recipe)) throw new Error('请选择厨房里已有的食谱。');
  if (kind === 'bubbles' && !bubbleConcepts(9, next.settings.language).some(concept => concept === toyId)) throw new Error('请选择乐园里已有录音的小伙伴。');
  const today = dayKey(now);
  if (next.balance < 1) throw new Error('先一起完成一轮小任务，就能获得一枚游戏币。');
  if (getRemainingSeconds(next, now) < 45) throw new Error('今天先把游戏币存好，明天有充足时间再玩小游戏。');
  const id = createId();
  const target = [25, 75][(TOY_IDS.indexOf(toyId as typeof TOY_IDS[number]) + next.ledger.filter(entry => entry.kind === 'spend').length) % 2];
  next.game = { id, toyId, startedAt: now.toISOString(), dayKey: today, kind, language: next.settings.language, ...(kind === 'claw' ? { claw: { position: 50, target, attempts: 0, caught: false } } : kind === 'pusher' ? { pusher: createPusherScene(Number.parseInt(id.slice(0, 8), 16)) } : kind === 'kitchen' ? { progress: 0, story: { version: 4, opened: [] }, cooking: { recipe, served: false } } : kind === 'hide' ? { progress: 0, story: { version: 3, opened: [] } } : { progress: 0, bubbleMode: 'listen-find', bubblePoolVersion: 9 }) };
  next.balance -= 1;
  next.ledger.push({ id: `spend:${id}`, kind: 'spend', delta: -1, gameId: id, dayKey: today, createdAt: now.toISOString() });
  next.dayUsage[today].gameId = id;
  return next;
}
export function advanceGame(state: State, gameId: string, expectedProgress: number, now: Date = new Date()): State {
  const next = nextState(state, now);
  const game = next.game;
  if (!game || game.id !== gameId || game.claimedAt || game.pusher || game.bubbleMode || (game.kind !== 'pusher' && game.kind !== 'bubbles') || game.progress !== expectedProgress || !Number.isInteger(expectedProgress) || expectedProgress < 0 || expectedProgress >= 3) return next;
  requireTime(next, now);
  game.progress = (expectedProgress + 1) as 1 | 2 | 3;
  return next;
}
export function answerBubble(state: State, gameId: string, expectedProgress: number, choice: string, now: Date = new Date()): State {
  const next = nextState(state, now);
  const game = next.game;
  if (!game || game.id !== gameId || game.claimedAt || game.kind !== 'bubbles' || game.progress !== expectedProgress || !Number.isInteger(expectedProgress) || expectedProgress < 0 || expectedProgress >= 3) return next;
  requireTime(next, now);
  if (choice === getBubbleRound(game.id, game.toyId, expectedProgress, game.bubblePoolVersion, game.language).target) game.progress = (expectedProgress + 1) as 1 | 2 | 3;
  return next;
}
export function answerStory(state: State, gameId: string, expectedProgress: number, slot: number, heard: boolean, now: Date = new Date()): State {
  const next = nextState(state, now);
  const game = next.game;
  if (!game || game.id !== gameId || game.claimedAt || (game.kind !== 'hide' && game.kind !== 'kitchen') || !game.story || game.progress !== expectedProgress || !Number.isInteger(expectedProgress) || expectedProgress < 0 || expectedProgress >= 3 || !Number.isInteger(slot) || slot < 0 || slot > 2 || heard !== true) return next;
  requireTime(next, now);
  const round = game.cooking ? getRecipeRound(game.cooking.recipe, game.id, expectedProgress) : getStoryRound(game.id, expectedProgress, game.kind, game.language!, game.story!.version);
  if (round.choices[slot] === round.target) {
    game.progress = (expectedProgress + 1) as 1 | 2 | 3;
    game.story.opened = [];
  } else if (game.kind === 'hide' && !game.story.opened.includes(slot)) game.story.opened.push(slot);
  return next;
}
export function finishRecipe(state: State, gameId: string, now: Date = new Date()): State {
  const next = nextState(state, now), game = next.game;
  if (!game || game.id !== gameId || game.claimedAt || game.kind !== 'kitchen' || !game.cooking || game.progress !== 3) return next;
  requireTime(next, now);
  game.cooking.served = true;
  return next;
}
function isPusherScene(value: unknown): value is PusherScene {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const scene = value as Record<string, unknown>;
  const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
  if (![scene.nextId, scene.drops, scene.fallen].every(count) || typeof scene.tick !== 'number' || !Number.isFinite(scene.tick) || scene.tick < 0 || !Array.isArray(scene.coins) || scene.coins.length > 120) return false;
  const ids = new Set<number>();
  if (!scene.coins.every(coin => {
    if (!coin || typeof coin !== 'object' || Array.isArray(coin) || !count(coin.id) || coin.id >= (scene.nextId as number) || ids.has(coin.id) || ![0, 1].includes(coin.level) || ![coin.x, coin.y, coin.vx, coin.vy, coin.fall].every(Number.isFinite) || coin.fall < 0 || coin.fall > 1) return false;
    for (const [key, min, max] of [['z', -40, 240], ['vz', -200, 200], ['tilt', -10000, 10000], ['spin', -720, 720], ['chute', 0, 10]] as const) {
      if (coin[key] !== undefined && (!Number.isFinite(coin[key]) || coin[key] < min || coin[key] > max)) return false;
    }
    if (coin.support !== undefined && coin.support !== null && (!count(coin.support) || coin.support === coin.id)) return false;
    ids.add(coin.id);
    return true;
  })) return false;
  const supports = new Map(scene.coins.map(coin => [coin.id, coin.support]));
  return scene.coins.every(coin => {
    const visited = new Set<number>([coin.id]);
    let support = coin.support;
    while (support != null) {
      if (!ids.has(support) || visited.has(support)) return false;
      visited.add(support); support = supports.get(support);
    }
    return true;
  });
}
export function savePusher(state: State, gameId: string, scene: PusherScene, now: Date = new Date()): State {
  const game = state.game;
  if (!game || game.id !== gameId || game.claimedAt || game.kind !== 'pusher') return state;
  if (!isPusherScene(scene)) throw new Error('推币进度无效，当前进度没有被替换。');
  if (game.pusher && (scene.tick < game.pusher.tick || scene.drops < game.pusher.drops || scene.fallen < game.pusher.fallen)) return state;
  const next = nextState(state, now);
  requireTime(next, now);
  next.game!.pusher = structuredClone(scene);
  return next;
}
export function moveClaw(state: State, gameId: string, position: number, now: Date = new Date()): State {
  if (!Number.isFinite(position)) throw new Error('爪子位置无效，进度未修改。');
  const next = nextState(state, now);
  const game = next.game;
  if (!game || game.id !== gameId || game.claimedAt || !game.claw || game.claw.caught) return next;
  requireTime(next, now);
  game.claw.position = Math.max(0, Math.min(100, position));
  return next;
}
export function attemptClaw(state: State, gameId: string, expectedAttempts: number, now: Date = new Date()): State {
  const next = nextState(state, now);
  const game = next.game;
  if (!game || game.id !== gameId || game.claimedAt || !game.claw || game.claw.caught || game.claw.attempts !== expectedAttempts || !Number.isSafeInteger(expectedAttempts) || expectedAttempts < 0) return next;
  requireTime(next, now);
  game.claw.attempts += 1;
  game.claw.caught = Math.abs(game.claw.position - game.claw.target) <= CLAW_CATCH_RADIUS;
  return next;
}
export function claimGame(state: State, now: Date = new Date()): State {
  const next = nextState(state, now);
  if (!next.game || next.game.claimedAt) return next;
  requireTime(next, now);
  if (next.game.claw && !next.game.claw.caught) throw new Error('先把爪子移到小伙伴上方，再试着抓起来。');
  if (next.game.kind === 'pusher' && next.game.pusher && next.game.pusher.fallen < PUSHER_GOAL) throw new Error('再让几枚星星币落进接收槽，完成这局再把小伙伴带回家。');
  if ((next.game.kind === 'bubbles' || next.game.kind === 'hide' || next.game.kind === 'kitchen' || (next.game.kind === 'pusher' && !next.game.pusher)) && next.game.progress !== 3) throw new Error('还有小小的一步，完成这局再把小伙伴带回家。');
  if (next.game.cooking && !next.game.cooking.served) throw new Error('材料集齐啦，再动手做成一道菜吧。');
  next.game.claimedAt = now.toISOString();
  if (!next.collections.some(collection => collection.gameId === next.game!.id)) {
    next.collections.push({ toyId: next.game.toyId, gameId: next.game.id, collectedAt: now.toISOString() });
  }
  return next;
}
export function addActiveTime(state: State, seconds: number, now: Date = new Date()): State {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('活动时长无效，进度未修改。');
  const next = nextState(state, now);
  // Attribute a visible interval crossing midnight to each actual Shanghai day.
  let cursor = now.getTime() - seconds * 1000;
  while (cursor < now.getTime()) {
    const key = dayKey(new Date(cursor));
    const endOfDay = Date.parse(`${key}T00:00:00+08:00`) + 86400000;
    const end = Math.min(endOfDay, now.getTime());
    next.dayUsage[key] ??= { activeSeconds: 0, introducedIds: [] };
    next.dayUsage[key].activeSeconds += (end - cursor) / 1000;
    cursor = end;
  }
  return next;
}

export function moveRoomToy(state: State, toyId: string, position: RoomPosition): State {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error('摆放位置不正确。');
  const room = makeRoomPages([...new Set(state.collections.map(c => c.toyId))]).find(room => room.toys.some(toy => toy.id === toyId));
  const toy = room?.toys.find(toy => toy.id === toyId);
  if (!room || !toy) throw new Error('先把这位小伙伴带回家，再来摆放。');
  const next = structuredClone(state);
  next.scenePositions ??= {};
  next.scenePositions[toyId] = clampRoomPosition(position, roomMoveBounds(room.kind, toy.id, toy.seat));
  return next;
}

export function validateState(value: unknown): asserts value is State {
  const fail = () => { throw new Error('存档格式或版本不正确，当前进度没有被替换。'); };
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
  const date = (v: unknown): v is string => text(v) && Number.isFinite(Date.parse(v));
  const day = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00+08:00`));
  const nonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const unique = (entries: string[]) => new Set(entries).size === entries.length;
  if (!object(value) || value.schemaVersion !== 1 || !object(value.settings)) return fail();
  const settings = value.settings;
  if (!['zh-CN', 'en-US'].includes(settings.language as string) || ![0, 1, 2].includes(settings.dailyNewCap as number) || ![180, 300, 480, 600].includes(settings.budgetSeconds as number) || typeof settings.recognition !== 'boolean' || (settings.parentManaged !== undefined && typeof settings.parentManaged !== 'boolean')) return fail();
  if (!Number.isSafeInteger(value.balance) || (value.balance as number) < 0 || !Array.isArray(value.ledger) || !Array.isArray(value.events) || !Array.isArray(value.collections) || !object(value.introduced) || !object(value.dayUsage) || !(value.latestDayKey === '' || day(value.latestDayKey))) return fail();
  let balance = 0;
  const rewardPlans: string[] = [], gameIds: string[] = [], raceIds: string[] = [];
  for (const entry of value.ledger) {
    if (!object(entry) || !text(entry.id) || !day(entry.dayKey) || !date(entry.createdAt)) return fail();
    if (entry.kind === 'reward' && entry.delta === 1 && text(entry.planId)) rewardPlans.push(entry.planId);
    else if (entry.kind === 'spend' && entry.delta === -1 && text(entry.gameId)) gameIds.push(entry.gameId);
    else if (entry.kind === 'race-reward' && entry.delta === 1 && text(entry.raceId) && entry.id === `race:${entry.raceId}` && entry.planId === undefined && entry.gameId === undefined) raceIds.push(entry.raceId);
    else return fail();
    balance += entry.delta as number;
    if (balance < 0) return fail();
  }
  if (balance !== value.balance || !unique(value.ledger.map(entry => entry.id)) || ![rewardPlans, gameIds, raceIds].every(unique)) return fail();
  if (value.race !== undefined) {
    const race = value.race;
    if (!object(race) || !text(race.id) || !Number.isSafeInteger(race.seed) || (race.seed as number) < 0 || (race.seed as number) > 4294967295 || !Number.isInteger(race.picked) || (race.picked as number) < 0 || (race.picked as number) > 4 || !date(race.startedAt) || !['zh-CN', 'en-US'].includes(race.language as string)) return fail();
    const plan = racePlan(race.seed as number);
    if (race.settledAt !== undefined && (!date(race.settledAt) || Date.parse(race.settledAt) - Date.parse(race.startedAt) < plan.duration)) return fail();
    if (raceIds.includes(race.id) !== (!!race.settledAt && race.picked === plan.order[0])) return fail();
  }
  for (const entry of value.ledger) {
    const usage = value.dayUsage[entry.dayKey];
    if (!object(usage)) return fail();
  }
  for (const [key, usage] of Object.entries(value.dayUsage)) {
    if (!day(key) || !object(usage) || !nonNegative(usage.activeSeconds) || !Array.isArray(usage.introducedIds) || !usage.introducedIds.every(text) || !unique(usage.introducedIds)) return fail();
    const latestReward = value.ledger.filter(entry => entry.kind === 'reward' && entry.dayKey === key).at(-1);
    const latestGame = value.ledger.filter(entry => entry.kind === 'spend' && entry.dayKey === key).at(-1);
    if (usage.rewardPlanId !== latestReward?.planId || usage.gameId !== latestGame?.gameId) return fail();
  }
  for (const [id, introduction] of Object.entries(value.introduced)) {
    if (!text(id) || !object(introduction) || !date(introduction.firstAt) || !day(introduction.dayKey) || !((value.dayUsage[introduction.dayKey] as DayUsage | undefined)?.introducedIds.includes(id))) return fail();
  }
  for (const [key, usage] of Object.entries(value.dayUsage)) {
    for (const id of (usage as unknown as DayUsage).introducedIds) if ((value.introduced[id] as { dayKey?: unknown } | undefined)?.dayKey !== key) return fail();
  }
  const abilities = ['exposure', 'zh_listening', 'en_listening', 'zh_character_recognition', 'en_word_recognition'];
  const outcomes = ['introduced', 'independent_correct', 'assisted'];
  const taskKinds = ['learn', 'choice', 'character', 'match', 'sentence'];
  for (const event of value.events) {
    if (!object(event) || ![event.eventId, event.taskId, event.sessionId, event.contentId].every(text) || !abilities.includes(event.ability as string) || !outcomes.includes(event.outcome as string) || !date(event.occurredAt) || !day(event.dayKey) || !Number.isSafeInteger(event.attempts) || (event.attempts as number) < 1 || typeof event.hintUsed !== 'boolean' || typeof event.promptPlayed !== 'boolean') return fail();
    if (event.taskKind !== undefined && !taskKinds.includes(event.taskKind as string)) return fail();
    if (event.taskKind === 'match' && !['zh_character_recognition', 'en_word_recognition', 'en_listening', 'zh_listening'].includes(event.ability as string)) return fail();
    if (event.taskKind === 'match' && ['en_listening', 'zh_listening'].includes(event.ability as string) && !event.promptPlayed) return fail();
    if (event.ability === 'en_word_recognition' && event.taskKind !== 'match') return fail();
    if (event.outcome === 'independent_correct' && (event.ability === 'exposure' || event.hintUsed || (!event.promptPlayed && event.taskKind !== 'match'))) return fail();
  }
  if (!unique(value.events.map(event => event.eventId)) || !unique(value.events.map(event => event.taskId))) return fail();
  for (const collection of value.collections) {
    if (!object(collection) || !text(collection.toyId) || !(TOY_IDS as readonly string[]).includes(collection.toyId) || !text(collection.gameId) || !date(collection.collectedAt) || !gameIds.includes(collection.gameId)) return fail();
  }
  if (!unique(value.collections.map(collection => collection.gameId))) return fail();
  for (const field of ['roomPositions', 'scenePositions'] as const) {
    const positions = value[field];
    if (positions === undefined) continue;
    if (!object(positions)) return fail();
    const pages = (field === 'roomPositions' ? legacyRoomPages : makeRoomPages)([...new Set(value.collections.map(c => c.toyId as string))]);
    for (const [id, point] of Object.entries(positions)) {
      if (!object(point) || !nonNegative(point.x) || !nonNegative(point.y)) return fail();
      const room = pages.find(room => room.toys.some(toy => toy.id === id));
      const toy = room?.toys.find(toy => toy.id === id);
      if (!room || !toy) return fail();
      const clamped = clampRoomPosition({ x: point.x, y: point.y }, field === 'roomPositions' ? legacyRoomBounds(room.kind as Parameters<typeof legacyRoomBounds>[0], id, toy.seat) : roomMoveBounds(room.kind, id, toy.seat));
      if (point.x !== clamped.x || point.y !== clamped.y) return fail();
    }
  }
  if (value.game !== null) {
    const game = value.game;
    if (!object(game) || !text(game.id) || !gameIds.includes(game.id) || !text(game.toyId) || !(TOY_IDS as readonly string[]).includes(game.toyId) || !date(game.startedAt) || !day(game.dayKey) || (game.claimedAt !== undefined && !date(game.claimedAt))) return fail();
    const kind = game.kind ?? 'claw';
    if (!['claw', 'pusher', 'bubbles', 'hide', 'kitchen'].includes(kind as string) || (game.kind !== undefined && typeof game.kind !== 'string')) return fail();
    if (game.language !== undefined && !['zh-CN', 'en-US'].includes(game.language as string)) return fail();
    if (game.bubblePoolVersion !== undefined && (![2,3,4,5,6,7,8,9].includes(game.bubblePoolVersion as number) || kind !== 'bubbles' || game.bubbleMode !== 'listen-find' || game.language === undefined)) return fail();
    if (game.bubbleMode !== undefined && (kind !== 'bubbles' || game.bubbleMode !== 'listen-find' || !bubbleConcepts(game.bubblePoolVersion as number | undefined, game.language as Language | undefined).some(concept => concept === game.toyId))) return fail();
    if (kind === 'hide' || kind === 'kitchen') {
      if (!object(game.story) || ![1, 2, 3, 4].includes(game.story.version as number) || !Array.isArray(game.story.opened) || !game.story.opened.every(slot => Number.isInteger(slot) && [0, 1, 2].includes(slot as number)) || !unique(game.story.opened) || game.language === undefined || ![0, 1, 2, 3].includes(game.progress as number)) return fail();
      if (game.story.version === 4 && (kind !== 'kitchen' || !object(game.cooking) || !isRecipeId(game.cooking.recipe) || typeof game.cooking.served !== 'boolean' || game.cooking.served && game.progress !== 3 || game.claimedAt !== undefined && !game.cooking.served)) return fail();
      if ((kind === 'kitchen' || game.progress === 3) && game.story.opened.length !== 0) return fail();
      if (game.progress !== 3 && kind === 'hide') {
        const round = getStoryRound(game.id, game.progress as number, kind, game.language as Language, (game.story as { version: number }).version);
        if (game.story.opened.some(slot => round.choices[slot as number] === round.target)) return fail();
      }
    } else if (game.story !== undefined) return fail();
    if (game.cooking !== undefined && (kind !== 'kitchen' || !object(game.story) || game.story.version !== 4)) return fail();
    if (game.pusher !== undefined && (kind !== 'pusher' || !isPusherScene(game.pusher))) return fail();
    if (kind === 'pusher' && game.pusher !== undefined) {
      if (game.progress !== undefined && ![0, 1, 2, 3].includes(game.progress as number)) return fail();
      if (game.claimedAt !== undefined && (game.pusher as PusherScene).fallen < PUSHER_GOAL) return fail();
    }
    else if (kind === 'claw') { if (game.progress !== undefined && game.progress !== 0) return fail(); }
    else if (![0, 1, 2, 3].includes(game.progress as number) || (game.claimedAt !== undefined && game.progress !== 3)) return fail();
    if (game.claw !== undefined) {
      const claw = game.claw;
      if (kind !== 'claw' || !object(claw) || !nonNegative(claw.position) || claw.position > 100 || !nonNegative(claw.target) || claw.target > 100 || !Number.isSafeInteger(claw.attempts) || (claw.attempts as number) < 0 || typeof claw.caught !== 'boolean') return fail();
      if (claw.caught && ((claw.attempts as number) < 1 || Math.abs(claw.position - claw.target) > CLAW_CATCH_RADIUS)) return fail();
      if (game.claimedAt !== undefined && !claw.caught) return fail();
    }
    if (!!game.claimedAt !== value.collections.some(collection => collection.gameId === game.id)) return fail();
  }
  for (const gameId of gameIds) {
    if (!value.collections.some(collection => collection.gameId === gameId) && (!object(value.game) || value.game.id !== gameId)) return fail();
  }
  if (value.plan !== null) {
    const plan = value.plan;
    if (!object(plan) || !text(plan.id) || !['zh-CN', 'en-US'].includes(plan.language as string) || !date(plan.createdAt) || !Array.isArray(plan.tasks) || plan.tasks.length !== 5 || !Number.isInteger(plan.index) || (plan.index as number) < 0 || (plan.index as number) > 5 || typeof plan.rewarded !== 'boolean' || (plan.completedAt !== undefined && !date(plan.completedAt))) return fail();
    if (!!plan.completedAt !== (plan.index === 5) || (plan.rewarded && !rewardPlans.includes(plan.id))) return fail();
    for (let i = 0; i < plan.tasks.length; i++) {
      const task = plan.tasks[i];
      if (!object(task) || !text(task.id) || !text(task.itemId) || !taskKinds.includes(task.kind as string) || !abilities.includes(task.ability as string) || !Array.isArray(task.optionIds) || !task.optionIds.every(text) || !task.optionIds.includes(task.itemId) || !unique(task.optionIds) || !(task.kind === 'learn' ? task.optionIds.length === 1 : task.kind === 'match' ? task.optionIds.length === 2 : [2, 3].includes(task.optionIds.length)) || !Number.isSafeInteger(task.attempts) || (task.attempts as number) < 0 || typeof task.hintUsed !== 'boolean' || typeof task.promptPlayed !== 'boolean') return fail();
      if (task.matchMode !== undefined && (task.matchMode !== 'listen' || task.kind !== 'match')) return fail();
      const expectedAbility = task.kind === 'learn' ? 'exposure' : task.kind === 'match' ? task.matchMode === 'listen' ? plan.language === 'zh-CN' ? 'zh_listening' : 'en_listening' : plan.language === 'zh-CN' ? 'zh_character_recognition' : 'en_word_recognition' : task.kind === 'character' ? 'zh_character_recognition' : plan.language === 'zh-CN' ? 'zh_listening' : 'en_listening';
      if (task.ability !== expectedAbility || (task.kind === 'character' && plan.language !== 'zh-CN')) return fail();
      if (task.kind === 'match') {
        const optionIds = task.optionIds;
        const introduced = value.introduced;
        if (!Array.isArray(task.matchedIds) || !task.matchedIds.every(text) || !unique(task.matchedIds) || task.matchedIds.some(id => !optionIds.includes(id)) || optionIds.some(id => !object(introduced[id])) || (task.attempts as number) < task.matchedIds.length || (i < (plan.index as number) ? task.matchedIds.length !== 2 : task.matchedIds.length >= 2)) return fail();
        if (i > (plan.index as number) && task.matchedIds.length !== 0) return fail();
        const firstMatchedId = task.matchedIds[0];
        if (i < (plan.index as number) && !value.events.some(event => event.taskId === task.id && event.taskKind === 'match' && event.contentId === firstMatchedId && event.ability === task.ability && event.outcome === task.outcome)) return fail();
      } else if (task.matchedIds !== undefined) return fail();
      if (i < (plan.index as number)) {
        if (!date(task.completedAt) || !outcomes.includes(task.outcome as string) || !value.events.some(event => event.taskId === task.id && event.sessionId === plan.id)) return fail();
      } else if (task.completedAt !== undefined || task.outcome !== undefined) return fail();
    }
    if (!unique(plan.tasks.map(task => task.id))) return fail();
  }
}
