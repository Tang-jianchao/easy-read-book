type GestureOptions = {
  onPrev: () => void
  onNext: () => void
  /** 点击左右边缘时返回 0–1 的横向比例；返回 null 表示本次点击不处理 */
  getTapRatio?: (event: MouseEvent) => number | null
  /** 为 false 时暂停滑动和点击翻页（例如 PDF 放大后需要横向拖动） */
  canNavigate?: () => boolean
  /** 这些元素上的触摸/点击不参与翻页 */
  ignoreSelector?: string
  isTextSelected?: () => boolean
}

const TAP_EDGE = 0.2
const SWIPE_MIN = 48

/**
 * 在 HTMLElement 或 iframe 的 document 上绑定稳定的触摸手势。
 * 使用原生非 passive 的 touchmove，避免 iOS Safari 把横滑识别成页面滚动而取消手势。
 */
export function attachReaderGestures(
  target: HTMLElement | Document,
  options: GestureOptions,
): () => void {
  let start: { x: number; y: number; t: number } | null = null
  let horizontal = false
  let vertical = false
  let lastSwipeAt = 0

  const canNavigate = () => (options.canNavigate ? options.canNavigate() : true)

  const isIgnored = (event: Event) => {
    if (!options.ignoreSelector) return false
    const node = event.target as Element | null
    return Boolean(node?.closest?.(options.ignoreSelector))
  }

  const onStart = (event: Event) => {
    const touchEvent = event as TouchEvent
    horizontal = false
    vertical = false
    if (!canNavigate() || touchEvent.touches.length !== 1 || isIgnored(event)) {
      start = null
      return
    }
    const touch = touchEvent.touches[0]
    start = { x: touch.clientX, y: touch.clientY, t: Date.now() }
  }

  const onMove = (event: Event) => {
    if (!start) return
    const touchEvent = event as TouchEvent
    if (touchEvent.touches.length !== 1) return
    const touch = touchEvent.touches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y

    if (!horizontal && !vertical) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) horizontal = true
      else if (Math.abs(dy) > 12) vertical = true
    }

    // 横向手势锁定后阻止页面回弹/前进后退，iOS Safari 才能稳定收到 touchend
    if (horizontal && event.cancelable) event.preventDefault()
  }

  const finish = (event: Event) => {
    const current = start
    start = null
    if (!current || vertical) {
      horizontal = false
      return
    }

    const touch = (event as TouchEvent).changedTouches[0]
    if (!touch) return
    const dx = touch.clientX - current.x
    const dy = touch.clientY - current.y

    // 快速轻扫可能没有 touchmove，这里再判断一次
    if (!horizontal) {
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.25) {
        horizontal = false
        return
      }
      horizontal = true
    }

    if (Date.now() - current.t > 900) return
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.25) return

    lastSwipeAt = Date.now()
    horizontal = false
    if (dx < 0) options.onNext()
    else options.onPrev()
  }

  const cancel = () => {
    start = null
    horizontal = false
    vertical = false
  }

  const onClick = (event: Event) => {
    if (!options.getTapRatio || !canNavigate()) return
    if (Date.now() - lastSwipeAt < 350) return
    if (isIgnored(event)) return
    if (options.isTextSelected?.()) return

    const ratio = options.getTapRatio(event as MouseEvent)
    if (ratio == null) return
    if (ratio < TAP_EDGE) options.onPrev()
    else if (ratio > 1 - TAP_EDGE) options.onNext()
  }

  // capture 阶段监听，避免 epub.js 内部处理器先 stopPropagation
  target.addEventListener('touchstart', onStart, { passive: true, capture: true })
  target.addEventListener('touchmove', onMove, { passive: false, capture: true })
  target.addEventListener('touchend', finish, { passive: true, capture: true })
  target.addEventListener('touchcancel', cancel, { passive: true, capture: true })
  target.addEventListener('click', onClick, { capture: true })

  return () => {
    target.removeEventListener('touchstart', onStart, { capture: true })
    target.removeEventListener('touchmove', onMove, { capture: true })
    target.removeEventListener('touchend', finish, { capture: true })
    target.removeEventListener('touchcancel', cancel, { capture: true })
    target.removeEventListener('click', onClick, { capture: true })
  }
}
