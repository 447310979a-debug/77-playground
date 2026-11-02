// Local LAN only: serves dist via HTTPS and a certificate-only setup page via HTTP.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { X509Certificate } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { preview } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const local = join(root, '.local-https')
const config = JSON.parse(await readFile(join(local, 'config.json'), 'utf8'))
const addresses = Object.values(networkInterfaces()).flat().filter(Boolean).map(item => item.address)
if (!addresses.includes(config.lanAddress)) throw new Error('Mac 的局域网地址已改变，请重新运行 setup-local-https.py --ip 当前地址。')
const cert = await readFile(join(local, 'server.pem'))
const key = await readFile(join(local, 'server-key.pem'))
const certificate = new X509Certificate(cert)
if (!certificate.checkIP(config.lanAddress) || Date.parse(certificate.validTo) < Date.now()) throw new Error('本地证书已过期或地址不匹配，请先更新证书。')
await readFile(join(root, 'dist/index.html'))

const allowedFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/77-local-https.mobileconfig', ['77-local-https.mobileconfig', 'application/x-apple-aspen-config']],
  ['/77-local-test-ca.cer', ['77-local-test-ca.cer', 'application/x-x509-ca-cert']],
])
const files = new Map(await Promise.all([...allowedFiles].map(async ([url, [name, type]]) => [url, { data: await readFile(join(local, 'public', name)), type }])))
const setup = createServer((request, response) => {
  const path = new URL(request.url, `http://${config.lanAddress}`).pathname
  const file = files.get(path)
  if (!file || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }
  response.writeHead(200, {
    'content-type': file.type, 'content-length': file.data.length,
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
  })
  response.end(request.method === 'HEAD' ? undefined : file.data)
})
await new Promise((resolve, reject) => {
  setup.once('error', reject)
  setup.listen(config.setupPort, config.lanAddress, resolve)
})
let site
try {
  site = await preview({ root, configFile: false, build: { outDir: 'dist' },
    preview: { host: config.lanAddress, port: config.httpsPort, strictPort: true,
      https: { key, cert, minVersion: 'TLSv1.2' } } })
} catch (error) { setup.close(); throw error }
console.log(`iPad 证书安装页：http://${config.lanAddress}:${config.setupPort}/`)
console.log(`iPad 本地 HTTPS：https://${config.lanAddress}:${config.httpsPort}/`)
console.log('仅局域网；未发布。保持 Mac 开机，此窗口关闭后服务停止。')
const stop = () => { setup.close(); site.httpServer.close(); process.exit(0) }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
