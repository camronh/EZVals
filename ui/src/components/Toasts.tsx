import { useCallback, useState } from 'react'
import { Icon } from './Icon'

export type Toast = { id: number; message: string; tone: 'error' | 'success' }

let nextId = 0

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const notify = useCallback((message: string, tone: Toast['tone'] = 'error') => {
    const id = ++nextId
    setToasts((prev) => [...prev, { id, message, tone }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])
  return { toasts, notify }
}

/** Brief notices in the bottom-right corner; errors are announced assertively, successes politely. */
export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div id="toast-container" className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className="popover flex max-w-sm items-start gap-2.5 px-3.5 py-2.5 text-sm"
          style={{ animation: 'enter-up 0.2s ease-out' }}
        >
          <span className={`mt-[3px] shrink-0 ${t.tone === 'error' ? 'text-danger' : 'text-success'}`}><Icon name={t.tone === 'error' ? 'alert' : 'check'} /></span>
          {t.message}
        </div>
      ))}
    </div>
  )
}
