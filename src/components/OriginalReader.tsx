import { useEffect } from 'react'
import type { OriginalBook, OriginalFile } from '../types'
import { formatBytes } from '../lib/originals'
import { navigate } from '../lib/router'
import { TopBar } from './Bits'
import { Icon } from './Icon'
import { EpubViewer } from './viewer/EpubViewer'
import { PdfViewer } from './viewer/PdfViewer'
import { SwipeHint } from './viewer/SwipeHint'

export function OriginalReader({ book, file }: { book: OriginalBook; file: OriginalFile }) {
  useEffect(() => {
    document.title = `${book.title} · 原文`
    document.body.classList.add('viewer-open')
    return () => {
      document.body.classList.remove('viewer-open')
    }
  }, [book.title])

  const back = book.shelfSlug
    ? `/book/${encodeURIComponent(book.shelfSlug)}?tab=original`
    : '/originals'

  return (
    <div className="shell viewer-page">
      <TopBar title={book.title} onBack={() => navigate(back)} />
      <div className="viewer-meta">
        <span className="viewer-meta__title">{book.title}</span>
        {book.author && <span>{book.author}</span>}
        <span>
          {file.label} · {formatBytes(file.size)}
        </span>
        <span className="viewer-local-badge">本地原文</span>
      </div>
      <div className="viewer-stage">
        {file.format === 'pdf' ? (
          <PdfViewer bookId={book.id} file={file} title={book.title} />
        ) : file.format === 'epub' ? (
          <EpubViewer bookId={book.id} file={file} title={book.title} />
        ) : (
          <div className="viewer-unsupported">
            <p className="eyebrow">暂无在线预览</p>
            <h1>{file.label} 格式</h1>
            <p>当前阅读器支持 PDF 与 EPUB。可以下载原文件后用本地阅读器打开。</p>
            <a className="btn btn--primary" href={file.url} download={file.downloadName}>
              <Icon name="book" size={17} />
              下载 {file.label}
            </a>
            <button type="button" className="btn btn--ghost" onClick={() => navigate(back)}>
              返回
            </button>
          </div>
        )}
      </div>
      {(file.format === 'pdf' || file.format === 'epub') && <SwipeHint />}
    </div>
  )
}
