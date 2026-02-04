import DashboardPage from './dashboard/DashboardPage'
import DetailPage from './detail/DetailPage'

export default function App() {
  const path = window.location.pathname
  const isDetail = /^\/runs\/[^/]+\/results\/\d+/.test(path)

  return isDetail ? <DetailPage /> : <DashboardPage />
}
