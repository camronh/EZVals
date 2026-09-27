import { useCallback, useState } from 'react'

type CopyableTextProps = {
  text: string
  className?: string
}

/** Text that copies itself when clicked and briefly shows "Copied". */
export function CopyableText({ text, className = '' }: CopyableTextProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1000)
    } catch {
      // ignore clipboard failure
    }
  }, [text])

  return (
    <button type="button" onClick={handleCopy} title="Copy" className={`relative rounded-sm text-left ${className}`}>
      {text}
      {copied ? (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-fg px-2 py-0.5 text-2xs font-medium text-surface shadow-popover" role="status">Copied</span>
      ) : null}
    </button>
  )
}
