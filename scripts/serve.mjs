#!/usr/bin/env node
/**
 * 构建产物的本地静态服务器。
 * 默认监听 0.0.0.0:4173，方便同一局域网内的手机 / 平板访问。
 *
 *   npm run build
 *   node scripts/serve.mjs
 *   PORT=8080 node scripts/serve.mjs
 */
import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { handleOriginalsRequest } from './originals.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const PORT = Number(process.env.PORT) || 4173
const HOST = process.env.HOST || '0.0.0.0'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
}

const server = http.createServer(async (req, res) => {
  try {
    if (await handleOriginalsRequest(req, res)) return

    const url = new URL(req.url || '/', 'http://localhost')
    const pathname = decodeURIComponent(url.pathname)
    let filePath = path.join(ROOT, pathname)

    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('403 Forbidden')
      return
    }

    let stat = await fs.stat(filePath).catch(() => null)
    if (stat?.isDirectory()) {
      filePath = path.join(filePath, 'index.html')
      stat = await fs.stat(filePath).catch(() => null)
    }

    if (!stat && !path.extname(pathname)) {
      filePath = path.join(ROOT, 'index.html')
      stat = await fs.stat(filePath).catch(() => null)
    }

    if (!stat) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('404 Not Found')
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    const data = await fs.readFile(filePath)
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': data.length,
      'cache-control':
        ext === '.html' || ext === '.json' ? 'no-cache' : 'public, max-age=3600',
    })
    if (req.method === 'HEAD') res.end()
    else res.end(data)
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`500 ${err.message}`)
  }
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，可用 PORT=8080 npm start 换一个端口。`)
  } else {
    console.error(err)
  }
  process.exitCode = 1
})

server.listen(PORT, HOST, () => {
  const urls = [`http://localhost:${PORT}`]
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      const isV4 = entry.family === 'IPv4' || entry.family === 4
      if (isV4 && !entry.internal) urls.push(`http://${entry.address}:${PORT}`)
    }
  }
  console.log('易读书架已启动：')
  for (const url of urls) console.log(`  ${url}`)
  console.log('\n同一局域网内的手机 / 平板可直接打开上面的地址。按 Ctrl+C 停止。')
})
