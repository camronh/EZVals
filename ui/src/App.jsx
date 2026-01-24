import DashboardPage from './dashboard/DashboardPage.jsx'
import DetailPage from './detail/DetailPage.jsx'

export default function App() {
  const path = window.location.pathname
  const isDetail = /^\/runs\/[^/]+\/results\/\d+/.test(path)

  return isDetail ? <DetailPage /> : <DashboardPage />
}
