import { useCallback, useState } from 'react'

/**
 * @param {{ text: string, className?: string }} props
 */
export default function CopyableText({ text, className = '' }) {
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
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-zinc-700 px-2 py-0.5 text-[10px] text-white whitespace-nowrap">Copied!</span>
      ) : null}
    </span>
  )
}
