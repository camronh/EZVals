import { useState } from 'react'
import { Icon } from './Icon'

export function CopyButton({ text, className = '', title = 'Copy' }: { text: () => string; className?: string; title?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className={`copy-btn ${className}`}
      title={title}
      onClick={async () => {
        await navigator.clipboard.writeText(text())
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Icon name="check" className="h-3.5 w-3.5 text-emerald-500" /> : <Icon name="copy" />}
    </button>
  )
}
