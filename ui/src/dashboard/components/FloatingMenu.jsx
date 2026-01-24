import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'

/**
 * @param {{
 *   anchorRef: { current: HTMLElement | null },
 *   open: boolean,
 *   onClose?: () => void,
 *   children: import('react').ReactNode,
 * }} props
 */
export default function FloatingMenu({ anchorRef, open, onClose, children }) {
  const menuRef = useRef(null)
  const [style, setStyle] = useState(null)

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
    const handleClick = (event) => {
      if (!menuRef.current) return
      if (menuRef.current.contains(event.target)) return
      if (anchorRef?.current?.contains(event.target)) return
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
