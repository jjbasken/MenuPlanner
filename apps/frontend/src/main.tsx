import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/bricolage-grotesque/latin-400.css'
import '@fontsource/bricolage-grotesque/latin-600.css'
import '@fontsource/bricolage-grotesque/latin-800.css'
import './index.css'
import { App } from './App.js'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
)

// Registered from the bundle rather than an inline <script> in index.html: with
// no inline script on the page the CSP can be a plain `script-src 'self'`.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Caching is an optimisation — a failed registration must not break boot.
    })
  })
}
