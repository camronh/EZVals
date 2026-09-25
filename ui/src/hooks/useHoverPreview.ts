import { useCallback, useEffect, useRef, useState } from 'react'

const SHOW_DELAY = 400
const HIDE_DELAY = 150

/** Shows a preview after hovering something for a moment, and keeps it while the pointer moves onto the preview. */
export function useHoverPreview<T>() {
  const [target, setTarget] = useState<T | null>(null)
  const activeKey = useRef<string | null>(null)
  const shownKey = useRef<string | null>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const keep = useCallback(() => clearTimeout(hideTimer.current), [])
  const clear = useCallback(() => {
    clearTimeout(showTimer.current)
    clearTimeout(hideTimer.current)
    activeKey.current = null
    shownKey.current = null
    setTarget(null)
  }, [])
  const open = useCallback((key: string, next: T) => {
    clear()
    activeKey.current = key
    shownKey.current = key
    setTarget(next)
  }, [clear])
  const enter = useCallback((key: string, make: () => T) => {
    keep()
    if (activeKey.current === key) return
    clearTimeout(showTimer.current)
    activeKey.current = key
    showTimer.current = setTimeout(() => {
      if (activeKey.current !== key) return
      shownKey.current = key
      setTarget(make())
    }, SHOW_DELAY)
  }, [keep])
  const leave = useCallback(() => {
    clearTimeout(showTimer.current)
    hideTimer.current = setTimeout(clear, HIDE_DELAY)
    if (shownKey.current !== activeKey.current) activeKey.current = null // not shown yet: re-entering must schedule it again
  }, [clear])

  useEffect(() => clear, [clear])
  return { target, enter, leave, keep, clear, open }
}
