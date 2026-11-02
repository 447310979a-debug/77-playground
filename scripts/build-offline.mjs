import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const generated = new Set(['sw.js', 'offline-manifest.json', 'offline-shell.bin'])

async function collect(directory, prefix = '') {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || (!prefix && generated.has(entry.name))) continue
    assert(!entry.isSymbolicLink(), `Symlinks cannot be packaged: ${entry.name}`)
    const relative = prefix + entry.name
    if (entry.isDirectory()) result.push(...await collect(join(directory, entry.name), relative + '/'))
    else {
      assert(entry.isFile(), `Unsupported build entry: ${relative}`)
      assert(/^[a-zA-Z0-9_./-]+$/.test(relative) && !relative.includes('..'), `Unsafe asset path: ${relative}`)
      const bytes = await readFile(join(directory, entry.name))
      assert(bytes.length > 0, `Empty build asset: ${relative}`)
      result.push({ path: '/' + relative, size_bytes: bytes.length, sha256: sha256(bytes) })
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path))
}

async function workerSource(files, manifest) {
  const template = await readFile(new URL('./offline-worker.js', import.meta.url), 'utf8')
  return template.replace('/* BUILD_CONSTANTS */', [
    `const VERSION = ${JSON.stringify(manifest.version)};`,
    `const FILES = ${JSON.stringify(files)};`,
    `const AUDIO_FILES = ${manifest.audio_files};`,
  ].join('\n'))
}

export async function buildOffline(directory = resolve('dist')) {
  const files = await collect(directory)
  // Netlify can append HTML to index.html. Fetch identical bytes via a binary
  // transport, then restore text/html in the verified offline response.
  const entry = files.find(file => file.path === '/index.html')
  if (entry) entry.download_path = '/offline-shell.bin'
  const byPath = new Map(files.map(file => [file.path, file]))
  assert(byPath.has('/index.html'), 'Build must contain index.html')
  for (const path of ['/assets/home-nature-v30.png', '/assets/collection-bathroom-v30.png', '/assets/collection-scenes-v29-a.png', '/assets/collection-scenes-v29-b.png', '/assets/collection-scenes-v29-c.png', '/assets/concepts.png', '/assets/concepts-alternate.png', '/assets/concepts-expanded.png', '/assets/concepts-expanded-alternate.png', '/assets/red-monster.png', '/assets/red-monster-chef-v21.png', '/assets/kitchen-recipes-v22.png', '/assets/panda-racers-v25.png', '/assets/wardrobe-garden-v26.png', '/assets/vehicles-v27.png', '/assets/family-vehicles-v28.png', '/assets/city-bus-v28.png', '/assets/collection-road-v27.png', '/assets/concepts-english-v8.png', '/assets/collection-living-room-v10.png', '/assets/collection-rooms-v11.png', '/assets/body-actions-v11.png', '/assets/themes-v13.png', '/assets/rooms-v13.png', '/assets/monster-expressions-v15.png', '/assets/story-backgrounds-v15.png', '/assets/ocean-family-v16.png', '/assets/daily-discoveries-v19.png']) {
    assert(byPath.has(path), `Required illustration missing: ${path}`)
    const png = await readFile(join(directory, path.slice(1)))
    assert(png.length > 24 && png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), `Invalid PNG: ${path}`)
    assert(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0, `Empty PNG dimensions: ${path}`)
  }
  const audio = JSON.parse(await readFile(join(directory, 'audio/manifest.json'), 'utf8'))
  assert(audio.clips.length === 895, 'The bilingual vehicles edition requires all 895 audio clips')
  const audioPaths = new Set()
  for (const clip of audio.clips) {
    assert(/^\/audio\/[a-zA-Z0-9_-]+\.mp3$/.test(clip.path), `Unsafe audio path: ${clip.path}`)
    assert(!audioPaths.has(clip.path), `Duplicate audio path: ${clip.path}`)
    audioPaths.add(clip.path)
    const file = byPath.get(clip.path)
    assert(file, `Missing audio: ${clip.path}`)
    assert(file.size_bytes === clip.size_bytes && file.sha256 === clip.sha256, `Audio differs from its checked manifest: ${clip.path}`)
    assert(clip.media_type === 'audio/mpeg' && Number.isFinite(clip.duration_ms) && clip.duration_ms >= 150, `Unchecked audio: ${clip.path}`)
    const bytes = await readFile(join(directory, clip.path.slice(1)))
    assert(bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224), `Invalid MP3 header: ${clip.path}`)
  }
  assert(files.filter(file => file.path.endsWith('.mp3')).length === audioPaths.size, 'Unlisted MP3 file in build')
  for (const file of files.filter(file => /\.(html|css|js|webmanifest)$/.test(file.path))) {
    const text = await readFile(join(directory, file.path.slice(1)), 'utf8')
    assert(!/(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(text), `External HTML dependency: ${file.path}`)
    assert(!/url\(\s*["']?(?:https?:)?\/\//i.test(text), `External CSS dependency: ${file.path}`)
    assert(!/(?:fetch|importScripts|WebSocket|EventSource)\s*\(\s*["'](?:https?:)?\/\//.test(text), `External network dependency: ${file.path}`)
  }
  const manifest = {
    version: sha256(JSON.stringify({ format: 2, files })).slice(0, 20),
    file_count: files.length,
    audio_files: audioPaths.size,
    total_bytes: files.reduce((total, file) => total + file.size_bytes, 0),
    files,
    verification: 'Build hashes and audio production manifest checked; actual device playback and offline use still require testing.',
  }
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
  await writeFile(join(directory, 'offline-shell.bin'), await readFile(join(directory, 'index.html')))
  await writeFile(join(directory, 'offline-manifest.json'), manifestBytes)
  const cachedFiles = [...files, {
    path: '/offline-manifest.json', size_bytes: manifestBytes.length, sha256: sha256(manifestBytes),
  }]
  await writeFile(join(directory, 'sw.js'), await workerSource(cachedFiles, manifest))
  console.log(`Offline package ${manifest.version}: ${manifest.file_count} assets, ${manifest.audio_files} audio, ${manifest.total_bytes} bytes.`)
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildOffline()
}
