import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { recipeIds, recipes, getRecipeRound, kitchenAudio, kitchenLines } from '../src/recipes.ts';
import { createInitialState, startPlan, completeTask, answerMatch, startGame, answerStory, finishRecipe, claimGame, validateState, type State, type TrialItem } from '../src/engine.ts';
const items: TrialItem[] = JSON.parse(readFileSync(new URL('../src/trial-content.json', import.meta.url), 'utf8')).items;
function earned() {
  let s = startPlan(createInitialState(), items);
  while (!s.plan!.completedAt) {
    const t = s.plan!.tasks[s.plan!.index];
    if (t.kind === 'match') for (const id of t.optionIds) s = answerMatch(s, t.id, id, id, new Date(), true);
    else s = completeTask(s, { taskId:t.id, outcome:'independent_correct', promptPlayed:true });
  }
  return s;
}
function add(s: State) {
  const g = s.game!, r = getRecipeRound(g.cooking!.recipe, g.id, g.progress!);
  return answerStory(s, g.id, g.progress!, r.choices.indexOf(r.target), true);
}
test('all recipes require the three ingredients, a cooking step and exactly one claim', () => {
  for (const id of recipeIds) for (const language of ['en-US','zh-CN'] as const) {
    const before = earned(); before.settings.language = language;
    let s = startGame(before, 'red-monster', new Date(), 'kitchen', id);
    const initial = structuredClone(s), gameId = s.game!.id;
    assert.equal(s.game!.story!.version, 4); validateState(s);
    assert.equal(new Set(recipes[id].ingredients).size, 3);
    assert.deepEqual(finishRecipe(s, gameId).game, s.game);
    const r = getRecipeRound(id, gameId, 0), slot = r.choices.indexOf(r.target);
    for (const [gid,progress,choice,heard] of [[gameId,0,(slot+1)%3,true],[gameId,0,slot,false],['stale',0,slot,true],[gameId,0,-1,true],[gameId,1,slot,true]] as const) assert.deepEqual(answerStory(s,gid,progress,choice,heard).game,s.game);
    for (let step=0;step<3;step++) {
      s = add(s); s = JSON.parse(JSON.stringify(s)); validateState(s);
      assert.equal(s.game!.progress, step + 1);
      const retry = answerStory(s, gameId, step, slot, true); assert.deepEqual(retry.game, s.game);
      assert.throws(() => claimGame(s));
    }
    s.settings.language = language === 'en-US' ? 'zh-CN' : 'en-US';
    assert.equal(s.game!.language, language); assert.equal(s.game!.cooking!.recipe, id);
    s = finishRecipe(s, gameId); validateState(s);
    assert.deepEqual(finishRecipe(s, gameId).game, s.game);
    s = claimGame(claimGame(s)); validateState(s);
    assert.equal(s.collections.length, 1); assert.equal(s.balance, 0);
    assert.deepEqual(s.ledger, initial.ledger); assert.deepEqual(s.events, initial.events);
  }
});
test('invalid recipes and contradictory imported cooking state are rejected', () => {
  const before = earned();
  assert.throws(() => startGame(before, 'red-monster', new Date(), 'kitchen', 'unknown' as any));
  const s = startGame(before, 'red-monster', new Date(), 'kitchen', 'soup');
  for (const mutate of [
    (g:any) => { delete g.cooking }, (g:any) => { g.cooking.recipe = '__proto__' },
    (g:any) => { g.cooking.served = true }, (g:any) => { g.cooking.served = 'false' },
    (g:any) => { g.story.version = 3 }, (g:any) => { g.kind = 'hide' },
    (g:any) => { g.progress = 3; g.claimedAt = new Date().toISOString() },
  ]) { const copy = structuredClone(s); mutate(copy.game); assert.throws(() => validateState(copy)); }
});
test('recipe speech uses both approved voices and preserves every existing clip', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/manifest.json', import.meta.url), 'utf8'));
  const before = JSON.parse(readFileSync(new URL('../output/kitchen-v22/manifest-before.json', import.meta.url), 'utf8'));
  for (const old of before.clips) {
    assert.deepEqual(manifest.clips.find((c:any) => c.id === old.id), old);
    assert.equal(createHash('sha256').update(readFileSync(new URL('../public' + old.path, import.meta.url))).digest('hex'),old.sha256);
  }
  for (const language of ['en-US','zh-CN'] as const) for (const line of kitchenLines(language)) {
    const c = manifest.clips.find((c:any) => c.path === kitchenAudio(line.key,language));
    assert.equal(c.text,line.text); assert.equal(c.voice,language==='zh-CN'?'Uncle_Fu':'af_heart');
    assert.ok(Math.abs(c.normalization.measured_lufs+18)<=.2); assert.ok(c.normalization.true_peak_dbtp<=-1.5);
    assert.equal(createHash('sha256').update(readFileSync(new URL('../public'+c.path,import.meta.url))).digest('hex'),c.sha256);
  }
});
