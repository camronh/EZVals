import { useState } from 'react'
import { Icon } from './Icon'

export function CopyButton({ text, className = '', title = 'Copy' }: { text: () => string; className?: string; title?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={`copy-btn ${className}`}
      title={title}
      aria-label={copied ? 'Copied' : title}
      onClick={async () => {
        await navigator.clipboard.writeText(text())
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Icon name="check" className="h-3.5 w-3.5 text-success" /> : <Icon name="copy" />}
    </button>
  )
}
