import { useEffect, useRef, useState } from 'react'
import type { Book as EpubBook, Contents, NavItem, Rendition } from 'epubjs'
import type { OriginalFile } from '../../types'
import {
  FONT_LABELS,
  getFontLevel,
  getOriginalProgress,
  saveOriginalProgress,
  setFontLevel,
  useThemeMode,
  type FontLevel,
} from '../../lib/storage'
import { Spinner } from '../Bits'
import { Icon } from '../Icon'

const FONT_SIZES: Record<FontLevel, string> = {
  0: '96%',
  1: '106%',
  2: '118%',
}

type ReaderLocation = {
  cfi?: string
  index?: number
  percentage?: number
  start?: { cfi: string; index: number; percentage?: number }
}

export function EpubViewer({
  bookId,
  file,
  title,
}: {
  bookId: string
  file: OriginalFile
  title: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const locationsReady = useRef(false)
  const lastLocator = useRef<string | null>(null)
  const percentRef = useRef(0)
  const dark = useThemeMode() === 'dark'
  const darkRef = useRef(dark)
  darkRef.current = dark

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toc, setToc] = useState<NavItem[]>([])
  const [tocOpen, setTocOpen] = useState(false)
  const [percent, setPercent] = useState(0)
  const [font, setFont] = useState<FontLevel>(() => getFontLevel())
  const fontRef = useRef<FontLevel>(font)
  fontRef.current = font

  useEffect(() => {
    let cancelled = false
    let rendition: Rendition | null = null
    let book: EpubBook | null = null

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const ePub = (await import('epubjs')).default
        if (!hostRef.current) return
        hostRef.current.innerHTML = ''
        // URL 没有 .epub 后缀，显式按压缩包打开，避免 epub.js 去请求 META-INF/container.xml
        book = ePub(file.url, { openAs: 'epub' })
        rendition = book.renderTo(hostRef.current, {
          width: '100%',
          height: '100%',
          flow: 'paginated',
          spread: 'none',
          allowScriptedContent: false,
          resizeOnOrientationChange: true,
        })
        renditionRef.current = rendition
        applyTheme(rendition, darkRef.current)
        rendition.themes.fontSize(FONT_SIZES[fontRef.current])

        const handleLocation = (location: ReaderLocation) => {
          const locator = 'start' in location ? location.start?.cfi : location.cfi
          if (!locator) return
          lastLocator.current = locator
          const startIndex =
            ('start' in location ? location.start?.index : location.index) ?? 0
          const rawPercent =
            'start' in location ? location.start?.percentage : location.percentage
          let pct = 0
          if (locationsReady.current && book) {
            pct = book.locations.percentageFromCfi(locator) || 0
          } else if (typeof rawPercent === 'number' && rawPercent > 0) {
            pct = rawPercent
          } else {
            const spine = book?.spine as unknown as { spineItems?: unknown[] } | undefined
            const totalSections = spine?.spineItems?.length || 0
            pct = totalSections ? Math.min(0.99, startIndex / totalSections) : 0
          }
          percentRef.current = pct
          setPercent(pct)
          saveOriginalProgress(bookId, file.id, locator, pct)
        }

        rendition.on('relocated', handleLocation)

        const boundDocs = new WeakSet<Document>()
        const attachSwipe = (contents: Contents) => {
          const doc = contents.document
          if (!doc || boundDocs.has(doc)) return
          boundDocs.add(doc)
          doc.documentElement.style.touchAction = 'pan-y'

          let start: { x: number; y: number; t: number } | null = null
          const turn = (direction: 'next' | 'prev') => {
            const active = rendition
            if (!active) return
            const action = direction === 'next' ? active.next() : active.prev()
            action.catch(() => undefined)
          }

          const onStart = (event: TouchEvent) => {
            const target = event.target as Element | null
            if (target?.closest?.('a, button, input, textarea, select')) {
              start = null
              return
            }
            if (event.touches.length !== 1) {
              start = null
              return
            }
            const touch = event.touches[0]
            start = { x: touch.clientX, y: touch.clientY, t: Date.now() }
          }

          const onEnd = (event: TouchEvent) => {
            const current = start
            start = null
            if (!current) return
            if (doc.getSelection?.()?.toString().trim()) return

            const touch = event.changedTouches[0]
            if (!touch) return
            const dx = touch.clientX - current.x
            const dy = touch.clientY - current.y
            if (Date.now() - current.t > 900) return
            if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.25) return
            turn(dx < 0 ? 'next' : 'prev')
          }

          doc.addEventListener('touchstart', onStart, { passive: true })
          doc.addEventListener('touchend', onEnd, { passive: true })
        }
        rendition.hooks.content.register(attachSwipe)

        const saved = getOriginalProgress(bookId, file.id)
        percentRef.current = saved?.percent || 0
        setPercent(saved?.percent || 0)
        try {
          await rendition.display(saved?.locator || undefined)
        } catch {
          await rendition.display()
        }
        if (cancelled) return
        const current = await Promise.resolve(rendition.currentLocation()).catch(() => null)
        if (current?.cfi) handleLocation(current)
        else if (saved?.locator) lastLocator.current = saved.locator
        setLoading(false)

        book.loaded.navigation
          .then((nav) => {
            if (!cancelled) setToc(nav.toc || [])
          })
          .catch(() => undefined)

        // 超大的图像型 EPUB 生成 locations 很耗时，按体积跳过
        if (file.size < 30 * 1024 * 1024) {
          book.ready
            .then(() => book?.locations.generate(1200))
            .then(() => {
              locationsReady.current = true
              const locator = lastLocator.current
              if (locator && book) {
                const pct = book.locations.percentageFromCfi(locator) || 0
                percentRef.current = pct
                setPercent(pct)
              }
            })
            .catch(() => undefined)
        }

      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'EPUB 加载失败')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      if (lastLocator.current) {
        saveOriginalProgress(bookId, file.id, lastLocator.current, percentRef.current)
      }
      renditionRef.current = null
      rendition?.destroy()
      book?.destroy()
      if (hostRef.current) hostRef.current.innerHTML = ''
    }
  }, [bookId, file.id, file.url, file.size])

  useEffect(() => {
    try {
      if (renditionRef.current) applyTheme(renditionRef.current, dark)
    } catch {
      // rendition 可能在切换书籍的瞬间已销毁
    }
  }, [dark])

  useEffect(() => {
    try {
      renditionRef.current?.themes.fontSize(FONT_SIZES[font])
    } catch {
      // 同上
    }
  }, [font])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      try {
        renditionRef.current?.resize(rect.width, rect.height)
      } catch {
        // rendition 销毁后的最后一次 resize，忽略
      }
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === 'ArrowLeft') renditionRef.current?.prev()
      if (event.key === 'ArrowRight') renditionRef.current?.next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const cycleFont = () => {
    const next = ((font + 1) % 3) as FontLevel
    setFont(next)
    setFontLevel(next)
  }

  const openTocItem = (item: NavItem) => {
    setTocOpen(false)
    renditionRef.current?.display(item.href).catch(() => undefined)
  }

  return (
    <div className="epub-viewer">
      <div className="viewer-toolbar">
        <button
          type="button"
          className="icon-btn"
          aria-label="上一页"
          onClick={() => renditionRef.current?.prev()}
        >
          <Icon name="chevron-left" size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="下一页"
          onClick={() => renditionRef.current?.next()}
        >
          <Icon name="chevron-right" size={18} />
        </button>
        <span className="viewer-progress">
          {Math.round(percent * 100)}%
        </span>
        <span className="viewer-toolbar__spacer" />
        <button
          type="button"
          className="icon-btn font-btn"
          aria-label={`调整字号，当前${FONT_LABELS[font]}`}
          title="调整字号"
          onClick={cycleFont}
        >
          Aa
        </button>
        {toc.length > 0 && (
          <button
            type="button"
            className="icon-btn"
            aria-label="目录"
            aria-pressed={tocOpen}
            onClick={() => setTocOpen((open) => !open)}
          >
            <Icon name="list" size={18} />
          </button>
        )}
        <a className="viewer-download" href={file.url} download={file.downloadName}>
          下载
        </a>
      </div>

      {tocOpen && toc.length > 0 && (
        <div className="viewer-toc" role="dialog" aria-label="EPUB 目录">
          <div className="viewer-toc__head">
            <strong>目录</strong>
            <button type="button" className="icon-btn" aria-label="关闭目录" onClick={() => setTocOpen(false)}>
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="viewer-toc__list">
            {toc.map((item, index) => (
              <button
                key={`${item.href}-${index}`}
                type="button"
                className="viewer-toc__item"
                onClick={() => openTocItem(item)}
              >
                {item.label || item.href}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="epub-stage">
        {loading && (
          <div className="viewer-loading">
            <Spinner />
            <span>正在打开 EPUB…</span>
          </div>
        )}
        {error && (
          <div className="notice viewer-error">
            <p>{error}</p>
            <a className="btn btn--ghost" href={file.url} download={file.downloadName}>
              下载原文件
            </a>
          </div>
        )}
        <div
          ref={hostRef}
          className="epub-host"
          aria-label={title}
          style={{ visibility: loading || error ? 'hidden' : 'visible' }}
        />
      </div>
    </div>
  )
}

function applyTheme(rendition: Rendition, dark: boolean) {
  rendition.themes.override('color', dark ? '#e8e2d6' : '#221e18')
  rendition.themes.override('background', dark ? '#14120f' : '#fffdf8')
}
