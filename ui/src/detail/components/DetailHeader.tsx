import { CopyButton } from '../../components/CopyButton'
import { button, iconButton, primaryButton } from '../../components/Dropdown'
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

export function DetailHeader({ name, trial, runCommand, position, onNavigate, busy, onRerun, onRegrade }: Props) {
  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-theme-border bg-theme-bg px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <a href="/" className={iconButton} title="Back (Esc)"><Icon name="arrow-left" /></a>
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate font-semibold text-theme-text">{name}</span>
          {trial ? <span className="flex-shrink-0 rounded-md bg-theme-bg-elevated px-1.5 py-0.5 text-[11px] font-medium text-theme-text-secondary">trial {trial}</span> : null}
          <CopyButton text={() => runCommand} title="Copy run command" className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-theme-text-muted hover:bg-theme-bg-elevated hover:text-theme-text" />
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className="whitespace-nowrap pr-1 font-mono max-sm:hidden text-[12px] tabular-nums text-theme-text-muted">{position.index + 1}/{position.total}</span>
        <button id="prev-btn" className={iconButton} title="Up" disabled={position.index <= 0} onClick={() => onNavigate(position.index - 1)}><Icon name="chevron-up" className="h-3 w-3" /></button>
        <button id="next-btn" className={iconButton} title="Down" disabled={position.index >= position.total - 1} onClick={() => onNavigate(position.index + 1)}><Icon name="chevron-down" className="h-3 w-3" /></button>
        {onRegrade || onRerun ? <span className="mx-1 h-5 w-px bg-theme-border" /> : null}
        {onRegrade ? (
          <button id="regrade-result-btn" className={button} title="Score this output again without re-running the target" onClick={onRegrade} disabled={!!busy}>
            {busy === 'regrade' ? <Spinner /> : <Icon name="target" className="h-3 w-3" />}
            <span className="max-sm:sr-only">{busy === 'regrade' ? 'Grading...' : 'Regrade'}</span>
          </button>
        ) : null}
        {onRerun ? (
          <button id="rerun-btn" className={`${primaryButton} disabled:opacity-60`} title="Rerun this evaluation" onClick={onRerun} disabled={!!busy}>
            {busy === 'rerun' ? <Spinner /> : <Icon name="rerun" className="h-3 w-3" />}
            <span className="max-sm:sr-only">{busy === 'rerun' ? 'Running...' : 'Rerun'}</span>
          </button>
        ) : null}
      </div>
    </header>
  )
}
