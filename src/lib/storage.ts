import { useEffect, useState } from 'react'
import type { Book, BookProgress, ProgressStore } from '../types'

const THEME_KEY = 'easybook:theme'
const FONT_KEY = 'easybook:font'
const PROGRESS_KEY = 'easybook:progress'
const THEME_EVENT = 'easybook:theme'

export type ThemeMode = 'light' | 'dark'
export type FontLevel = 0 | 1 | 2

export const FONT_LABELS: Record<FontLevel, string> = {
  0: '小',
  1: '中',
  2: '大',
}

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 隐私模式下忽略
  }
}

export function getStoredTheme(): ThemeMode | null {
  const value = readLocal(THEME_KEY)
  return value === 'light' || value === 'dark' ? value : null
}

export function getThemeMode(): ThemeMode {
  const stored = getStoredTheme()
  if (stored) return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = mode === 'dark' ? '#14120f' : '#f4efe5'
}

export function setThemeMode(mode: ThemeMode) {
  writeLocal(THEME_KEY, mode)
  applyTheme(mode)
  window.dispatchEvent(new Event(THEME_EVENT))
}

export function toggleTheme() {
  setThemeMode(getThemeMode() === 'dark' ? 'light' : 'dark')
}

export function useThemeMode(): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>(() => getThemeMode())
  useEffect(() => {
    const onChange = () => setMode(getThemeMode())
    window.addEventListener(THEME_EVENT, onChange)
    return () => window.removeEventListener(THEME_EVENT, onChange)
  }, [])
  return mode
}

export function getFontLevel(): FontLevel {
  const value = Number(readLocal(FONT_KEY))
  return value === 0 || value === 2 ? value : 1
}

export function setFontLevel(level: FontLevel) {
  writeLocal(FONT_KEY, String(level))
  document.documentElement.dataset.font = String(level)
}

function readProgress(): ProgressStore {
  const raw = readLocal(PROGRESS_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as ProgressStore
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeProgress(store: ProgressStore) {
  writeLocal(PROGRESS_KEY, JSON.stringify(store))
}

export function getBookProgress(slug: string): BookProgress | undefined {
  return readProgress()[slug]
}

export function markVisited(slug: string, chapterId: string) {
  const store = readProgress()
  const book = (store[slug] ||= { visited: {} })
  book.visited[chapterId] = Date.now()
  writeProgress(store)
}

export function saveReadingPosition(slug: string, chapterId: string, ratio: number) {
  const store = readProgress()
  const book = (store[slug] ||= { visited: {} })
  book.visited[chapterId] = Date.now()
  book.last = {
    chapterId,
    ratio: Math.min(1, Math.max(0, ratio)),
    at: Date.now(),
  }
  writeProgress(store)
}

export type ResumeTarget = {
  book: Book
  chapterId: string
  chapterTitle: string
  ratio: number
}

export function mostRecentRead(books: Book[]): ResumeTarget | null {
  const store = readProgress()
  let best: ResumeTarget | null = null
  let bestAt = 0
  for (const [slug, progress] of Object.entries(store)) {
    if (!progress.last || progress.last.at <= bestAt) continue
    const book = books.find((b) => b.slug === slug)
    if (!book) continue
    const chapter = book.chapters.find((c) => c.id === progress.last?.chapterId)
    if (!chapter) continue
    bestAt = progress.last.at
    best = {
      book,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      ratio: progress.last.ratio,
    }
  }
  return best
}

export function lastReadForBook(book: Book): { chapterId: string; ratio: number } | null {
  const progress = getBookProgress(book.slug)
  if (!progress?.last) return null
  if (!book.chapters.some((c) => c.id === progress.last?.chapterId)) return null
  return { chapterId: progress.last.chapterId, ratio: progress.last.ratio }
}
