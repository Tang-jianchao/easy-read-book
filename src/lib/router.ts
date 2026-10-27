import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'book'; slug: string; tab: string }
  | { name: 'reader'; slug: string; chapterId: string; resume: boolean }
  | { name: 'originals' }
  | { name: 'original'; bookId: string; fileId: string }

export function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [pathPart, queryString] = raw.split('?')
  const params = new URLSearchParams(queryString || '')
  const segments = pathPart.split('/').filter(Boolean).map(decodeURIComponent)

  if (segments[0] === 'book' && segments[1]) {
    if (segments[2] === 'ch' && segments[3]) {
      return {
        name: 'reader',
        slug: segments[1],
        chapterId: segments[3],
        resume: params.get('resume') === '1',
      }
    }
    return { name: 'book', slug: segments[1], tab: params.get('tab') || 'overview' }
  }

  if (segments[0] === 'originals') {
    if (segments[1] && segments[2]) {
      return { name: 'original', bookId: segments[1], fileId: segments[2] }
    }
    return { name: 'originals' }
  }

  return { name: 'home' }
}

export function navigate(path: string, replace = false) {
  const hash = `#${path.startsWith('/') ? path : `/${path}`}`
  if (replace) {
    window.history.replaceState(null, '', hash)
    window.dispatchEvent(new Event('hashchange'))
  } else if (window.location.hash === hash) {
    window.dispatchEvent(new Event('hashchange'))
  } else {
    window.location.hash = hash
  }
}

export function routeKey(route: Route): string {
  switch (route.name) {
    case 'book':
      return `book:${route.slug}`
    case 'reader':
      return `reader:${route.slug}:${route.chapterId}:${route.resume ? 'r' : 'n'}`
    case 'originals':
      return 'originals'
    case 'original':
      return `original:${route.bookId}:${route.fileId}`
    default:
      return 'home'
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash())

  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}
