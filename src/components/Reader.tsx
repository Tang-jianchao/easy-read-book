import { useEffect, useMemo, useRef, useState } from 'react'
import type { Book, Chapter } from '../types'
import { loadBookFile } from '../lib/data'
import { getSections, stripTitle } from '../lib/markdown'
import { navigate } from '../lib/router'
import {
  FONT_LABELS,
  getBookProgress,
  getFontLevel,
  markVisited,
  saveReadingPosition,
  setFontLevel as applyFontLevel,
  type FontLevel,
} from '../lib/storage'
import { Spinner, TopBar } from './Bits'
import { Markdown } from './Markdown'

export function Reader({
  book,
  chapter,
  resume,
}: {
  book: Book
  chapter: Chapter
  resume: boolean
}) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [scrollPct, setScrollPct] = useState(0)
  const [font, setFont] = useState<FontLevel>(() => getFontLevel())
  const [toast, setToast] = useState<string | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)
  const ratioRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setContent('')
    if (!resume) window.scrollTo(0, 0)

    loadBookFile(book.slug, chapter.file)
      .then((raw) => {
        if (cancelled) return
        setContent(stripTitle(raw))
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [book.slug, chapter.file, chapter.id, resume, reloadKey])

  useEffect(() => {
    if (!content) return
    const frame = requestAnimationFrame(() => {
      if (resume) {
        const progress = getBookProgress(book.slug)
        if (progress?.last?.chapterId === chapter.id && progress.last.ratio > 0.01) {
          const max = document.documentElement.scrollHeight - window.innerHeight
          window.scrollTo({ top: max * progress.last.ratio })
        }
      }
      markVisited(book.slug, chapter.id)
    })
    return () => cancelAnimationFrame(frame)
  }, [content, resume, book.slug, chapter.id])

  useEffect(() => {
    if (!content) return
    let frame = 0
    let lastSave = 0

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const max = document.documentElement.scrollHeight - window.innerHeight
        const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
        ratioRef.current = ratio
        setScrollPct(Math.round(ratio * 100))
        const now = Date.now()
        if (now - lastSave > 700) {
          lastSave = now
          saveReadingPosition(book.slug, chapter.id, ratio)
        }
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
      saveReadingPosition(book.slug, chapter.id, ratioRef.current)
    }
  }, [book.slug, chapter.id, content])

  useEffect(() => {
    document.title = `${chapter.title} · ${book.title}`
  }, [book.title, chapter.title])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 1400)
    return () => window.clearTimeout(timer)
  }, [toast])

  const sections = useMemo(() => getSections(content), [content])
  const index = book.chapters.findIndex((item) => item.id === chapter.id)
  const prev = index > 0 ? book.chapters[index - 1] : null
  const next =
    index >= 0 && index < book.chapters.length - 1 ? book.chapters[index + 1] : null

  const go = (target: Chapter) => {
    navigate(`/book/${encodeURIComponent(book.slug)}/ch/${encodeURIComponent(target.id)}`)
  }

  const cycleFont = () => {
    const nextFont = ((font + 1) % 3) as FontLevel
    setFont(nextFont)
    applyFontLevel(nextFont)
    setToast(`字号：${FONT_LABELS[nextFont]}`)
  }

  const jumpTo = (raw: string) => {
    const headings = articleRef.current?.querySelectorAll('h2')
    if (!headings) return
    for (const heading of Array.from(headings)) {
      if (heading.textContent?.includes(raw)) {
        const top = heading.getBoundingClientRect().top + window.scrollY - 118
        window.scrollTo({ top, behavior: 'smooth' })
        return
      }
    }
  }

  return (
    <div className="shell page reader">
      <div className="reader-progress" aria-hidden="true">
        <span style={{ width: `${scrollPct}%` }} />
      </div>

      <TopBar
        title={chapter.title}
        onBack={() => navigate(`/book/${encodeURIComponent(book.slug)}?tab=chapters`)}
        right={
          <button
            type="button"
            className="icon-btn font-btn"
            onClick={cycleFont}
            aria-label={`调整字号，当前${FONT_LABELS[font]}`}
            title="调整字号"
          >
            Aa
          </button>
        }
      />

      {loading ? (
        <div className="reader-loading">
          <Spinner />
          <span>正在载入章节…</span>
        </div>
      ) : error ? (
        <div className="notice">
          <p>{error}</p>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            重试
          </button>
        </div>
      ) : (
        <article className="reader-article" ref={articleRef}>
          <header className="chapter-head">
            <p className="eyebrow">{book.title}</p>
            <h1 className={chapter.title.length > 24 ? 'is-long' : undefined}>
              {chapter.title}
            </h1>
            {chapter.subtitle && <p className="chapter-subtitle">{chapter.subtitle}</p>}
            <div className="chapter-meta">
              <span className="chapter-label">{chapter.label}</span>
              <span>{chapter.minutes} 分钟</span>
              <span>{chapter.chars} 字</span>
            </div>
          </header>

          {sections.length > 1 && (
            <nav className="section-chips" aria-label="章节小节">
              {sections.map((section, i) => (
                <button
                  key={`${section.raw}-${i}`}
                  type="button"
                  className="section-chip"
                  onClick={() => jumpTo(section.raw)}
                >
                  {section.zh}
                </button>
              ))}
            </nav>
          )}

          <Markdown source={content} reader />

          <footer className="chapter-foot">
            <div className="end-mark">· 完 ·</div>
            <div className="nav-cards">
              <button
                type="button"
                className="nav-card"
                disabled={!prev}
                onClick={() => prev && go(prev)}
              >
                <span className="nav-card__label">上一章</span>
                <span className="nav-card__title">{prev?.title ?? '已经是第一章'}</span>
              </button>
              <button
                type="button"
                className="nav-card nav-card--next"
                disabled={!next}
                onClick={() => next && go(next)}
              >
                <span className="nav-card__label">下一章</span>
                <span className="nav-card__title">{next?.title ?? '已经是最后一章'}</span>
              </button>
            </div>
            <button
              type="button"
              className="back-to-book"
              onClick={() =>
                navigate(`/book/${encodeURIComponent(book.slug)}?tab=chapters`)
              }
            >
              返回目录
            </button>
          </footer>
        </article>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
