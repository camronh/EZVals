import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/dashboard.css'
import './styles/detail.css'
import App from './App'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element not found')
}

createRoot(root).render(<App />)
