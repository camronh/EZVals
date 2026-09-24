import { useCallback, useState } from 'react'

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

export function Toasts({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null
  return (
    <div id="toast-container" className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${t.tone === 'error' ? 'bg-red-600/90' : 'bg-emerald-600/90'}`}
          style={{ animation: 'toast-in 0.2s ease-out' }}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
