import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Tipografía: Figtree (variable), incluida en el build para no depender de
// servicios externos de fuentes.
import '@fontsource-variable/figtree'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
