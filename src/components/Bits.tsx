import type { CSSProperties, ReactNode } from 'react'
import type { Book } from '../types'
import { toggleTheme, useThemeMode } from '../lib/storage'
import { cleanCoverSubtitle, splitBookTitle } from '../lib/title'
import { Icon } from './Icon'

export function Cover({
  book,
  size = 'grid',
}: {
  book: Book
  size?: 'grid' | 'thumb' | 'large'
}) {
  const style = {
    '--cover-from': book.theme.from,
    '--cover-to': book.theme.to,
    '--cover-accent': book.theme.accent,
  } as CSSProperties
  const { main, sub } = splitBookTitle(book.title)

  return (
    <span className={`cover cover--${size}`} style={style} aria-hidden="true">
      <span className="cover__glyph">{book.theme.glyph}</span>
      <span className="cover__cat">{book.category}</span>
      <span className="cover__title">
        <span className="cover__title-main">{main}</span>
        {sub && <span className="cover__title-sub">{cleanCoverSubtitle(sub)}</span>}
      </span>
      <span className="cover__foot">
        <span className="cover__author">{book.author}</span>
        <span>{book.chapterCount} 章</span>
      </span>
    </span>
  )
}

export function ThemeButton({ className = '' }: { className?: string }) {
  const mode = useThemeMode()
  return (
    <button
      type="button"
      className={`icon-btn ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={mode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      title={mode === 'dark' ? '浅色模式' : '深色模式'}
    >
      <Icon name={mode === 'dark' ? 'sun' : 'moon'} />
    </button>
  )
}

export function TopBar({
  title,
  onBack,
  right,
}: {
  title: string
  onBack: () => void
  right?: ReactNode
}) {
  return (
    <header className="topbar">
      <button type="button" className="icon-btn" onClick={onBack} aria-label="返回">
        <Icon name="back" />
      </button>
      <div className="topbar__title">{title}</div>
      {right}
      <ThemeButton />
    </header>
  )
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}
