import type { ReactNode } from 'react'

export function Spinner({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

/** The whole page while its data loads, or when it can't: what is happening and, for a failure, what to do. */
export function PageMessage({ loading, title, children }: { loading?: boolean; title: string; children?: ReactNode }) {
  return (
    <div role={loading ? 'status' : 'alert'} className="flex h-screen flex-col items-center justify-center gap-2 bg-surface p-6 text-center">
      {loading ? <Spinner className="h-4 w-4 text-fg-muted" /> : null}
      <div className="text-sm font-medium text-fg">{title}</div>
      {children ? <div className="max-w-sm text-sm text-fg-muted">{children}</div> : null}
    </div>
  )
}
