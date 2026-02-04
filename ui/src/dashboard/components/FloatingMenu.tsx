import type { CSSProperties, ReactNode, RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type FloatingMenuProps = {
  anchorRef: RefObject<HTMLElement>
  open: boolean
  onClose?: () => void
  children: ReactNode
}

export default function FloatingMenu({ anchorRef, open, onClose, children }: FloatingMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<CSSProperties | null>(null)

  useEffect(() => {
    if (!open || !anchorRef?.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      zIndex: 100,
    })
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return
      if (menuRef.current.contains(event.target as Node)) return
      if (anchorRef?.current?.contains(event.target as Node)) return
      onClose?.()
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [open, anchorRef, onClose])

  if (!open) return null

  return createPortal(
    <div ref={menuRef} className="compare-dropdown" style={style}>
      {children}
    </div>,
    document.body,
  )
}
