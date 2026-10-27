import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error 本地 Node 辅助模块，不参与前端类型检查
import { handleOriginalsRequest } from './scripts/originals.mjs'

export default defineConfig({
  // 相对路径，部署到 https://<user>.github.io/<repo>/ 或任意子目录都能直接使用
  base: './',
  plugins: [
    react(),
    {
      name: 'local-originals',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          try {
            if (await handleOriginalsRequest(req, res)) return
          } catch (err) {
            res.statusCode = 500
            res.end(`原文服务出错：${err instanceof Error ? err.message : String(err)}`)
            return
          }
          next()
        })
      },
    },
  ],
  optimizeDeps: {
    include: ['epubjs', 'pdfjs-dist'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
})
