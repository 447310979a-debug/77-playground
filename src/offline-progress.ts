export const downloadStatusCache = 'qiqi-download-status-v1'
export const downloadStatusPath = '/__qiqi_download_status__'

export type DownloadProgress = {
  version: string
  phase: 'checking' | 'downloading' | 'failed' | 'ready'
  completedFiles: number
  completedBytes: number
  totalFiles: number
  totalBytes: number
  currentPath: string
  attempt: number
  error: string
  updatedAt: number
}

export function downloadPercent(progress: DownloadProgress): number {
  if (progress.phase === 'ready') return 100
  return Math.min(99, Math.max(0, Math.floor(progress.completedBytes / Math.max(1, progress.totalBytes) * 100)))
}

export function downloadError(code: string): string {
  if (code === 'storage-full') return '设备剩余空间不足。请先腾出一些空间，再继续下载。'
  if (code === 'integrity') return '有一个文件与当前版本不一致，请稍后重试。'
  if (code === 'timeout') return '有一个文件等待太久，请检查网络后继续。'
  return '网络暂时没有连通，请检查网络后继续。'
}

export function resourceLabel(path: string): string {
  if (path.endsWith('.mp3')) return '声音'
  if (/\.(png|webp|svg)$/.test(path)) return '图片'
  return '页面与资料'
}
