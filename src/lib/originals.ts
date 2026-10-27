import type { OriginalBook, OriginalsManifest } from '../types'

const EMPTY: OriginalsManifest = { enabled: false, books: [] }
let promise: Promise<OriginalsManifest> | null = null

/**
 * 原文清单只由本地服务提供。
 * GitHub Pages 上该地址是 404，或会被 SPA fallback 成 HTML，这里统一降级为“未启用”。
 */
export function loadOriginals(): Promise<OriginalsManifest> {
  if (promise) return promise
  promise = fetch('./api/originals', {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })
    .then(async (res) => {
      const type = res.headers.get('content-type') || ''
      if (!res.ok || !type.includes('application/json')) return EMPTY
      const data = (await res.json()) as OriginalsManifest
      if (!data || !Array.isArray(data.books)) return EMPTY
      return { enabled: Boolean(data.enabled), books: data.books }
    })
    .catch(() => EMPTY)
  return promise
}

export function findOriginalForShelf(
  manifest: OriginalsManifest | null,
  slug: string,
): OriginalBook | undefined {
  return manifest?.books.find((book) => book.shelfSlug === slug || book.id === slug)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
