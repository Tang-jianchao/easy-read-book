import { useEffect, useState } from 'react'

const HINT_KEY = 'easybook:swipe-hint-v2'

/** 触屏设备首次打开原文时提示一次左右滑动 */
export function SwipeHint() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!window.matchMedia?.('(pointer: coarse)').matches) return
      if (window.localStorage.getItem(HINT_KEY)) return
      window.localStorage.setItem(HINT_KEY, '1')
      setVisible(true)
      const timer = window.setTimeout(() => setVisible(false), 2800)
      return () => window.clearTimeout(timer)
    } catch {
      return
    }
  }, [])

  if (!visible) return null

  return (
    <div className="swipe-hint" role="status">
      ← 左右滑动或点击两侧翻页 →
    </div>
  )
}
