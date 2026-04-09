import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './global.css'
import { AppWithAuth } from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppWithAuth />
  </StrictMode>,
)
