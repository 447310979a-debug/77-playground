import { useCallback, useEffect, useRef, useState } from 'react'
import { applyOfflineUpdate, askOfflineWorker } from './offline-update'
import { downloadError, downloadPercent, downloadStatusCache, downloadStatusPath, resourceLabel } from './offline-progress'
import type { DownloadProgress } from './offline-progress'
import { transact } from './storage'

export function OfflineUpdate({ visible, detailed }: { visible: boolean; detailed: boolean }) {
  const [progress, setProgress] = useState<DownloadProgress>()
  const [phase, setPhase] = useState('starting')
  const [waiting, setWaiting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined)
  const mounted = useRef(false)
  const polling = useRef(false)
  const verified = useRef('')
  const startedAt = useRef(Date.now())
  const supported = window.isSecureContext && 'serviceWorker' in navigator && 'caches' in window

  const refresh = useCallback(async () => {
    if (!mounted.current || polling.current) return
    polling.current = true
    try {
      const found = await navigator.serviceWorker.getRegistration('/')
      if (!mounted.current) return
      registration.current = found
      setWaiting(!!found?.waiting)
      const cache = await caches.open(downloadStatusCache)
      const response = await cache.match(downloadStatusPath)
      const current: DownloadProgress | undefined = response ? await response.json() : undefined
      if (!mounted.current) return
      if (!current) {
        if (Date.now() - startedAt.current > 15000 && !found?.installing) setPhase('paused')
        return
      }
      setProgress(current)
      if (current.phase === 'ready') {
        const worker = found?.waiting ?? found?.active
        const key = current.version + ':' + current.updatedAt
        if (worker && verified.current !== key) {
          const status = await askOfflineWorker(worker, 'GET_OFFLINE_STATUS')
          if (!mounted.current) return
          if (!status.ready || status.version !== current.version) { setPhase(found?.installing ? 'checking' : 'paused'); return }
          verified.current = key
        }
        setPhase(worker ? 'ready' : 'paused')
      } else if (current.phase === 'failed') setPhase('failed')
      else if (!found?.installing && Date.now() - current.updatedAt > 5000) setPhase('paused')
      else setPhase(current.phase)
    } catch {
      if (mounted.current) { setPhase('paused'); setNote('暂时无法确认下载状态，可以点继续下载重试。') }
    } finally { polling.current = false }
  }, [])

  const register = useCallback(async () => {
    startedAt.current = Date.now()
    const found = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    if (mounted.current) registration.current = found
    return found
  }, [])

  useEffect(() => {
    if (!supported || import.meta.env.DEV) return
    mounted.current = true
    void register().then(refresh).catch(() => {
      if (mounted.current) { setPhase('failed'); setNote('下载没有启动，请检查网络后重试。') }
    })
    const timer = window.setInterval(() => { void refresh() }, 1000)
    const resumed = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', resumed)
    navigator.serviceWorker.addEventListener('controllerchange', resumed)
    return () => {
      mounted.current = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', resumed)
      navigator.serviceWorker.removeEventListener('controllerchange', resumed)
    }
  }, [refresh, register, supported])

  async function act() {
    setBusy(true)
    setNote('')
    try {
      if (registration.current?.waiting) {
        await applyOfflineUpdate(registration.current, () => transact(state => state), () => window.location.reload())
      } else {
        const retry = phase === 'failed' || phase === 'paused'
        setPhase('starting')
        verified.current = ''
        const found = await register()
        if (!found.installing) await found.update()
        if (retry && !found.installing && !found.waiting && found.active) {
          found.active.postMessage({ type: 'RETRY_OFFLINE_DOWNLOAD' })
        } else if (!found.installing && !found.waiting && !retry) setNote('当前已是最新版本。')
        await refresh()
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : '暂时无法继续，请检查网络后重试。')
      if (!registration.current?.waiting) setPhase('paused')
    } finally { setBusy(false) }
  }

  if (!visible) return null
  if (!supported || import.meta.env.DEV) return detailed ? <p className="muted">当前是联网开发预览；下载与断网测试请用本机构建预览地址。</p> : null
  const ready = phase === 'ready'
  const interrupted = phase === 'failed' || phase === 'paused'
  const percent = progress ? downloadPercent({ ...progress, phase: ready ? 'ready' : progress.phase === 'ready' ? 'checking' : progress.phase }) : 0
  const title = ready ? (waiting ? '新版已下载完成' : '图片和声音已保存到本机')
    : interrupted ? '下载暂停了，已保存的内容会保留'
    : phase === 'checking' ? '正在检查已下载的内容' : '正在下载图片和声音'
  const mb = (bytes: number) => (bytes / 1_000_000).toFixed(1)

  return <section className={`offline-download${ready ? ' is-ready' : ''}${interrupted ? ' is-interrupted' : ''}`} aria-label="素材下载">
    <div className="offline-download-heading"><strong role="status">{title}</strong>{!ready && <b>{percent}%</b>}</div>
    {!ready && <progress max={100} value={percent} aria-label="素材下载进度" />}
    {progress && (!ready || detailed) && <p className="offline-download-counts">已保存 {mb(progress.completedBytes)} / {mb(progress.totalBytes)} MB<span>{progress.completedFiles} / {progress.totalFiles} 个文件</span></p>}
    {!ready && progress?.currentPath && <p className="offline-download-file">{interrupted ? '停在' : '正在处理'}：{resourceLabel(progress.currentPath)} · {progress.currentPath.split('/').at(-1)}{!interrupted && progress.attempt > 1 ? `（重试 ${progress.attempt - 1}/2）` : ''}</p>}
    <p className="offline-download-hint">{ready ? waiting ? '请在家长入口保存进度后启用新版。' : '可以尝试断网打开。' : interrupted ? progress?.phase === 'failed' ? downloadError(progress.error) : '返回页面后可以继续，只补下载还缺的内容。' : '首次准备时请保持这个页面打开；已保存的大小按完整文件统计。'}</p>
    {note && <p role="status" className="offline-download-note">{note}</p>}
    {(interrupted || detailed && ready) && <button className="secondary" disabled={busy} onClick={() => void act()}>{busy ? '正在处理…' : waiting ? '保存并更新' : interrupted ? '继续下载' : '检查更新'}</button>}
  </section>
}
