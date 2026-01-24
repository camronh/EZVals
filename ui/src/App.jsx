import { useEffect } from 'react'
import DashboardPage from './dashboard/DashboardPage.jsx'

const DETAIL_BODY_CLASS = 'min-h-screen bg-blue-50/40 font-sans text-zinc-800 dark:bg-neutral-950 dark:text-zinc-100'

function useLegacyScript(loader, bodyClass, title) {
  useEffect(() => {
    document.title = title
    document.body.className = bodyClass
    loader()
    return () => {
      document.body.className = ''
    }
  }, [loader, bodyClass, title])
}

function DetailPage() {
  useLegacyScript(() => {
    import('./legacy-detail.js')
  }, DETAIL_BODY_CLASS, 'Result Detail - EZVals')

  return (
    <div className="min-h-screen bg-blue-50/40 font-sans text-zinc-800 dark:bg-neutral-950 dark:text-zinc-100">
      <div id="app" className="flex flex-col h-screen">
        <div className="flex-1 flex items-center justify-center text-zinc-400">Loading...</div>
      </div>
    </div>
  )
}

export default function App() {
  const path = window.location.pathname
  const isDetail = /^\/runs\/[^/]+\/results\/\d+/.test(path)

  return isDetail ? <DetailPage /> : <DashboardPage />
}
