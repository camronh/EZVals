import type { NormalizedComparisonRun, RunResultRow } from '../../types'
import type { ComparisonMatrixEntry } from '../utils'
import InlineScoreBadges from './InlineScoreBadges'
import { formatValue } from '../utils'

type ComparisonRow = {
  key: string
  entry: ComparisonMatrixEntry
  index: number
  linkRunId?: string
  linkIndex?: number | null
  firstResult?: RunResultRow | null
}

type ComparisonTableProps = {
  sortedRows: ComparisonRow[]
  normalizedComparisonRuns: NormalizedComparisonRun[]
  onToggleSort: (col: string, type: string, multi: boolean) => void
  currentRunId?: string
}

export default function ComparisonTable({ sortedRows, normalizedComparisonRuns, onToggleSort, currentRunId }: ComparisonTableProps) {
  return (
    <table id="results-table" className="w-full table-fixed border-collapse text-sm text-theme-text comparison-table">
      <thead>
        <tr className="border-b border-theme-border">
          <th data-col="function" style={{ width: '15%' }} className="bg-theme-bg px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-theme-text-muted" onClick={(e) => onToggleSort('function', 'string', e.shiftKey)}>Eval</th>
          <th data-col="input" style={{ width: '15%' }} className="bg-theme-bg px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-theme-text-muted" onClick={(e) => onToggleSort('input', 'string', e.shiftKey)}>Input</th>
          <th data-col="reference" style={{ width: '15%' }} className="bg-theme-bg px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-theme-text-muted" onClick={(e) => onToggleSort('reference', 'string', e.shiftKey)}>Reference</th>
          {normalizedComparisonRuns.map((run) => (
            <th
              key={run.runId}
              data-col={`output-${run.runId}`}
              style={{ width: `${Math.floor(50 / normalizedComparisonRuns.length)}%`, borderLeft: `2px solid ${run.color}40` }}
              className="bg-theme-bg px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider comparison-output-header"
              onClick={(e) => onToggleSort(`output-${run.runId}`, 'string', e.shiftKey)}
            >
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: run.color }}></span>
                <span className="truncate">{run.runName}</span>
              </span>
            </th>
          ))}
          <th style={{ width: '28px' }} className="bg-theme-bg px-1 py-2"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-theme-border-subtle">
        {sortedRows.map((row) => {
          const meta = (row.entry?._meta || {}) as { function?: string; dataset?: string; labels?: string[] }
          const labelsHtml = meta.labels?.length ? (
            <>
              <span className="text-zinc-700">.</span>
              {meta.labels.map((la) => (
                <span key={la} className="rounded bg-theme-bg-elevated px-1 py-0.5 text-[9px] text-theme-text-muted">{la}</span>
              ))}
            </>
          ) : null
          return (
            <tr key={row.key} data-row="main" data-row-id={row.index} data-compare-key={row.key} className="group hover:bg-theme-bg-elevated/50 transition-colors">
              <td data-col="function" className="px-3 py-3 align-middle">
                <div className="flex flex-col gap-0.5">
                  {row.linkIndex != null ? (
                    <a
                      href={`/runs/${row.linkRunId || currentRunId}/results/${row.linkIndex}`}
                      className="font-mono text-[12px] font-medium text-accent-link hover:text-accent-link-hover"
                      onClick={() => sessionStorage.setItem('ezvals:scrollY', window.scrollY.toString())}
                    >
                      {meta.function}
                    </a>
                  ) : (
                    <span className="font-mono text-[12px] font-medium text-theme-text">{meta.function}</span>
                  )}
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500"><span>{meta.dataset || ''}</span>{labelsHtml}</div>
                </div>
              </td>
              <td data-col="input" className="px-3 py-3 align-middle">
                <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(row.firstResult?.result?.input)}</div>
              </td>
              <td data-col="reference" className="px-3 py-3 align-middle">
                {row.firstResult?.result?.reference != null ? (
                  <div className="line-clamp-4 text-[12px] text-theme-text">{formatValue(row.firstResult?.result?.reference)}</div>
                ) : (
                  <span className="text-zinc-600">--</span>
                )}
              </td>
              {normalizedComparisonRuns.map((run) => {
                const entry = row.entry?.[run.runId] as RunResultRow | undefined
                const result = entry?.result
                if (!result) {
                  return (
                    <td key={run.runId} data-col={`output-${run.runId}`} className="px-3 py-3 align-middle comparison-output-cell" style={{ borderLeft: `2px solid ${run.color}20` }}>
                      <span className="text-zinc-600">--</span>
                    </td>
                  )
                }
                const errorHtml = result.error ? (
                  <div className="text-[10px] text-accent-error truncate" title={result.error}>Error: {result.error.split('\n')[0]}</div>
                ) : null
                return (
                  <td key={run.runId} data-col={`output-${run.runId}`} className="px-3 py-3 comparison-output-cell" style={{ borderLeft: `2px solid ${run.color}20` }}>
                    <div className="comparison-output-content">
                      <div>
                        <div className="line-clamp-3 text-[12px] text-theme-text">{result.output != null ? formatValue(result.output) : '--'}</div>
                        {errorHtml}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        <InlineScoreBadges scores={result.scores || []} latency={result.latency} />
                      </div>
                    </div>
                  </td>
                )
              })}
              <td className="px-1 py-3 align-middle"></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
