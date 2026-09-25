import { CopyButton } from '../../components/CopyButton'
import { Icon } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'

type Props = {
  name: string
  trial?: number
  runCommand: string
  position: { index: number; total: number }
  onNavigate: (index: number) => void
  busy: 'rerun' | 'regrade' | null
  onRerun?: () => void
  onRegrade?: () => void
}

const navButton = 'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-blue-500 dark:hover:text-blue-400'

export function DetailHeader({ name, trial, runCommand, position, onNavigate, busy, onRerun, onRegrade }: Props) {
  return (
    <header className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-blue-200/60 bg-white px-2 py-2 sm:gap-4 sm:px-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <a href="/" className={navButton} title="Back (Esc)"><Icon name="arrow-left" /></a>
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate font-mono font-semibold text-zinc-900 dark:text-zinc-100">{name}</span>
          {trial ? <span className="flex-shrink-0 rounded bg-zinc-100 px-1 font-mono text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">trial {trial}</span> : null}
          <CopyButton text={() => runCommand} title="Copy run command" className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" />
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
        {onRegrade ? (
          <button id="regrade-result-btn" className="flex h-7 items-center gap-1.5 rounded border border-violet-500/30 bg-violet-500/10 px-2.5 text-xs font-medium text-violet-700 hover:bg-violet-500/20 disabled:opacity-60 dark:text-violet-300" title="Score this output again without re-running the target" onClick={onRegrade} disabled={!!busy}>
            {busy === 'regrade' ? <Spinner /> : <Icon name="target" className="h-3 w-3" />}
            <span className="max-sm:sr-only">{busy === 'regrade' ? 'Grading...' : 'Regrade'}</span>
          </button>
        ) : null}
        {onRerun ? (
          <button id="rerun-btn" className="flex h-7 items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-60 dark:text-emerald-400" title="Rerun this evaluation" onClick={onRerun} disabled={!!busy}>
            {busy === 'rerun' ? <Spinner /> : <Icon name="rerun" className="h-3 w-3" />}
            <span className="max-sm:sr-only">{busy === 'rerun' ? 'Running...' : 'Rerun'}</span>
          </button>
        ) : null}
        <span className="whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">{position.index + 1}/{position.total}</span>
        <button id="prev-btn" className={navButton} title="Up" disabled={position.index <= 0} onClick={() => onNavigate(position.index - 1)}><Icon name="chevron-up" className="h-3 w-3" /></button>
        <button id="next-btn" className={navButton} title="Down" disabled={position.index >= position.total - 1} onClick={() => onNavigate(position.index + 1)}><Icon name="chevron-down" className="h-3 w-3" /></button>
      </div>
    </header>
  )
}
