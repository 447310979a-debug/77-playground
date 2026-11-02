import type { State } from './engine'

type WorkerReply = { ready?: boolean; version?: string; accepted?: boolean; reason?: string }

export function askOfflineWorker(worker: ServiceWorker, type: string): Promise<WorkerReply> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('更新暂时没有回应，请稍后再试。')) }, 10000)
    channel.port1.onmessage = event => {
      clearTimeout(timeout)
      channel.port1.close()
      resolve(event.data)
    }
    worker.postMessage({ type }, [channel.port2])
  })
}

export async function applyOfflineUpdate(
  registration: ServiceWorkerRegistration,
  save: () => Promise<Pick<State, 'game'>>,
  reload: () => void,
) {
  const worker = registration.waiting
  if (!worker) throw new Error('新版还没准备好，请稍后检查更新。')
  const saved = await save()
  if (saved.game && !saved.game.claimedAt) throw new Error('这一局还没领回小伙伴，先玩完再更新。')
  const result = await askOfflineWorker(worker, 'APPLY_OFFLINE_UPDATE')
  if (!result.accepted) throw new Error(result.reason === 'other-tabs'
    ? '请先关闭其他乐园标签页，再点保存并更新。'
    : '新版离线资源还不完整，请保持联网后再试。')
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout)
      worker.removeEventListener('statechange', changed)
      if (error) reject(error)
      else resolve()
    }
    const changed = () => {
      if (worker.state === 'activated') finish()
      else if (worker.state === 'redundant') finish(new Error('新版启用失败，已保留当前页面。'))
    }
    const timeout = setTimeout(() => finish(new Error('新版仍在准备，请稍后再试。')), 10000)
    worker.addEventListener('statechange', changed)
    changed()
  })
  reload()
}
