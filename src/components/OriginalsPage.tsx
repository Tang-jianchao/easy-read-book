import { useEffect, useMemo, useState } from 'react'
import type { Library, OriginalBook, OriginalsManifest } from '../types'
import { formatBytes } from '../lib/originals'
import { navigate } from '../lib/router'
import { TopBar } from './Bits'
import { Icon } from './Icon'

const GROUPS: Array<{ source: OriginalBook['source']; title: string; hint: string }> = [
  { source: 'skill', title: '配套精读', hint: '已有精读笔记，可以对照阅读' },
  { source: 'notes', title: '其他已转换', hint: '来自另一条笔记流程' },
  { source: 'converted', title: '已转换原文', hint: '尚未接入书架' },
  { source: 'archived', title: '归档原文', hint: '尚未生成精读笔记' },
  { source: 'unconverted', title: '待整理原文', hint: '尚未生成精读笔记' },
]

type Filter = 'all' | 'pdf' | 'epub'

export function OriginalsPage({
  originals,
  library,
}: {
  originals: OriginalsManifest
  library: Library
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    document.title = '原文书架 · 我的书架'
  }, [])

  const totals = useMemo(() => {
    const files = originals.books.flatMap((book) => book.files)
    return {
      books: originals.books.length,
      files: files.length,
      size: files.reduce((sum, file) => sum + file.size, 0),
    }
  }, [originals])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return originals.books.filter((book) => {
      if (filter !== 'all' && !book.files.some((file) => file.format === filter)) return false
      if (!needle) return true
      return `${book.title} ${book.author}`.toLowerCase().includes(needle)
    })
  }, [filter, originals.books, query])

  const shelfSlugs = useMemo(() => new Set(library.books.map((book) => book.slug)), [library])

  if (!originals.enabled) {
    return (
      <div className="shell page">
        <TopBar title="原文书架" onBack={() => navigate('/')} />
        <div className="notice notice--center">
          <p className="eyebrow">仅本地可用</p>
          <h1>原文没有随站点发布</h1>
          <p>
            原始电子书只通过本地服务读取。请在电脑上运行 <code>npm start</code>，再用局域网地址打开本页。
          </p>
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/')}>
            回到书架
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="shell page originals-page">
      <TopBar title="原文书架" onBack={() => navigate('/')} />

      <header className="originals-hero">
        <p className="eyebrow">本地原文</p>
        <h1>原文书架</h1>
        <p className="originals-hero__sub">
          {totals.books} 本 · {totals.files} 个文件 · 约 {formatBytes(totals.size)}
        </p>
        <p className="originals-hero__hint">
          只在局域网服务中可读，原文不会上传到公开站点。
        </p>
      </header>

      <div className="search originals-search">
        <span className="search__icon">
          <Icon name="search" size={18} />
        </span>
        <input
          type="search"
          inputMode="search"
          placeholder="搜索原文书名、作者…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="搜索原文"
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

      <div className="originals-filters" role="tablist" aria-label="按格式筛选">
        {(
          [
            ['all', '全部'],
            ['pdf', 'PDF'],
            ['epub', 'EPUB'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="chip"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <h1>没有找到原文</h1>
          <p className="panel-hint">换个关键词，或者清除格式筛选。</p>
        </div>
      ) : (
        GROUPS.map((group) => {
          const books = visible.filter((book) => book.source === group.source)
          if (books.length === 0) return null
          return (
            <section key={group.source} className="originals-group">
              <div className="section-head">
                <h2>{group.title}</h2>
                <span>{books.length} 本 · {group.hint}</span>
              </div>
              <div className="original-list">
                {books.map((book) => (
                  <article className="original-card" key={book.id}>
                    <div className="original-card__head">
                      <div className="original-card__title-wrap">
                        <h3>{book.title}</h3>
                        {book.author && <p>{book.author}</p>}
                      </div>
                      {book.shelfSlug && shelfSlugs.has(book.shelfSlug) && (
                        <button
                          type="button"
                          className="original-card__notes"
                          onClick={() => navigate(`/book/${encodeURIComponent(book.shelfSlug!)}`)}
                        >
                          精读笔记
                          <Icon name="chevron-right" size={13} />
                        </button>
                      )}
                    </div>
                    <div className="original-card__files">
                      {book.files.map((file) =>
                        file.canPreview ? (
                          <button
                            key={file.id}
                            type="button"
                            className="original-file-btn"
                            onClick={() =>
                              navigate(
                                `/originals/${encodeURIComponent(book.id)}/${encodeURIComponent(file.id)}`,
                              )
                            }
                          >
                            <span className="original-file-btn__format">{file.label}</span>
                            <span>{formatBytes(file.size)}</span>
                            <Icon name="arrow-right" size={13} />
                          </button>
                        ) : (
                          <a
                            key={file.id}
                            className="original-file-btn is-download"
                            href={file.url}
                            download={file.downloadName}
                            title="该格式暂不支持在线预览"
                          >
                            <span className="original-file-btn__format">{file.label}</span>
                            <span>{formatBytes(file.size)} · 下载</span>
                            <Icon name="arrow-right" size={13} />
                          </a>
                        ),
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )
        })
      )}

      <p className="originals-foot">
        原文读取自本地 ebook 目录；PDF 使用 PDF.js，EPUB 使用 epub.js。阅读进度保存在当前浏览器。
      </p>
    </div>
  )
}
