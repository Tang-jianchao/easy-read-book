import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { OriginalFile } from '../../types'
import { getOriginalProgress, saveOriginalProgress } from '../../lib/storage'
import { Spinner } from '../Bits'
import { Icon } from '../Icon'
import { attachReaderGestures } from './gestures'

type OutlineItem = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number]

export function PdfViewer({
  bookId,
  file,
  title,
}: {
  bookId: string
  file: OriginalFile
  title: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [total, setTotal] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(0)
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [tocOpen, setTocOpen] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.width || 0)
      setWidth((prev) => (Math.abs(prev - next) > 1 ? next : prev))
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    let task: ReturnType<typeof import('pdfjs-dist')['getDocument']> | null = null

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        task = pdfjs.getDocument({
          url: file.url,
          disableAutoFetch: true,
          disableStream: false,
        })
        const nextDoc = await task.promise
        if (cancelled) {
          await task.destroy()
          return
        }
        setDoc(nextDoc)
        setTotal(nextDoc.numPages)
        setOutline((await nextDoc.getOutline().catch(() => [])) || [])

        const saved = getOriginalProgress(bookId, file.id)
        const savedPage = saved ? Number.parseInt(saved.locator, 10) : 1
        const start = Number.isFinite(savedPage)
          ? Math.min(nextDoc.numPages, Math.max(1, savedPage))
          : 1
        setPageNumber(start)
        setPageInput(String(start))
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'PDF 加载失败')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [bookId, file.id, file.url])

  useEffect(() => {
    if (!doc || width <= 0) return
    let cancelled = false
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null = null
    setRendering(true)

    ;(async () => {
      try {
        const page = await doc.getPage(pageNumber)
        if (cancelled) return
        const unscaled = page.getViewport({ scale: 1 })
        const fit = Math.max(0.15, (width - 28) / unscaled.width)
        const viewport = page.getViewport({ scale: fit * zoom })
        const canvas = canvasRef.current
        if (!canvas) return
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.max(1, Math.round(viewport.width * dpr))
        canvas.height = Math.max(1, Math.round(viewport.height * dpr))
        canvas.style.width = `${Math.round(viewport.width)}px`
        canvas.style.height = `${Math.round(viewport.height)}px`
        const context = canvas.getContext('2d')
        if (!context) throw new Error('无法创建画布')
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: dpr > 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        })
        await renderTask.promise
        if (!cancelled) {
          setRendering(false)
          saveOriginalProgress(
            bookId,
            file.id,
            String(pageNumber),
            total > 0 ? (pageNumber - 1) / total : 0,
          )
        }
      } catch (err) {
        if (!cancelled && !(err instanceof Error && err.name === 'RenderingCancelledException')) {
          setRendering(false)
          setError(err instanceof Error ? err.message : '页面渲染失败')
        }
      }
    })()

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [bookId, doc, file.id, pageNumber, total, width, zoom])

  useEffect(() => {
    setPageInput(String(pageNumber))
    hostRef.current?.scrollTo({ top: 0 })
  }, [pageNumber])

  const goToPage = (value: number) => {
    if (!Number.isFinite(value)) return
    setPageNumber(Math.min(Math.max(1, Math.round(value)), total || 1))
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    return attachReaderGestures(host, {
      onPrev: () => setPageNumber((page) => Math.max(1, page - 1)),
      onNext: () => setPageNumber((page) => Math.min(total || 1, page + 1)),
      canNavigate: () => !loading && total > 1 && zoom <= 1,
      getTapRatio: (event) => {
        const rect = host.getBoundingClientRect()
        return rect.width > 0 ? (event.clientX - rect.left) / rect.width : null
      },
    })
  }, [loading, total, zoom])

  const jumpOutline = async (item: OutlineItem) => {
    if (!doc || !item.dest) return
    try {
      const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest
      if (!dest) return
      const ref = dest[0]
      const pageIndex =
        typeof ref === 'number' ? ref : await doc.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0])
      goToPage(pageIndex + 1)
      setTocOpen(false)
    } catch {
      // 个别 PDF 的目录目标无法解析，忽略这一项
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === 'ArrowLeft') setPageNumber((page) => Math.max(1, page - 1))
      if (event.key === 'ArrowRight') setPageNumber((page) => Math.min(total || page, page + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total])

  return (
    <div className="pdf-viewer">
      <div className="viewer-toolbar">
        <button
          type="button"
          className="icon-btn"
          aria-label="上一页"
          disabled={pageNumber <= 1 || loading}
          onClick={() => goToPage(pageNumber - 1)}
        >
          <Icon name="chevron-left" size={18} />
        </button>
        <div className="viewer-page-box">
          <input
            value={pageInput}
            inputMode="numeric"
            aria-label="页码"
            onChange={(event) => setPageInput(event.target.value.replace(/[^\d]/g, ''))}
            onBlur={() => goToPage(Number.parseInt(pageInput, 10) || pageNumber)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                goToPage(Number.parseInt(pageInput, 10) || pageNumber)
                event.currentTarget.blur()
              }
            }}
          />
          <span>/ {total || '—'}</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="下一页"
          disabled={loading || (total > 0 && pageNumber >= total)}
          onClick={() => goToPage(pageNumber + 1)}
        >
          <Icon name="chevron-right" size={18} />
        </button>

        <span className="viewer-toolbar__spacer" />

        <button
          type="button"
          className="icon-btn viewer-zoom"
          aria-label="缩小"
          disabled={zoom <= 0.7}
          onClick={() => setZoom((value) => Math.max(0.7, Math.round((value - 0.15) * 100) / 100))}
        >
          −
        </button>
        <button
          type="button"
          className="viewer-fit"
          onClick={() => setZoom(1)}
          title="适应宽度"
        >
          适应
        </button>
        <button
          type="button"
          className="icon-btn viewer-zoom"
          aria-label="放大"
          disabled={zoom >= 2.5}
          onClick={() => setZoom((value) => Math.min(2.5, Math.round((value + 0.15) * 100) / 100))}
        >
          +
        </button>
        {outline.length > 0 && (
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

      {tocOpen && outline.length > 0 && (
        <div className="viewer-toc" role="dialog" aria-label="PDF 目录">
          <div className="viewer-toc__head">
            <strong>目录</strong>
            <button type="button" className="icon-btn" aria-label="关闭目录" onClick={() => setTocOpen(false)}>
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="viewer-toc__list">
            {outline.map((item, index) => (
              <button
                key={`${item.title}-${index}`}
                type="button"
                className="viewer-toc__item"
                onClick={() => jumpOutline(item)}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`pdf-stage${zoom > 1 ? ' is-zoomed' : ''}`} ref={hostRef}>
        {loading && (
          <div className="viewer-loading">
            <Spinner />
            <span>正在打开 PDF…</span>
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
        <canvas
          ref={canvasRef}
          className="pdf-canvas"
          aria-label={title}
          style={{
            visibility: loading || error ? 'hidden' : 'visible',
            opacity: loading || error ? 0 : rendering ? 0.55 : 1,
          }}
        />
        {rendering && !loading && <div className="viewer-rendering">正在渲染…</div>}
      </div>
    </div>
  )
}
