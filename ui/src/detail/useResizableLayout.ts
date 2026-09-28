import { useCallback, useEffect, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useSessionState } from '../hooks/storage'

const HEADER_HEIGHT = 80

export type Layout = {
  inputWidth: number // % of the main panel
  refHeight: number // px
  sidebarWidth: number // px
  comparisonInputWidth: number // %
  comparisonContextHeight: number // px
}

type Handle = keyof Layout

// How each handle turns a drag into a size: [cursor, compute(start, dx, dy, container)].
const HANDLES: Record<Handle, [string, (start: number, dx: number, dy: number, el: HTMLElement, layout: Layout) => number]> = {
  inputWidth: ['col-resize', (s, dx, _, el, l) => Math.max(20, Math.min(80, s + (dx / Math.max(1, el.offsetWidth - l.sidebarWidth)) * 100))],
  comparisonInputWidth: ['col-resize', (s, dx, _, el) => Math.max(20, Math.min(80, s + (dx / Math.max(1, el.offsetWidth)) * 100))],
  refHeight: ['row-resize', (s, _, dy) => Math.max(60, Math.min(400, s - dy))],
  comparisonContextHeight: ['row-resize', (s, _, dy, el) => Math.max(120, Math.min(Math.max(180, Math.min(700, el.offsetHeight * 0.7)), s - dy))],
  sidebarWidth: ['col-resize', (s, dx) => Math.max(200, Math.min(600, s - dx))],
}

function defaults(): Layout {
  const height = Math.max(200, window.innerHeight - HEADER_HEIGHT)
  const narrow = window.innerWidth < 1100
  return {
    inputWidth: narrow ? 55 : 50,
    comparisonInputWidth: narrow ? 55 : 50,
    refHeight: Math.max(100, Math.min(150, Math.floor(height * 0.3))),
    comparisonContextHeight: Math.max(160, Math.min(360, Math.floor(height * 0.35))),
    sidebarWidth: Math.max(220, Math.min(320, Math.floor(window.innerWidth * 0.28))),
  }
}

/** Pane sizes for the detail page, draggable and remembered for the browser session. */
export function useResizableLayout() {
  const [layout, setLayout] = useSessionState<Layout>('ezvals:detailLayout', defaults)
  const container = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ handle: Handle; x: number; y: number; start: number } | null>(null)

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current
      if (!d || !container.current) return
      const el = container.current
      setLayout((l) => ({ ...l, [d.handle]: HANDLES[d.handle][1](d.start, e.clientX - d.x, e.clientY - d.y, el, l) }))
    }
    const up = () => {
      drag.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    return () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
  }, [setLayout])

  const start = useCallback((handle: Handle) => (e: ReactMouseEvent) => {
    e.preventDefault()
    drag.current = { handle, x: e.clientX, y: e.clientY, start: layout[handle] }
    document.body.style.cursor = HANDLES[handle][0]
    document.body.style.userSelect = 'none'
  }, [layout])

  return { layout, container, start }
}
