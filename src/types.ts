export type Theme = {
  from: string
  to: string
  accent: string
  glyph: string
}

export type Chapter = {
  id: string
  label: string
  title: string
  subtitle: string
  file: string
  chars: number
  minutes: number
}

export type Topic = {
  name: string
  refs: string[]
  chapters: string[]
}

export type AuxKind = 'cheatsheet' | 'glossary' | 'patterns'

export type AuxFile = {
  kind: AuxKind
  label: string
  title: string
  file: string
  chars: number
  minutes: number
}

export type Book = {
  slug: string
  title: string
  author: string
  description: string
  category: string
  tagline: string
  theme: Theme
  intro: string
  scope: string
  chapterCount: number
  minutes: number
  chapters: Chapter[]
  topics: Topic[]
  aux: AuxFile[]
}

export type Library = {
  generatedAt: string
  source: string
  books: Book[]
}

export type SearchKind = 'overview' | 'chapter' | AuxKind

export type SearchEntry = {
  book: string
  bookTitle: string
  kind: SearchKind
  target: string | null
  title: string
  text: string
}

export type BookProgress = {
  visited: Record<string, number>
  last?: {
    chapterId: string
    ratio: number
    at: number
  }
}

export type ProgressStore = Record<string, BookProgress>
