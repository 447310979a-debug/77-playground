import { useEffect, useState } from 'react'
import { applyOfflineUpdate, askOfflineWorker } from './offline-update'
import { transact } from './storage'

export function OfflineUpdate() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>()
  const [waiting, setWaiting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState('正在读取')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (import.meta.env.DEV || !window.isSecureContext || !('serviceWorker' in navigator)) return
    let alive = true
    let registration: ServiceWorkerRegistration | undefined
    const watched = new Set<ServiceWorker>()
    const changed = () => {
      if (!alive || !registration) return
      setWaiting(!!registration.waiting)
      setBusy(!!registration.installing)
      setNote(registration.waiting ? '新版已完整下载，可以保存后重新打开。' : registration.installing ? '正在下载新版离线资源…' : '')
    }
    const watch = () => {
      const worker = registration?.installing
      if (worker && !watched.has(worker)) { watched.add(worker); worker.addEventListener('statechange', changed) }
      changed()
    }
    navigator.serviceWorker.getRegistration('/').then(async found => {
      if (!alive || !found) return
      registration = found
      setRegistration(found)
      found.addEventListener('updatefound', watch)
      watch()
      const controller = navigator.serviceWorker.controller
      if (controller) {
        const status = await askOfflineWorker(controller, 'GET_OFFLINE_STATUS')
        if (alive) setVersion(status.version?.slice(0, 10) ?? '暂时无法读取')
      } else if (alive) setVersion('首次准备中，完成后重新打开')
    }).catch(() => { if (alive) setVersion('暂时无法读取') })
    return () => {
      alive = false
      registration?.removeEventListener('updatefound', watch)
      for (const worker of watched) worker.removeEventListener('statechange', changed)
    }
  }, [])

  if (import.meta.env.DEV || !window.isSecureContext || !('serviceWorker' in navigator)) return null
  return <div>
    <p className="muted">当前页面资源版本：{version}</p>
    <button className="secondary" disabled={busy || !registration} onClick={async () => {
      if (!registration) return
      setBusy(true)
      try {
        if (waiting) await applyOfflineUpdate(registration, () => transact(state => state), () => window.location.reload())
        else {
          await registration.update()
          if (!registration.installing && !registration.waiting) setNote('当前已是最新版本。')
        }
      } catch (error) { setNote(error instanceof Error ? error.message : '暂时无法检查更新，请联网后重试。') }
      finally { setBusy(false) }
    }}>{busy ? '正在准备…' : waiting ? '保存并更新' : '检查更新'}</button>
    {note && <p role="status">{note}</p>}
  </div>
}
