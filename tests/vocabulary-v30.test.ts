import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homeNatureConcepts, washroomConcepts } from '../src/concepts.ts'
import { bubbleConcepts, getBubbleRound } from '../src/bubbles.ts'
import { getBubbleRound as oldRound } from '../references/pre-v30/src/bubbles.ts'
import { makeRoomPages, roomFor, roomMoveBounds } from '../src/rooms.ts'
import { makeRoomPages as oldPages, roomMoveBounds as oldBounds } from '../references/pre-v30/src/rooms.ts'
import { TOY_IDS, validateState, createInitialState, startPlan, completeTask, answerMatch } from '../src/engine.ts'
const json=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'))

test('V30 adds exactly 12 bilingual concepts and 84 recordings while preserving all older content and speech',()=>{
 const before=json('../output/vocabulary-v30/trial-before.json'),current=json('../src/trial-content.json')
 const oldAudio=json('../output/vocabulary-v30/manifest-before.json'),audio=json('../public/audio/manifest.json')
 for(const old of before.items) assert.deepEqual(current.items.find((i:any)=>i.id===old.id),old)
 for(const old of oldAudio.clips){
  assert.deepEqual(audio.clips.find((c:any)=>c.id===old.id),old)
  assert.equal(createHash('sha256').update(readFileSync(new URL('../public'+old.path,import.meta.url))).digest('hex'),old.sha256)
 }
 assert.equal(current.items.length-before.items.length,24)
 assert.equal(audio.clips.length-oldAudio.clips.length,84)
 for(const language of ['zh-CN','en-US']) for(const concept of homeNatureConcepts){
  const item=current.items.find((i:any)=>i.language===language&&i.concept===concept)
  assert.equal(item.contentSource,'bilingual-expansion-v30')
  assert.ok(item.pictureNote&&item.example&&item.prompt)
  assert.equal(Object.keys(item.audio).length,language==='zh-CN'?4:3)
 }
})

test('new words enter bilingual lessons and version 10 bubbles without altering saved older questions',()=>{
 const content=json('../src/trial-content.json').items
 for(const language of ['zh-CN','en-US'] as const){
  assert.deepEqual(bubbleConcepts(10,language),[...bubbleConcepts(9,language),...homeNatureConcepts])
  for(let version=1;version<=9;version++)for(const progress of [0,1,2])assert.deepEqual(getBubbleRound('saved-v30-test','cat',progress,version,language),oldRound('saved-v30-test','cat',progress,version,language))
  const items=content.filter((i:any)=>i.language===language&&homeNatureConcepts.includes(i.concept))
  let state=createInitialState();state.settings.language=language
  for(let round=0;round<8;round++){
   state=startPlan(state,items)
   while(!state.plan!.completedAt){const t=state.plan!.tasks[state.plan!.index];if(t.kind==='match')for(const id of t.optionIds)state=answerMatch(state,t.id,id,id,new Date(),true);else state=completeTask(state,{taskId:t.id,outcome:'independent_correct',promptPlayed:true})}
   validateState(JSON.parse(JSON.stringify(state)))
  }
  for(const item of items)assert.ok(state.introduced[item.id])
 }
})

test('V30 adds logical scene placements without changing any older seat, bounds or saved state',()=>{
 const oldIds=TOY_IDS.filter(id=>!(homeNatureConcepts as readonly string[]).includes(id))
 const current=makeRoomPages([...TOY_IDS])
 for(const page of oldPages([...oldIds])) for(const toy of page.toys){
  const now=current.find(p=>p.kind===page.kind)!.toys.find(t=>t.id===toy.id)!
  assert.deepEqual(now,toy)
  assert.deepEqual(roomMoveBounds(page.kind,toy.id,now.seat),oldBounds(page.kind,toy.id,toy.seat))
 }
 for(const id of washroomConcepts)assert.equal(roomFor(id),'washroom')
 assert.equal(roomFor('chick'),'farm');assert.equal(roomFor('donkey'),'farm');assert.equal(roomFor('frog'),'pond');assert.equal(roomFor('dragonfly'),'garden')
 const oldSave=json('../output/scenes-v29/fixtures.json').full,before=structuredClone(oldSave)
 validateState(oldSave);assert.deepEqual(oldSave,before)
})
