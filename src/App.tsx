import { useEffect, useState } from 'react'
import type { Library } from './types'
import { loadLibrary } from './lib/data'
import { navigate, routeKey, useRoute } from './lib/router'
import { BookPage } from './components/BookPage'
import { Home } from './components/Home'
import { Reader } from './components/Reader'
import { Spinner } from './components/Bits'

export default function App() {
  const route = useRoute()
  const [library, setLibrary] = useState<Library | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(null)
    loadLibrary()
      .then((data) => {
        if (!cancelled) setLibrary(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [retry])

  const currentKey = routeKey(route)

  useEffect(() => {
    if (route.name === 'home') document.title = '我的书架'
    if (route.name !== 'reader') window.scrollTo(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey])

  if (!library) {
    return (
      <div className="splash">
        {error ? (
          <div className="notice notice--center">
            <h1>书架还没同步</h1>
            <p>{error}</p>
            <p className="splash-hint">
              请先运行 <code>npm run sync</code>，然后刷新页面。
            </p>
            <button type="button" className="btn btn--ghost" onClick={() => setRetry((n) => n + 1)}>
              重新加载
            </button>
          </div>
        ) : (
          <>
            <Spinner />
            <span>正在整理书架…</span>
          </>
        )}
      </div>
    )
  }

  if (route.name === 'book' || route.name === 'reader') {
    const book = library.books.find((item) => item.slug === route.slug)
    if (!book) {
      return <NotFound message="没有找到这本书。" onBack={() => navigate('/')} />
    }

    if (route.name === 'book') {
      return <BookPage book={book} initialTab={route.tab} />
    }

    const chapter = book.chapters.find((item) => item.id === route.chapterId)
    if (!chapter) {
      return (
        <NotFound
          message="没有找到这一章，可能章节已更新。"
          onBack={() => navigate(`/book/${encodeURIComponent(book.slug)}?tab=chapters`)}
        />
      )
    }

    return (
      <Reader
        key={`${book.slug}:${chapter.id}`}
        book={book}
        chapter={chapter}
        resume={route.resume}
      />
    )
  }

  return <Home library={library} />
}

function NotFound({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="shell page">
      <div className="empty-state">
        <p className="eyebrow">404</p>
        <h1>{message}</h1>
        <button type="button" className="btn btn--primary" onClick={onBack}>
          回到书架
        </button>
      </div>
    </div>
  )
}
