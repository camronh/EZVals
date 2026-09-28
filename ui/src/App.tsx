import { IconSprite } from './components/Icon'
import { DashboardPage } from './dashboard/DashboardPage'
import { DetailPage } from './detail/DetailPage'
import { readQuery } from './lib/urlState'

/** Routes: /runs/{run_id}/results/{index} is a result's detail page; everything else is the dashboard. */
export default function App() {
  const params = new URLSearchParams(window.location.search)
  const detail = window.location.pathname.match(/^\/runs\/([^/]+)\/results\/(\d+)/)
  if (!detail) {
    return <><IconSprite /><DashboardPage query={readQuery(params)} /></>
  }
  let compareRunIds = [...new Set(params.getAll('compare_run_id'))]
  if (!compareRunIds.length && params.get('mode') !== 'single') {
    // Coming from the dashboard's comparison view without a link that names the runs.
    const saved: { runId: string }[] = JSON.parse(sessionStorage.getItem('ezvals:comparisonRuns') || '[]')
    compareRunIds = saved.map((r) => r.runId)
  }
  return <><IconSprite /><DetailPage runId={detail[1]} index={Number(detail[2])} compareRunIds={compareRunIds} /></>
}
