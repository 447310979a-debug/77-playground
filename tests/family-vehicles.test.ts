import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { familyVehicleConcepts, familyRoadConcepts, isAmbiguousVehiclePair } from '../src/concepts.ts'
import { TOY_IDS, createInitialState, startPlan, completeTask, answerMatch, validateState } from '../src/engine.ts'
import { makeRoomPages, roomMoveBounds } from '../src/rooms.ts'
import { bubbleConcepts, getBubbleRound } from '../src/bubbles.ts'

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

test('family vehicles keep previous vocabulary/audio intact and teach familiar bilingual phrases', () => {
  const content = json('../src/trial-content.json'), before = json('../output/family-vehicles-v28/trial-before.json')
  const audio = json('../public/audio/manifest.json'), oldAudio = json('../output/family-vehicles-v28/manifest-before.json')
  for (const item of before.items) assert.deepEqual(content.items.find((i: any) => i.id === item.id), item)
  for (const clip of oldAudio.clips) assert.deepEqual(audio.clips.find((c: any) => c.id === clip.id), clip)
  assert.equal(content.items.filter((i:any) => i.contentSource !== 'bilingual-expansion-v30').length - before.items.length, 6)
  assert.equal(audio.clips.filter((c:any) => !c.id.startsWith('race-v29-') && c.normalization.version !== 'v30-vocabulary-fixed-gain').length - oldAudio.clips.length, 21)
  for (const language of ['zh-CN','en-US']) for (const concept of familyVehicleConcepts) {
    const item = content.items.find((i: any) => i.concept === concept && i.language === language)
    assert.ok(item.pictureNote && item.example && item.prompt)
    assert.equal(item.theme, '我们家的车')
    if (concept === 'model-y') { assert.match(item.pictureNote, /黑色.*Model Y/); assert.match(item.example, /black|黑色/) }
    if (concept === 'tiguan') { assert.match(item.pictureNote, /棕色老款.*途观/); assert.match(item.example, /brown|棕色/) }
    if (concept === 'pink-bicycle') { assert.match(item.pictureNote, /迪卡侬.*粉红色/); assert.match(item.example, /pink|粉红色/) }
    if (language === 'en-US') assert.doesNotMatch(item.prompt, /the (Daddy|Grandpa|My)/)
  }
})

test('new listening and matching questions never mark another valid kind of car or bicycle wrong', () => {
  const content = json('../src/trial-content.json').items
  for (const language of ['zh-CN','en-US'] as const) {
    const items = ['car','model-y','tiguan','bicycle','pink-bicycle','bus','police-car'].map(concept => content.find((i: any) => i.language === language && i.concept === concept))
    let state = createInitialState(); state.settings.language = language
    for (let round = 0; round < 20; round++) {
      state = startPlan(state, items)
      while (!state.plan!.completedAt) {
        const task = state.plan!.tasks[state.plan!.index]
        const target = items.find(i => i.id === task.itemId)
        for (const option of task.optionIds) assert.ok(!isAmbiguousVehiclePair(target.concept, items.find(i => i.id === option).concept))
        if (task.kind === 'match') for (const id of task.optionIds) state = answerMatch(state, task.id, id, id, new Date(), true)
        else state = completeTask(state, {taskId: task.id, outcome: 'independent_correct', promptPlayed: true})
        validateState(state)
      }
    }
    assert.equal(Object.keys(state.introduced).length, items.length)
    for (let seed = 0; seed < 80; seed++) for (const toy of ['car','bicycle',...familyVehicleConcepts]) for (const progress of [0,1,2]) {
      const round = getBubbleRound(`family-${seed}`, toy, progress, 9, language)
      assert.ok(round.choices.every(choice => !isAmbiguousVehiclePair(round.target, choice)))
    }
  }
})

test('family cars and bus share a road page without moving older seats or changing old bubble pools', () => {
  const pages = makeRoomPages([...TOY_IDS]), page = pages.find(p => p.toys.some(t => t.id === 'model-y'))!
  assert.equal(page.kind, 'street')
  assert.deepEqual(new Set(page.toys.map(t => t.id)), new Set(['car','bicycle',...familyRoadConcepts]))
  assert.equal(new Set(page.toys.map(t => `${t.seat.x},${t.seat.y}`)).size, 6)
  for (const toy of page.toys) {
    const bounds = roomMoveBounds(page.kind, toy.id, toy.seat)
    assert.ok(toy.seat.x >= bounds.left && toy.seat.x <= bounds.right && toy.seat.y >= bounds.top && toy.seat.y <= bounds.bottom)
  }
  const before = makeRoomPages(TOY_IDS.filter(id => !(familyVehicleConcepts as readonly string[]).includes(id)))
  for (const toy of before.flatMap(p => p.toys)) assert.deepEqual(pages.flatMap(p => p.toys).find(t => t.id === toy.id), toy)
  for (const language of ['zh-CN','en-US'] as const) {
    assert.equal(bubbleConcepts(8, language).length, 92)
    assert.deepEqual(bubbleConcepts(9, language), [...bubbleConcepts(8, language), ...familyVehicleConcepts])
    for (const toy of familyVehicleConcepts) assert.ok([0,1,2].some(n => getBubbleRound('family-test', toy, n, 9, language).target === toy))
  }
})
