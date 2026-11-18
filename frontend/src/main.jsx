import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker, captureInstallPrompt } from './lib/pwa'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

captureInstallPrompt() // before anything renders: the browser's install offer can arrive early
registerServiceWorker().catch(() => { /* the app works without the service worker */ })
