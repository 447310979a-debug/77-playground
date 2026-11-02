import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webcrypto } from 'node:crypto'
import vm from 'node:vm'
import { buildOffline } from '../scripts/build-offline.mjs'
import { applyOfflineUpdate } from '../src/offline-update.ts'
import { downloadPercent } from '../src/offline-progress.ts'

const audioSource = fileURLToPath(new URL('../public/audio', import.meta.url))
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9WQAAAAASUVORK5CYII=', 'base64')

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'qiqi-offline-test-'))
  await mkdir(join(directory, 'assets'))
  await cp(audioSource, join(directory, 'audio'), { recursive: true })
  await writeFile(join(directory, 'assets/concepts.png'), png)
  await writeFile(join(directory, 'assets/concepts-alternate.png'), png)
  await writeFile(join(directory, 'assets/concepts-expanded.png'), png)
  await writeFile(join(directory, 'assets/concepts-expanded-alternate.png'), png)
  await writeFile(join(directory, 'assets/red-monster.png'), png)
  await writeFile(join(directory, 'assets/concepts-english-v8.png'), png)
  await writeFile(join(directory, 'assets/collection-living-room-v10.png'), png)
  await writeFile(join(directory, 'assets/collection-rooms-v11.png'), png)
  await writeFile(join(directory, 'assets/body-actions-v11.png'), png)
  await writeFile(join(directory, 'assets/themes-v13.png'), png)
  await writeFile(join(directory, 'assets/rooms-v13.png'), png)
  for (const asset of ['home-nature-v30.png','collection-bathroom-v30.png','collection-scenes-v29-a.png','collection-scenes-v29-b.png','collection-scenes-v29-c.png','city-bus-v28.png','family-vehicles-v28.png','vehicles-v27.png','collection-road-v27.png','wardrobe-garden-v26.png','panda-racers-v25.png','red-monster-chef-v21.png','kitchen-recipes-v22.png','monster-expressions-v15.png','story-backgrounds-v15.png','ocean-family-v16.png','daily-discoveries-v19.png']) await writeFile(join(directory, 'assets', asset), png)
  await writeFile(join(directory, 'index.html'), '<!doctype html><html lang="zh-CN"><title>offline fixture</title></html>')
  return directory
}

function workerHarness(source: string, directory: string, stored = new Map<string, Map<string, Response>>()) {
  const handlers: Record<string, (event: any) => void> = {}
  const origin = 'http://localhost:4177'
  let failure: string | null = null
  let claims = 0
  let skips = 0
  let corrupted = ''
  let hanging = ''
  let active = 0
  let maxActive = 0
  const requests: string[] = []
  let clients = [{ id: 'current', url: origin + '/' }]
  const caches = {
    has: async (name: string) => stored.has(name),
    keys: async () => [...stored.keys()],
    delete: async (name: string) => stored.delete(name),
    open: async (name: string) => {
      if (!stored.has(name)) stored.set(name, new Map())
      const cache = stored.get(name)!
      return {
        match: async (key: string) => cache.get(key)?.clone(),
        put: async (key: string, response: Response) => { cache.set(key, response.clone()) },
      }
    },
  }
  vm.runInNewContext(source, {
    caches, crypto: webcrypto, URL, Response, Headers, Uint8Array, AbortController,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms === 60000 ? 100 : Math.min(ms, 5)), clearTimeout,
    self: {
      location: { origin },
      registration: { scope: origin + '/' },
      clients: { claim: async () => { claims += 1 }, matchAll: async () => clients },
      skipWaiting: async () => { skips += 1 },
      addEventListener: (type: string, handler: (event: any) => void) => { handlers[type] = handler },
    },
    fetch: async (url: string, options: { signal: AbortSignal }) => {
      const path = new URL(url).pathname
      requests.push(path)
      active++
      maxActive = Math.max(active, maxActive)
      try {
        if (path === hanging) await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true }))
        if (failure === '*' || failure === path) throw new Error('fixture network unavailable')
        const bytes = path === corrupted ? 'corrupted response' : await readFile(join(directory, path.slice(1)))
        // Simulate the hosting platform appending content to every HTML response.
        const response = new Response(path.endsWith('.html') ? String(bytes) + '<script>platform badge</script>' : bytes)
        Object.defineProperty(response, 'url', { value: url })
        return response
      } finally { active-- }
    },
  })
  async function lifecycle(type: string) {
    let work: Promise<unknown> | undefined
    handlers[type]({ waitUntil: (promise: Promise<unknown>) => { work = promise } })
    await work
  }
  async function message(type: string, clientId = 'current') {
    let work: Promise<unknown> | undefined
    let result: any
    handlers.message({
      data: { type },
      source: { id: clientId },
      ports: [{ postMessage: (value: unknown) => { result = value } }],
      waitUntil: (promise: Promise<unknown>) => { work = promise },
    })
    await work
    return result
  }
  async function request(path: string, range?: string, navigate = false) {
    let result: Promise<Response> | undefined
    handlers.fetch({
      request: { url: origin + path, method: 'GET', mode: navigate ? 'navigate' : 'cors', headers: new Headers(range ? { range } : {}) },
      respondWith: (promise: Promise<Response>) => { result = promise },
    })
    return result
  }
  return {
    stored, caches, lifecycle, message, status: () => message('GET_OFFLINE_STATUS'), request, origin,
    fail: (value: string | null) => { failure = value }, claims: () => claims, skips: () => skips,
    corrupt: (path: string) => { corrupted = path }, hang: (path: string) => { hanging = path },
    requests, maxActive: () => maxActive,
    progress: async () => JSON.parse(await (await (await caches.open('qiqi-download-status-v1')).match(origin + '/__qiqi_download_status__'))!.text()),
    clients: (ids: string[]) => { clients = ids.map(id => ({ id, url: origin + '/' })) },
  }
}

test('offline package is deterministic and rejects missing pictures, changed audio and external dependencies', async () => {
  const directory = await fixture()
  try {
    const first = await buildOffline(directory)
    const second = await buildOffline(directory)
    assert.equal(first.version, second.version)
    assert.equal(first.audio_files, 895)
    assert.ok(first.files.some(file => file.path === '/assets/collection-living-room-v10.png'))
    await rm(join(directory, 'assets/collection-living-room-v10.png'))
    await assert.rejects(buildOffline(directory), /Required illustration missing/)
    await writeFile(join(directory, 'assets/collection-living-room-v10.png'), png)
    await rm(join(directory, 'assets/concepts-alternate.png'))
    await assert.rejects(buildOffline(directory), /Required illustration missing/)
    await writeFile(join(directory, 'assets/concepts-alternate.png'), png)
    await writeFile(join(directory, 'index.html'), '<script src="https://example.invalid/app.js"></script>')
    await assert.rejects(buildOffline(directory), /External HTML dependency/)
    await writeFile(join(directory, 'index.html'), '<html>fixture</html>')
    await writeFile(join(directory, 'audio/zh_021-label.mp3'), 'changed')
    await assert.rejects(buildOffline(directory), /Audio differs/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('failed install retains old package; complete cache serves offline navigation and audio ranges', async () => {
  const directory = await fixture()
  try {
    const manifest = await buildOffline(directory)
    const source = await readFile(join(directory, 'sw.js'), 'utf8')
    const worker = workerHarness(source, directory)
    await worker.caches.open('qiqi-trial-older')
    await worker.caches.open('qiqi-trial-previous')
    worker.fail('/audio/zh_021-label.mp3')
    await assert.rejects(worker.lifecycle('install'), /network unavailable/)
    assert.equal(await worker.caches.has('qiqi-trial-previous'), true)
    const partial = worker.stored.get('qiqi-trial-' + manifest.version)!
    assert.ok(partial.size > 0, 'verified files must survive failure')
    const retained = [...partial.keys()].map(url => new URL(url).pathname)
    const failedProgress = await worker.progress()
    assert.equal(failedProgress.phase, 'failed')
    assert.equal(failedProgress.completedFiles, partial.size)
    assert.ok(failedProgress.completedBytes > 0)
    assert.equal(downloadPercent(failedProgress) < 100, true)
    const firstRequests = worker.requests.length
    assert.equal((await worker.message('APPLY_OFFLINE_UPDATE')).reason, 'incomplete')
    assert.equal(worker.skips(), 0)
    worker.fail(null)
    await worker.lifecycle('install')
    assert.ok(retained.every(path => !worker.requests.slice(firstRequests).includes(path)), 'resume must not redownload completed files')
    const finished = await worker.progress()
    assert.equal(finished.phase, 'ready')
    assert.equal(finished.completedFiles, finished.totalFiles)
    assert.equal(finished.completedBytes, finished.totalBytes)
    assert.equal(downloadPercent(finished), 100)
    assert.ok(worker.maxActive() > 1 && worker.maxActive() <= 4)
    assert.ok(worker.requests.includes('/offline-shell.bin'))
    assert.equal(worker.requests.includes('/index.html'), false)
    assert.equal(worker.skips(), 0)
    assert.equal((await worker.status()).ready, true)
    assert.equal((await worker.status()).audioPlaybackVerified, false)
    await worker.lifecycle('activate')
    assert.equal(worker.claims(), 1)
    assert.equal((await worker.caches.keys()).filter(name => name.startsWith('qiqi-trial-')).length, 2)
    const current = [...worker.stored.entries()].find(([name]) => name === 'qiqi-trial-' + manifest.version)!
    current[1].delete(worker.origin + '/audio/zh_021-label.mp3')
    assert.equal((await worker.status()).ready, false)
    await worker.request('/audio/zh_021-label.mp3')
    assert.equal((await worker.status()).ready, true)
    worker.fail('*')
    const navigation = await worker.request('/some-page', undefined, true)
    assert.match(await navigation!.text(), /offline fixture/)
    assert.equal(navigation!.headers.get('content-type'), 'text/html; charset=utf-8')
    const range = await worker.request('/audio/zh_021-label.mp3', 'bytes=0-9')
    assert.equal(range!.status, 206)
    assert.equal((await range!.arrayBuffer()).byteLength, 10)
    const suffix = await worker.request('/audio/zh_021-label.mp3', 'bytes=-5')
    assert.equal((await suffix!.arrayBuffer()).byteLength, 5)
    assert.equal((await worker.request('/audio/zh_021-label.mp3', 'bytes=999999-'))!.status, 416)
    assert.equal(await worker.request('/api/unknown'), undefined)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('corrupted files and stalled requests never report complete; retry preserves verified content', async () => {
  const directory = await fixture()
  try {
    await buildOffline(directory)
    const source = await readFile(join(directory, 'sw.js'), 'utf8')
    const worker = workerHarness(source, directory)
    worker.corrupt('/offline-shell.bin')
    await assert.rejects(worker.lifecycle('install'), /Asset changed: \/index.html/)
    const failed = await worker.progress()
    assert.equal(failed.phase, 'failed')
    assert.equal(failed.error, 'integrity')
    assert.equal((await worker.status()).ready, false)
    const beforeRetry = worker.requests.length
    worker.corrupt('')
    await worker.lifecycle('install')
    assert.ok(worker.requests.length - beforeRetry <= 2, 'late failure should retry only the missing shell and possibly manifest')
    const html = await (await worker.request('/', undefined, true))!.text()
    assert.equal(html, await readFile(join(directory, 'index.html'), 'utf8'), 'platform additions must not enter the offline shell')

    const stalled = workerHarness(source, directory)
    stalled.hang('/offline-shell.bin')
    await assert.rejects(stalled.lifecycle('install'), /Timed out/)
    assert.equal((await stalled.progress()).error, 'timeout')
    assert.equal(stalled.requests.filter(path => path === '/offline-shell.bin').length, 3)
    assert.equal((await stalled.status()).ready, false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('a complete update waits for an explicit request and protects other open game pages', async () => {
  const directory = await fixture()
  try {
    await buildOffline(directory)
    const previous = workerHarness(await readFile(join(directory, 'sw.js'), 'utf8'), directory)
    await previous.lifecycle('install')
    await previous.lifecycle('activate')
    await previous.caches.open('unrelated-site-cache')
    await writeFile(join(directory, 'index.html'), '<!doctype html><title>new package</title>')
    await buildOffline(directory)
    const update = workerHarness(await readFile(join(directory, 'sw.js'), 'utf8'), directory, previous.stored)
    await update.lifecycle('install')
    assert.equal(update.skips(), 0)
    assert.equal(update.claims(), 0)
    previous.fail('*')
    assert.match(await (await previous.request('/', undefined, true))!.text(), /offline fixture/)
    update.clients(['current', 'another-game'])
    assert.equal((await update.message('APPLY_OFFLINE_UPDATE')).reason, 'other-tabs')
    assert.equal(update.skips(), 0)
    update.clients(['current'])
    assert.equal((await update.message('APPLY_OFFLINE_UPDATE', 'unknown')).reason, 'other-tabs')
    assert.equal(update.skips(), 0)
    assert.equal((await update.message('APPLY_OFFLINE_UPDATE')).accepted, true)
    assert.equal(update.skips(), 1)
    await update.lifecycle('activate')
    update.fail('*')
    assert.match(await (await update.request('/', undefined, true))!.text(), /new package/)
    assert.match(await (await previous.request('/', undefined, true))!.text(), /offline fixture/)
    assert.equal(await update.caches.has('unrelated-site-cache'), true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('update action waits for saving and activation; failed save or unfinished game never reloads', async () => {
  let sent: () => void = () => {}
  const messageSent = new Promise<void>(resolve => { sent = resolve })
  class WaitingWorker extends EventTarget {
    state = 'installed'
    messages = 0
    postMessage(_message: unknown, ports: MessagePort[]) {
      this.messages++
      ports[0].postMessage({ accepted: true })
      ports[0].close()
      sent()
    }
  }
  const worker = new WaitingWorker()
  const registration = { waiting: worker } as unknown as ServiceWorkerRegistration
  let reloads = 0
  let finishSave: (value: { game: null }) => void = () => {}
  const updating = applyOfflineUpdate(registration, () => new Promise(resolve => { finishSave = resolve }), () => { reloads++ })
  assert.equal(worker.messages, 0)
  finishSave({ game: null })
  await messageSent
  assert.equal(worker.messages, 1)
  assert.equal(reloads, 0)
  worker.state = 'activated'
  worker.dispatchEvent(new Event('statechange'))
  await updating
  assert.equal(reloads, 1)

  await assert.rejects(applyOfflineUpdate(registration, async () => { throw new Error('save failed') }, () => { reloads++ }), /save failed/)
  await assert.rejects(applyOfflineUpdate(registration, async () => ({ game: { id: 'unfinished' } as any }), () => { reloads++ }), /先玩完再更新/)
  assert.equal(worker.messages, 1)
  assert.equal(reloads, 1)
})
