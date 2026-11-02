import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { vehicleConcepts, rescueConstructionConcepts } from '../src/concepts.ts'
import { bubbleConcepts, getBubbleRound } from '../src/bubbles.ts'
import { makeRoomPages, roomMoveBounds, clampRoomPosition } from '../src/rooms.ts'
import { TOY_IDS, validateState, moveRoomToy } from '../src/engine.ts'

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

test('vehicle expansion preserves all previous content and recordings and adds both languages', () => {
  const current = json('../src/trial-content.json'), before = json('../output/vehicles-v27/trial-before.json')
  const audio = json('../public/audio/manifest.json'), oldAudio = json('../output/vehicles-v27/manifest-before.json')
  for (const item of before.items) assert.deepEqual(current.items.find((i: any) => i.id === item.id), item)
  for (const clip of oldAudio.clips) assert.deepEqual(audio.clips.find((c: any) => c.id === clip.id), clip)
  for (const language of ['zh-CN','en-US']) for (const concept of rescueConstructionConcepts) {
    const item = current.items.find((i: any) => i.language === language && i.concept === concept)
    assert.ok(item?.example && item?.prompt)
    for (const path of Object.values(item.audio)) assert.ok(audio.clips.some((clip: any) => clip.path === path))
  }
  const added = current.items.filter((i: any) => i.contentSource === 'bilingual-expansion-v27')
  assert.equal(added.length, 6)
  assert.equal(audio.clips.filter((c: any) => added.some((i: any) => i.id === c.item_id)).length, 21)
})

test('new vehicle bubble pool preserves the exact previous pool and includes each selected vehicle', () => {
  for (const language of ['zh-CN','en-US'] as const) {
    assert.equal(bubbleConcepts(7, language).length, 89)
    assert.deepEqual(bubbleConcepts(8, language), [...bubbleConcepts(7, language), ...vehicleConcepts])
    for (const toy of vehicleConcepts) assert.ok([0,1,2].some(n => getBubbleRound('vehicle-check', toy, n, 8, language).target === toy))
  }
})

test('road collection separates construction ground from traffic and accepts previous saved car positions', () => {
  const pages = makeRoomPages([...TOY_IDS])
  const work = pages.find(p => p.toys.some(t => t.id === 'excavator'))!
  assert.equal(work.kind, 'road')
  assert.deepEqual(new Set(work.toys.map(t => t.id)), new Set(rescueConstructionConcepts))
  for (const id of ['car','bus','bicycle','fire-truck','ambulance','police-car','excavator','bulldozer']) {
    const room = pages.find(p => p.toys.some(t => t.id === id))!
    const seat = room.toys.find(t => t.id === id)!.seat
    const bounds = roomMoveBounds(room.kind, id, seat)
    assert.equal(room.kind, ['car','bus','bicycle'].includes(id) ? 'street' : 'road')
    if (['excavator','bulldozer'].includes(id)) {
      assert.match(seat.place, /施工区/)
      assert.ok(bounds.left >= 53 && bounds.bottom <= 46)
    } else {
      assert.match(seat.place, /马路|自行车道/)
      for (const point of [{x:bounds.left,y:bounds.top},{x:bounds.right,y:bounds.bottom}]) assert.deepEqual(clampRoomPosition(point, bounds), point)
    }
    assert.deepEqual(clampRoomPosition(seat, bounds), {x:seat.x,y:seat.y})
  }
  // Fixtures earn their collections through completed games, not fabricated balances.
  for (const language of ['zh-CN','en-US']) {
    const state = json('../output/vehicles-v27/fixtures.json')[language].collected
    validateState(state)
    const next = moveRoomToy(state, 'excavator', {x:0,y:100})
    assert.deepEqual(next.scenePositions.excavator, {x:53,y:46})
    assert.deepEqual(next.collections, state.collections)
    assert.equal(next.balance, state.balance)
    validateState(JSON.parse(JSON.stringify(next)))
  }
})
