import test from 'node:test'
import assert from 'node:assert/strict'
import { createPusherSound } from '../src/pusherSound.ts'

test('sound waits for a gesture, bounds overlapping voices, and cancels every rebound on stop', () => {
  const sources: any[] = []
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} })
  const node = () => ({ connect() {}, disconnect() {}, gain: param(), pan: param(), frequency: param() })
  let instances = 0
  class Context {
    state = 'running'; sampleRate = 44100; currentTime = 1; destination = node()
    constructor() { instances++ }
    createGain = node; createStereoPanner = node; createBiquadFilter = node
    createDynamicsCompressor() { return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() } }
    createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) } }
    createOscillator() { const source = { ...node(), startAt: 0, stopAt: 0, start(at: number) { this.startAt = at }, stop(at = 0) { this.stopAt = at } }; sources.push(source); return source }
    createBufferSource = this.createOscillator
    async resume() { this.state = 'running' }
    async suspend() { this.state = 'suspended' }
    async close() { this.state = 'closed' }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext')
  Object.defineProperty(globalThis, 'AudioContext', { value: Context, configurable: true })
  try {
    const sound = createPusherSound(); sound.impact(6)
    assert.equal(instances, 0); assert.equal(sources.length, 0)
    sound.unlock(); sound.impact(100); sound.impact(100)
    assert.ok(sources.length > 12 && sources.length <= 48)
    assert.ok(new Set(sources.map(s => s.startAt)).size > 3, 'collisions and rebounds need different timing')
    assert.ok(new Set(sources.map(s => s.frequency.value)).size > 6, 'coin pitches must vary')
    assert.ok(sources.every(s => s.stopAt > s.startAt))
    sound.stop(); assert.ok(sources.every(s => s.stopAt === 0))
    const count = sources.length; sound.impact(4); assert.equal(sources.length, count)
    sound.close()
  } finally {
    if (original) Object.defineProperty(globalThis, 'AudioContext', original)
    else Reflect.deleteProperty(globalThis, 'AudioContext')
  }
})
