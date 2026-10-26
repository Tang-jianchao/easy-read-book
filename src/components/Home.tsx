import { useEffect, useMemo, useState } from 'react'
import type { Book, Library, SearchEntry, SearchKind } from '../types'
import { loadSearchIndex } from '../lib/data'
import { escapeRegExp } from '../lib/markdown'
import { navigate } from '../lib/router'
import { mostRecentRead } from '../lib/storage'
import { Cover, Spinner, ThemeButton } from './Bits'
import { Icon } from './Icon'

const KIND_LABELS: Record<SearchKind, string> = {
  overview: '概览',
  chapter: '章节',
  cheatsheet: '速查表',
  glossary: '术语表',
  patterns: '模式库',
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'ig'))
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={index}>{part}</mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  )
}

function makeSnippet(text: string, query: string, index: number): string {
  const radius = 46
  if (index < 0) return text.slice(0, 96)
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + query.length + radius)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

function openEntry(entry: SearchEntry) {
  if (entry.kind === 'chapter' && entry.target) {
    navigate(`/book/${entry.book}/ch/${entry.target}`)
  } else if (entry.kind === 'overview') {
    navigate(`/book/${entry.book}`)
  } else {
    navigate(`/book/${entry.book}?tab=${entry.kind}`)
  }
}

function BookCard({ book }: { book: Book }) {
  return (
    <button
      type="button"
      className="book-card"
      onClick={() => navigate(`/book/${book.slug}`)}
      aria-label={`打开《${book.title}》`}
    >
      <Cover book={book} />
      <span className="book-card__tagline">{book.tagline}</span>
      <span className="book-card__meta">
        {book.chapterCount} 章 · 约 {book.minutes} 分钟
      </span>
    </button>
  )
}

export function Home({ library }: { library: Library }) {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<SearchEntry[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const totals = useMemo(() => {
    return library.books.reduce(
      (acc, book) => ({
        chapters: acc.chapters + book.chapterCount,
        minutes: acc.minutes + book.minutes,
      }),
      { chapters: 0, minutes: 0 },
    )
  }, [library])

  const resume = useMemo(() => mostRecentRead(library.books), [library])
  const needle = query.trim()

  useEffect(() => {
    if (!needle || entries) return
    let cancelled = false
    loadSearchIndex()
      .then((data) => {
        if (!cancelled) setEntries(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setSearchError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [needle, entries])

  const bookHits = useMemo(() => {
    if (!needle) return []
    const q = needle.toLowerCase()
    return library.books.filter((book) =>
      [book.title, book.author, book.tagline, book.category, book.description]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [library, needle])

  const contentHits = useMemo(() => {
    if (!needle || !entries) return []
    const q = needle.toLowerCase()
    const hits: Array<{ entry: SearchEntry; snippet: string; titleHit: boolean }> = []
    for (const entry of entries) {
      const titleHit = entry.title.toLowerCase().includes(q)
      const index = entry.text.toLowerCase().indexOf(q)
      if (!titleHit && index < 0) continue
      hits.push({ entry, snippet: makeSnippet(entry.text, needle, index), titleHit })
    }
    hits.sort((a, b) => {
      if (a.titleHit !== b.titleHit) return Number(b.titleHit) - Number(a.titleHit)
      return Number(b.entry.kind === 'chapter') - Number(a.entry.kind === 'chapter')
    })
    return hits.slice(0, 60)
  }, [entries, needle])

  return (
    <div className="shell home">
      <header className="home-head">
        <div className="brand-row">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              书
            </span>
            <div>
              <h1>我的书架</h1>
              <p>
                {library.books.length} 本书 · {totals.chapters} 个章节 · 约 {totals.minutes} 分钟速览
              </p>
            </div>
          </div>
          <ThemeButton />
        </div>

        <div className="search">
          <span className="search__icon">
            <Icon name="search" size={18} />
          </span>
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            placeholder="搜索书名、章节、概念…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索书架"
          />
          {query && (
            <button
              type="button"
              className="search__clear"
              onClick={() => setQuery('')}
              aria-label="清空搜索"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </header>

      {needle ? (
        <section className="search-view">
          <div className="search-status">
            <span>
              {bookHits.length + contentHits.length > 0
                ? `${bookHits.length} 本书 · ${contentHits.length} 条内容`
                : searchError
                  ? searchError
                  : entries
                    ? '没有找到匹配内容'
                    : '正在载入检索索引…'}
            </span>
            {!entries && !searchError && <Spinner />}
          </div>

          {contentHits.length > 0 && (
            <>
              <div className="section-head">
                <h2>内容</h2>
                <span>{contentHits.length} 条</span>
              </div>
              <div className="result-list">
                {contentHits.map(({ entry, snippet }, index) => (
                  <button
                    type="button"
                    className="result"
                    key={`${entry.book}-${entry.kind}-${entry.target || entry.title}-${index}`}
                    onClick={() => openEntry(entry)}
                  >
                    <span className="result__meta">
                      <span>{entry.bookTitle}</span>
                      <span className="dot" />
                      <span>{KIND_LABELS[entry.kind]}</span>
                    </span>
                    <span className="result__title">
                      <Highlight text={entry.title} query={needle} />
                    </span>
                    <span className="result__snippet">
                      <Highlight text={snippet} query={needle} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {bookHits.length > 0 && (
            <>
              <div className="section-head">
                <h2>相关书籍</h2>
                <span>{bookHits.length} 本</span>
              </div>
              <div className="book-grid">
                {bookHits.map((book) => (
                  <BookCard key={book.slug} book={book} />
                ))}
              </div>
            </>
          )}
        </section>
      ) : (
        <>
          {resume && (
            <button
              type="button"
              className="continue"
              onClick={() =>
                navigate(`/book/${resume.book.slug}/ch/${resume.chapterId}?resume=1`)
              }
            >
              <Cover book={resume.book} size="thumb" />
              <span className="continue__body">
                <span className="continue__label">继续阅读</span>
                <span className="continue__title">{resume.chapterTitle}</span>
                <span className="continue__sub">
                  {resume.book.title} ·{' '}
                  {resume.ratio < 0.02
                    ? '刚刚打开'
                    : `读至 ${Math.round(resume.ratio * 100)}%`}
                </span>
              </span>
              <span className="continue__go">
                <Icon name="arrow-right" size={18} />
              </span>
            </button>
          )}

          <div className="section-head">
            <h2>全部书籍</h2>
            <span>{library.books.length} 本</span>
          </div>
          <div className="book-grid">
            {library.books.map((book) => (
              <BookCard key={book.slug} book={book} />
            ))}
          </div>

          <footer className="home-foot">
            <p>内容由 book-to-skills 生成 · 本地离线阅读</p>
            <p>点开一本书，可看章节摘要、速查表、术语与模式库</p>
          </footer>
        </>
      )}
    </div>
  )
}
