import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { racePlan, racePosition, raceLines, raceAudio } from '../src/pandaRace.ts';
import { createInitialState, startPandaRace, finishPandaRace, validateState, startGame, startPlan, completeTask, answerMatch, type TrialItem } from '../src/engine.ts';
const now = new Date('2026-10-25T04:00:00Z');

test('race paths never run backward and finish in the saved order; all five can win', () => {
  const wins = [0, 0, 0, 0, 0];
  for (let seed = 0; seed < 1000; seed++) {
    const plan = racePlan(seed); wins[plan.order[0]]++;
    assert.deepEqual(racePlan(seed), plan);
    assert.equal(new Set(plan.order).size, 5);
    assert.ok(plan.duration < 20000);
    assert.deepEqual([...plan.runners.keys()].sort((a, b) => plan.runners[a].finishMs - plan.runners[b].finishMs), plan.order);
    for (const runner of plan.runners) {
      let previous = 0;
      for (let elapsed = 0; elapsed < 20000; elapsed += 200) {
        const next = racePosition(runner, elapsed); assert.ok(next >= previous && next <= 1); previous = next;
      }
      assert.equal(racePosition(runner, runner.finishMs), 1);
    }
  }
  assert.ok(wins.every(n => n > 100 && n < 300), wins.join(','));
});

test('free choice, one winner coin, no loss charge; saved race is immutable and reward is idempotent', () => {
  for (const win of [true, false]) {
    let s = startPandaRace(createInitialState(), 0, now);
    const winner = racePlan(s.race!.seed).order[0];
    s.race!.picked = win ? winner : (winner + 1) % 5;
    validateState(s); const id = s.race!.id;
    assert.equal(s.balance, 0); assert.equal(s.ledger.length, 0);
    assert.deepEqual(startPandaRace(s, 4, now), s);
    assert.deepEqual(finishPandaRace(s, id, now), s);
    assert.deepEqual(finishPandaRace(s, 'stale', new Date(now.getTime() + 30000)), s);
    s = JSON.parse(JSON.stringify(s)); validateState(s);
    s = finishPandaRace(s, id, new Date(now.getTime() + 30000)); validateState(s);
    const saved = structuredClone(s);
    assert.deepEqual(finishPandaRace(s, id, new Date(now.getTime() + 40000)), saved);
    assert.equal(s.balance, win ? 1 : 0);
    assert.equal(s.ledger.length, win ? 1 : 0);
    assert.equal(s.events.length, 0); assert.equal(s.plan, null);
    assert.equal(s.dayUsage['2026-10-25'].rewardPlanId, undefined);
    const next = startPandaRace(s, 2, new Date(now.getTime() + 50000)); validateState(next);
    assert.notEqual(next.race!.id, id); assert.equal(next.balance, s.balance);
    assert.deepEqual(finishPandaRace(next, id, new Date(now.getTime() + 80000)), next);
  }
});

test('race rewards coexist with learning and can be spent on existing games', () => {
  const items: TrialItem[] = JSON.parse(readFileSync(new URL('../src/trial-content.json', import.meta.url), 'utf8')).items;
  let s = startPandaRace(createInitialState(), 0, now); s.race!.picked = racePlan(s.race!.seed).order[0];
  const later = new Date(now.getTime() + 30000);
  s = finishPandaRace(s, s.race!.id, later);
  s = startPlan(s, items, later);
  while (!s.plan!.completedAt) {
    const t = s.plan!.tasks[s.plan!.index];
    if (t.kind === 'match') for (const id of t.optionIds) s = answerMatch(s, t.id, id, id, later, true);
    else s = completeTask(s, { taskId: t.id, outcome: 'independent_correct', promptPlayed: true }, later);
  }
  validateState(s); assert.equal(s.balance, 2);
  assert.equal(s.ledger.filter(e => e.kind === 'reward').length, 1);
  s = startGame(s, 'cat', later); validateState(s); assert.equal(s.balance, 1);
  assert.throws(() => startPandaRace(s, 1, later));
});

test('invalid imported race data and duplicate coin entries are rejected; old saves still work', () => {
  const initial = createInitialState(); validateState(initial);
  for (const picked of [-1, 5, NaN, 1.5]) assert.throws(() => startPandaRace(initial, picked, now));
  const s = startPandaRace(initial, 1, now);
  for (const mutate of [(r:any) => r.picked = 9, (r:any) => r.seed = -1, (r:any) => r.seed = Infinity, (r:any) => r.startedAt = 'bad', (r:any) => r.settledAt = now.toISOString(), (r:any) => r.language = 'xx']) {
    const bad = structuredClone(s); mutate(bad.race); assert.throws(() => validateState(bad));
  }
  s.race!.picked = racePlan(s.race!.seed).order[0];
  const won = finishPandaRace(s, s.race!.id, new Date(now.getTime() + 30000));
  const duplicate = structuredClone(won); duplicate.ledger.push({ ...duplicate.ledger[0] }); duplicate.balance++;
  assert.throws(() => validateState(duplicate));
  const missing = structuredClone(won); missing.ledger = []; missing.balance = 0; assert.throws(() => validateState(missing));
  const limited = createInitialState(); limited.settings.parentManaged = false; limited.dayUsage['2026-10-25'] = { activeSeconds: 470, introducedIds: [] };
  assert.throws(() => startPandaRace(limited, 0, now));
});

test('race voice files use the approved voices and normalized volume', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/manifest.json', import.meta.url), 'utf8'));
  const before = JSON.parse(readFileSync(new URL('../output/panda-race-v25/manifest-before.json', import.meta.url), 'utf8'));
  for (const old of before.clips) {
    assert.deepEqual(manifest.clips.find((c:any) => c.id === old.id), old);
    assert.equal(createHash('sha256').update(readFileSync(new URL('../public' + old.path, import.meta.url))).digest('hex'), old.sha256);
  }
  for (const language of ['en-US', 'zh-CN'] as const) for (const [key, text] of Object.entries(raceLines[language])) {
    const path = raceAudio(key as keyof typeof raceLines['en-US'], language);
    const clip = manifest.clips.find((c:any) => c.path === path);
    assert.ok(clip, path); assert.equal(clip.text, text); assert.equal(clip.voice, language === 'zh-CN' ? 'Uncle_Fu' : 'af_heart');
    assert.ok(Math.abs(clip.normalization.measured_lufs + 18) <= .2); assert.ok(clip.normalization.true_peak_dbtp <= -1.5);
    assert.equal(createHash('sha256').update(readFileSync(new URL('../public' + path, import.meta.url))).digest('hex'), clip.sha256);
  }
});


test('parent time limits reserve enough time for the slower spoken countdown', () => {
  const state = createInitialState(); state.settings.parentManaged = false;
  state.dayUsage['2026-10-25'] = { activeSeconds: 456, introducedIds: [] };
  assert.throws(() => startPandaRace(state, 0, now));
  state.dayUsage['2026-10-25'].activeSeconds = 455;
  assert.ok(startPandaRace(state, 0, now).race);
});
