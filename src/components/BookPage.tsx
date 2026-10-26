import { useEffect, useMemo, useState } from 'react'
import type { Book } from '../types'
import { loadBookFile } from '../lib/data'
import { stripTitle } from '../lib/markdown'
import { navigate } from '../lib/router'
import { cleanCoverSubtitle, splitBookTitle } from '../lib/title'
import { getBookProgress, lastReadForBook } from '../lib/storage'
import { Cover, Spinner, TopBar } from './Bits'
import { Icon } from './Icon'
import { Markdown } from './Markdown'

const BASE_TABS = [
  { key: 'overview', label: '概览' },
  { key: 'chapters', label: '章节' },
]

export function BookPage({ book, initialTab }: { book: Book; initialTab: string }) {
  const tabs = useMemo(
    () => [...BASE_TABS, ...book.aux.map((aux) => ({ key: aux.kind, label: aux.label }))],
    [book],
  )
  const normalizeTab = (value: string) =>
    tabs.some((tab) => tab.key === value) ? value : 'overview'

  const [tab, setTab] = useState(() => normalizeTab(initialTab))
  const [descOpen, setDescOpen] = useState(false)
  const [doc, setDoc] = useState<{ file: string; source: string } | null>(null)
  const [docError, setDocError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setTab(normalizeTab(initialTab))
    setDescOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, book.slug])

  const progress = getBookProgress(book.slug)
  const resume = lastReadForBook(book)
  const visited = progress?.visited ?? {}
  const visitedCount = Object.keys(visited).length

  const activeAux = book.aux.find((aux) => aux.kind === tab)
  const selectTab = (key: string) => {
    setTab(key)
    const hash = `#/book/${encodeURIComponent(book.slug)}${
      key === 'overview' ? '' : `?tab=${key}`
    }`
    window.history.replaceState(null, '', hash)
  }

  useEffect(() => {
    if (!activeAux) return
    let cancelled = false
    setDocError(null)
    loadBookFile(book.slug, activeAux.file)
      .then((source) => {
        if (!cancelled) setDoc({ file: activeAux.file, source })
      })
      .catch((err: Error) => {
        if (!cancelled) setDocError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [book.slug, activeAux, reloadKey])

  useEffect(() => {
    const label = tabs.find((item) => item.key === tab)?.label
    document.title = tab === 'overview' ? `${book.title} · 书架` : `${label} · ${book.title}`
  }, [book.title, tab, tabs])

  const openChapter = (chapterId: string, withResume = false) => {
    navigate(
      `/book/${encodeURIComponent(book.slug)}/ch/${encodeURIComponent(chapterId)}${
        withResume ? '?resume=1' : ''
      }`,
    )
  }

  const primaryChapter = resume?.chapterId ?? book.chapters[0]?.id
  const cheatsheet = book.aux.find((aux) => aux.kind === 'cheatsheet')
  const docReady = activeAux && doc?.file === activeAux.file
  const displayTitle = splitBookTitle(book.title)

  return (
    <div className="shell page">
      <TopBar title={book.title} onBack={() => navigate('/')} />

      <section className="book-hero">
        <Cover book={book} size="large" />
        <div className="book-hero__meta">
          <p className="book-hero__kicker">{book.category} · 精读笔记</p>
          <h1 className="book-title">
            {displayTitle.main}
            {displayTitle.sub && (
              <span className="book-title__sub">{cleanCoverSubtitle(displayTitle.sub)}</span>
            )}
          </h1>
          <p className="book-hero__author">{book.author}</p>
          <p className="book-hero__tagline">{book.tagline}</p>
          {book.description && (
            <>
              <p className={`book-hero__desc${descOpen ? ' is-open' : ''}`}>
                {book.description}
              </p>
              {book.description.length > 78 && (
                <button
                  type="button"
                  className="desc-toggle"
                  onClick={() => setDescOpen((open) => !open)}
                >
                  {descOpen ? '收起' : '展开简介'}
                </button>
              )}
            </>
          )}
          <div className="book-stats">
            <span>{book.chapterCount} 章</span>
            <span>约 {book.minutes} 分钟</span>
            {visitedCount > 0 && <span className="is-accent">已读 {visitedCount} 章</span>}
          </div>
        </div>
      </section>

      <div className="book-actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!primaryChapter}
          onClick={() => primaryChapter && openChapter(primaryChapter, Boolean(resume))}
        >
          {resume ? '继续阅读' : '开始阅读'}
          <Icon name="arrow-right" size={17} />
        </button>
        {cheatsheet && (
          <button type="button" className="btn btn--ghost" onClick={() => selectTab('cheatsheet')}>
            速查表
          </button>
        )}
      </div>

      <nav className="book-tabs" aria-label="书籍内容">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className="tab"
            aria-selected={tab === item.key}
            onClick={() => selectTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="tab-panel">
          {book.intro && (
            <section className="panel">
              <h2 className="panel-title">核心框架</h2>
              <Markdown source={book.intro} />
            </section>
          )}

          {book.topics.length > 0 && (
            <section className="panel">
              <h2 className="panel-title">主题索引</h2>
              <p className="panel-hint">点一个主题，直接跳到相关章节。</p>
              <div className="chips">
                {book.topics.map((topic) => {
                  const target = topic.chapters[0]
                  if (!target) {
                    return (
                      <span key={topic.name} className="chip is-muted">
                        {topic.name}
                      </span>
                    )
                  }
                  return (
                    <button
                      key={topic.name}
                      type="button"
                      className="chip"
                      onClick={() => openChapter(target)}
                    >
                      {topic.name}
                      {topic.chapters.length > 1 && (
                        <span className="chip__count">{topic.chapters.length}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          <p className="read-hint">
            每章按「核心观点 · 框架 · 概念 · 心智模型 · 案例 · 要点」组织，适合几分钟速览。
          </p>
          {book.scope && <p className="scope">{book.scope}</p>}
        </div>
      )}

      {tab === 'chapters' && (
        <div className="tab-panel">
          <div className="section-head">
            <h2>章节</h2>
            <span>
              {book.chapterCount} 章 · 约 {book.minutes} 分钟
            </span>
          </div>
          <ol className="chapter-list">
            {book.chapters.map((chapter) => {
              const last = progress?.last?.chapterId === chapter.id
              const read = Boolean(visited[chapter.id])
              return (
                <li key={chapter.id}>
                  <button
                    type="button"
                    className="chapter-row"
                    onClick={() => openChapter(chapter.id)}
                  >
                    <span className="chapter-num">{chapter.label}</span>
                    <span className="chapter-row__body">
                      <span className="chapter-row__title">{chapter.title}</span>
                      {chapter.subtitle && (
                        <span className="chapter-row__sub">{chapter.subtitle}</span>
                      )}
                    </span>
                    {last ? (
                      <span className="chapter-row__badge is-current">
                        {(progress?.last?.ratio ?? 0) < 0.02
                          ? '上次阅读'
                          : `读至 ${Math.round((progress?.last?.ratio ?? 0) * 100)}%`}
                      </span>
                    ) : read ? (
                      <span className="chapter-row__badge">已读</span>
                    ) : null}
                    <Icon name="chevron-right" size={16} className="chapter-row__chev" />
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {activeAux && (
        <div className="tab-panel doc">
          <header className="doc-head">
            <p className="eyebrow">{book.title}</p>
            <h2>{activeAux.title}</h2>
            <p className="doc-meta">
              约 {activeAux.minutes} 分钟 · {activeAux.chars} 字
            </p>
          </header>

          {docError ? (
            <div className="notice">
              <p>{docError}</p>
              <button type="button" className="btn btn--ghost" onClick={() => setReloadKey((n) => n + 1)}>
                重试
              </button>
            </div>
          ) : docReady ? (
            <section className="panel panel--doc">
              <Markdown source={stripTitle(doc.source)} />
            </section>
          ) : (
            <div className="doc-loading">
              <Spinner />
              <span>正在载入…</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
