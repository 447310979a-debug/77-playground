import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeRoomPages, roomFor, roomMoveBounds, clampRoomPosition, collectionPositions, sceneArt } from '../src/rooms.ts'
import { makeRoomPages as oldPages } from '../src/rooms-v28.ts'
import { TOY_IDS, validateState, moveRoomToy } from '../src/engine.ts'
import { sharkConcepts } from '../src/concepts.ts'

test('all 109 collectibles have one distinct scene, with no duplicate pages or missing friends', () => {
  const pages = makeRoomPages([...TOY_IDS])
  assert.deepEqual(new Set(pages.flatMap(p => p.toys.map(t => t.id))), new Set(TOY_IDS))
  assert.equal(pages.flatMap(p => p.toys).length, TOY_IDS.length)
  assert.equal(pages.length, 22)
  assert.equal(new Set(pages.map(p => p.kind)).size, pages.length)
  assert.equal(new Set(Object.values(sceneArt).map(a => `${a.sheet}:${a.quadrant}`)).size, 12)
  for (const page of pages) {
    assert.ok(page.toys.length <= 7)
    for (const toy of page.toys) {
      assert.equal(page.kind, roomFor(toy.id))
      assert.deepEqual(makeRoomPages([toy.id])[0].toys[0], toy)
      const bounds = roomMoveBounds(page.kind, toy.id, toy.seat)
      assert.deepEqual(clampRoomPosition(toy.seat,bounds), { x:toy.seat.x, y:toy.seat.y })
      assert.deepEqual(clampRoomPosition({x:-999,y:999},bounds),{x:bounds.left,y:bounds.bottom})
    }
  }
  assert.deepEqual(makeRoomPages([]),[{kind:'living',toys:[]}])
  assert.equal(makeRoomPages(['cat','cat'])[0].toys.length,1)
})

test('clothes hang in a wardrobe, farm animals live on a farm, and water friends stay in water', () => {
  const pages = makeRoomPages([...TOY_IDS])
  for (const id of ['shirt','pants','dress','coat','scarf','hat']) {
    assert.equal(roomFor(id),'wardrobe')
    assert.match(pages.flatMap(p=>p.toys).find(t=>t.id===id)!.seat.place,/挂钩/)
  }
  for (const id of ['cow','pig','horse','sheep','duck']) assert.equal(roomFor(id),'farm')
  for (const id of ['fish','boat']) assert.equal(roomFor(id),'pond')
  assert.deepEqual(pages.find(p=>p.kind==='reef')!.toys.map(t=>t.id),[...sharkConcepts])
  const pond = pages.find(p=>p.kind==='pond')!
  assert.ok(pond.toys.find(t=>t.id==='fish')!.seat.y > pond.toys.find(t=>t.id==='boat')!.seat.y + 15)
})

test('V28 positions remain accepted and untouched when a friend moves into a new scene', () => {
  const fixture = JSON.parse(readFileSync(new URL('../output/family-vehicles-v28/fixtures.json',import.meta.url),'utf8'))['zh-CN'].collected
  const before = structuredClone(fixture)
  before.roomPositions = Object.fromEntries(oldPages(before.collections.map((c:any)=>c.toyId)).flatMap(p=>p.toys).map(t=>[t.id,{x:t.seat.x,y:t.seat.y}]))
  validateState(before)
  const moved = moveRoomToy(before,'model-y',{x:45,y:85})
  validateState(JSON.parse(JSON.stringify(moved)))
  assert.deepEqual(moved.roomPositions,before.roomPositions)
  const {scenePositions,...rest}=moved
  assert.deepEqual(rest,before)
  assert.deepEqual(collectionPositions(before.roomPositions),{})
  assert.deepEqual(collectionPositions(moved.roomPositions,scenePositions),scenePositions)
  for (const id of Object.keys(before.roomPositions)) assert.ok(before.roomPositions[id])
  assert.throws(()=>validateState({...moved,scenePositions:{'model-y':{x:99,y:3}}}))
})
