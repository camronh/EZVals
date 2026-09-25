import { useCallback, useState } from 'react'

type CopyableTextProps = {
  text: string
  className?: string
}

/** Text that copies itself on click and briefly shows "Copied!". */
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
    <span onClick={handleCopy} className={`relative ${className}`}>
      {text}
      {copied ? (
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-theme-text px-2 py-0.5 text-[11px] font-medium text-theme-bg shadow-[var(--shadow)]">Copied!</span>
      ) : null}
    </span>
  )
}
