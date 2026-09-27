import { useEffect } from 'react'
import type { RefObject } from 'react'

/** While active, calls onDismiss for any click outside the given elements, or on Escape (with the event, so callers can tell which). */
export function useDismiss(active: boolean, refs: RefObject<HTMLElement | null>[], onDismiss: (event: MouseEvent | KeyboardEvent) => void) {
  useEffect(() => {
    if (!active) return
    const onClick = (event: MouseEvent) => {
      if (!refs.some((ref) => ref.current?.contains(event.target as Node))) onDismiss(event)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss(event)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [active, refs, onDismiss])
}
