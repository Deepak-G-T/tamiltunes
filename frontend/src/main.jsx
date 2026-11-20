import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker, captureInstallPrompt } from './lib/pwa'
import { initTokenStore } from './lib/tokenStore'
import { initNative } from './lib/native'
import { initMonitoring } from './lib/monitoring'
import ErrorBoundary from './components/common/ErrorBoundary'

initMonitoring() // error reports: on only when VITE_SENTRY_DSN was set at build time

// The saved login is loaded first (inside the Android app it lives in private storage and loads asynchronously), then the app draws
initTokenStore().catch(() => null).then(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary scope="app">
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
  initNative() // Android app: status bar and splash screen
})

captureInstallPrompt() // before anything renders: the browser's install offer can arrive early
registerServiceWorker().catch(() => { /* the app works without the service worker */ })
