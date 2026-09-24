import { useEffect } from 'react'
import type { RefObject } from 'react'

/** While active, calls onDismiss for any click outside the given elements. */
export function useDismiss(active: boolean, refs: RefObject<HTMLElement | null>[], onDismiss: () => void) {
  useEffect(() => {
    if (!active) return
    const onClick = (event: MouseEvent) => {
      if (!refs.some((ref) => ref.current?.contains(event.target as Node))) onDismiss()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [active, refs, onDismiss])
}
