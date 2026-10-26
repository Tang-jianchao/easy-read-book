import type { Library, SearchEntry } from '../types'

const base = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`

export function assetUrl(path: string): string {
  return `${base}library/${path.replace(/^\//, '')}`
}

let libraryPromise: Promise<Library> | null = null
let searchPromise: Promise<SearchEntry[]> | null = null
const fileCache = new Map<string, Promise<string>>()

export function loadLibrary(): Promise<Library> {
  if (!libraryPromise) {
    libraryPromise = fetch(assetUrl('index.json'))
      .then((res) => {
        if (!res.ok) throw new Error(`书架索引加载失败（HTTP ${res.status}）`)
        return res.json() as Promise<Library>
      })
      .catch((err) => {
        libraryPromise = null
        throw err
      })
  }
  return libraryPromise
}

export function loadSearchIndex(): Promise<SearchEntry[]> {
  if (!searchPromise) {
    searchPromise = fetch(assetUrl('search.json'))
      .then((res) => {
        if (!res.ok) throw new Error(`检索索引加载失败（HTTP ${res.status}）`)
        return res.json() as Promise<SearchEntry[]>
      })
      .catch((err) => {
        searchPromise = null
        throw err
      })
  }
  return searchPromise
}

export function loadBookFile(slug: string, file: string): Promise<string> {
  const key = `${slug}/${file}`
  const cached = fileCache.get(key)
  if (cached) return cached
  const promise = fetch(assetUrl(`books/${slug}/${file}`))
    .then((res) => {
      if (!res.ok) throw new Error(`章节加载失败（HTTP ${res.status}）`)
      return res.text()
    })
    .catch((err) => {
      fileCache.delete(key)
      throw err
    })
  fileCache.set(key, promise)
  return promise
}
