import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ma-shan-zheng'
import '@fontsource/zcool-kuaile'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/* PWA：注册离线缓存 Service Worker（仅生产环境） */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
