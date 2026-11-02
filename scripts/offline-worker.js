/* Generated with build constants by scripts/build-offline.mjs. */
/* BUILD_CONSTANTS */
const CACHE_NAME = 'qiqi-trial-' + VERSION;
const STATUS_CACHE = 'qiqi-download-status-v1';
const STATUS_URL = new URL('/__qiqi_download_status__', self.location.origin).href;
const READY_URL = new URL('/__qiqi_offline_ready__', self.location.origin).href;
const BY_PATH = new Map(FILES.map(file => [file.path, file]));
const TOTAL_BYTES = FILES.reduce((sum, file) => sum + file.size_bytes, 0);
const PARALLEL_DOWNLOADS = 4;
const REQUEST_TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 3;
const assetUrl = file => new URL(file.path, self.location.origin).href;
const digestOf = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');

async function cachedStatus() {
  if (!(await caches.has(CACHE_NAME))) return false;
  const cache = await caches.open(CACHE_NAME);
  const marker = await cache.match(READY_URL);
  if (!marker || (await marker.text()) !== VERSION) return false;
  for (const file of FILES) if (!(await cache.match(assetUrl(file)))) return false;
  return true;
}

async function validCached(file, cache) {
  const response = await cache.match(assetUrl(file));
  if (!response) return false;
  const bytes = await response.arrayBuffer();
  return bytes.byteLength === file.size_bytes && await digestOf(bytes) === file.sha256;
}

async function fetchAsset(file, cache, batchSignal) {
  const url = new URL(file.download_path || file.path, self.location.origin);
  const controller = new AbortController();
  const stop = () => controller.abort();
  batchSignal?.addEventListener('abort', stop, { once: true });
  if (batchSignal?.aborted) stop();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url.href, { cache: 'reload', credentials: 'same-origin', redirect: 'error', signal: controller.signal });
    if (!response.ok || new URL(response.url).origin !== self.location.origin) {
      await response.body?.cancel();
      throw new Error('Asset unavailable: ' + file.path);
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== file.size_bytes || await digestOf(bytes) !== file.sha256) throw new Error('Asset changed: ' + file.path);
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.set('content-length', String(bytes.byteLength));
    headers.set('accept-ranges', 'bytes');
    if (file.path === '/index.html') headers.set('content-type', 'text/html; charset=utf-8');
    const checked = new Response(bytes, { status: 200, headers });
    await cache.put(assetUrl(file), checked.clone());
    return checked;
  } finally { clearTimeout(timeout); batchSignal?.removeEventListener('abort', stop); }
}

let downloadJob;
async function downloadPackage() {
  if (downloadJob) return downloadJob;
  downloadJob = preparePackage();
  try { return await downloadJob; } finally { downloadJob = undefined; }
}

async function preparePackage() {
  const cache = await caches.open(CACHE_NAME);
  const statusCache = await caches.open(STATUS_CACHE);
  const status = {
    version: VERSION, phase: 'checking', completedFiles: 0, completedBytes: 0,
    totalFiles: FILES.length, totalBytes: TOTAL_BYTES, currentPath: '', attempt: 0,
    error: '', updatedAt: Date.now(),
  };
  // Serialize status writes so slower writes cannot overwrite newer progress.
  let writes = Promise.resolve();
  const publish = () => {
    const body = JSON.stringify({ ...status, updatedAt: Date.now() });
    writes = writes.then(() => statusCache.put(STATUS_URL, new Response(body, { headers: { 'content-type': 'application/json' } })));
    return writes;
  };
  const complete = file => {
    status.completedFiles++;
    status.completedBytes += file.size_bytes;
  };
  let failed;
  let failedPath = '';
  const batch = new AbortController();
  try {
    await publish();
    const missing = [];
    for (const file of FILES) {
      if (await validCached(file, cache)) complete(file);
      else missing.push(file);
      if (status.completedFiles % 50 === 0 && status.completedFiles) await publish();
    }
    status.phase = 'downloading';
    await publish();
    let cursor = 0;
    const run = async () => {
      while (!failed && cursor < missing.length) {
        const file = missing[cursor++];
        try {
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            if (failed) return;
            status.currentPath = file.path;
            status.attempt = attempt;
            await publish();
            try { await fetchAsset(file, cache, batch.signal); break; }
            catch (error) {
              if (failed) return;
              if (attempt === MAX_ATTEMPTS || error?.name === 'QuotaExceededError' || String(error).includes('Asset changed:')) throw error;
              await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            }
          }
          complete(file);
          await publish();
        } catch (error) {
          if (!failed) { failed = error; failedPath = file.path; batch.abort(); }
        }
      }
    };
    // Finish in-flight writes before reporting failure. Keep verified files for retry.
    await Promise.all(Array.from({ length: PARALLEL_DOWNLOADS }, run));
    if (failed) throw failed;
    await cache.put(READY_URL, new Response(VERSION));
    status.phase = 'ready';
    status.currentPath = '';
    status.attempt = 0;
    await publish();
  } catch (error) {
    status.phase = 'failed';
    status.currentPath = failedPath || status.currentPath;
    status.error = error?.name === 'QuotaExceededError' ? 'storage-full'
      : String(error).includes('Asset changed:') ? 'integrity'
      : error?.name === 'AbortError' ? 'timeout' : 'network';
    // A storage failure must not discard previously downloaded resources or saves.
    await publish().catch(() => {});
    throw error;
  }
}

self.addEventListener('install', event => {
  event.waitUntil(downloadPackage());
  // Never skipWaiting automatically: updates wait until the parent saves the game.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (!(await cachedStatus())) throw new Error('Offline package incomplete');
    await self.clients.claim();
    const older = (await caches.keys()).filter(name => name.startsWith('qiqi-trial-') && name !== CACHE_NAME);
    for (const name of older.slice(0, -1)) await caches.delete(name);
  })());
});

async function withRange(request, response) {
  const header = request.headers.get('range');
  if (!header || !response.ok) return response;
  const bytes = await response.arrayBuffer();
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  const size = bytes.byteLength;
  let start = match && match[1] ? Number(match[1]) : 0;
  let end = match && match[2] ? Number(match[2]) : size - 1;
  if (match && !match[1] && match[2]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
  if (!match || (!match[1] && !match[2]) || start >= size || start > end || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
    return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + size } });
  }
  end = Math.min(end, size - 1);
  const headers = new Headers(response.headers);
  headers.set('content-range', 'bytes ' + start + '-' + end + '/' + size);
  headers.set('content-length', String(end - start + 1));
  headers.set('accept-ranges', 'bytes');
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const path = request.mode === 'navigate' ? '/index.html' : url.pathname;
  const file = BY_PATH.get(path);
  if (!file) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(assetUrl(file));
    return withRange(request, cached || await fetchAsset(file, cache));
  })());
});

self.addEventListener('message', event => {
  const reply = value => event.ports?.[0]?.postMessage(value);
  if (event.data?.type === 'RETRY_OFFLINE_DOWNLOAD') {
    event.waitUntil(downloadPackage().then(() => reply({ ready: true }), () => reply({ ready: false })));
    return;
  }
  if (event.data?.type === 'APPLY_OFFLINE_UPDATE') {
    event.waitUntil((async () => {
      if (!(await cachedStatus())) { reply({ accepted: false, reason: 'incomplete' }); return; }
      const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
        .filter(client => client.url.startsWith(self.registration.scope));
      if (windows.length !== 1 || windows[0].id !== event.source?.id) {
        reply({ accepted: false, reason: 'other-tabs' }); return;
      }
      reply({ accepted: true });
      await self.skipWaiting();
    })());
    return;
  }
  if (event.data?.type !== 'GET_OFFLINE_STATUS') return;
  event.waitUntil((async () => {
    const status = {
      type: 'OFFLINE_STATUS', ready: await cachedStatus(), version: VERSION,
      fileCount: FILES.length, totalBytes: TOTAL_BYTES, audioFiles: AUDIO_FILES,
      mediaValidatedAtBuild: true, audioPlaybackVerified: false,
    };
    if (event.ports?.[0]) reply(status);
    else event.source?.postMessage(status);
  })());
});
