import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@dudko.dev/agent-web-react/styles.css'
import './app.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
