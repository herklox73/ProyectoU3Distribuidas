/**
 * useWebSocket.js — Singleton WebSocket persistente entre HMR reloads
 *
 * Problemas anteriores:
 *  1. Cada componente montado creaba su propia conexión (Total: 4→12).
 *  2. En Vite dev (HMR), re-evaluar el módulo re-ejecutaba _connect() → nueva conexión.
 *  3. El servidor manda evento "status" al conectar pero React solo escuchaba
 *     "wa_connected"/"qr_update" → el estado inicial siempre era "Desconectado".
 *
 * Solución:
 *  - Guardar el socket en window._wsSingleton para sobrevivir HMR.
 *  - Registrar/desregistrar callbacks sin tocar el socket.
 *  - El hook re-emite el evento "status" como "wa_connected" / "qr_update" según data.ready.
 */

import { useEffect, useRef } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'
const RECONNECT_DELAY = 4000
const KEY = '_wsSingleton'

function getState() {
  if (!window[KEY]) {
    window[KEY] = { ws: null, timer: null, listeners: new Map(), nextId: 1 }
  }
  return window[KEY]
}

function dispatch(eventName, data) {
  getState().listeners.forEach(handlers => {
    // Cada handlers puede ser un objeto directo o un Proxy que resuelve dinámicamente
    const fn = typeof handlers === 'function' ? null : handlers[eventName]
    if (typeof fn === 'function') fn(data)
  })
}

// Seguridad: el gateway solo acepta conexiones con un ticket de 60 s que
// Django entrega a usuarios con sesión iniciada (/whatsapp/api/ws-ticket/).
// Mientras no haya sesión, se reintenta sin conectar.
async function fetchTicket() {
  try {
    const headers = {}
    const jwt = localStorage.getItem('jwt_token')
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`
    const r = await fetch('/whatsapp/api/ws-ticket/', { credentials: 'include', headers })
    if (!r.ok) return null
    const data = await r.json()
    return data.authenticated ? (data.ticket || '') : null
  } catch {
    return null
  }
}

function scheduleRetry(s) {
  if (!s.timer) {
    s.timer = setTimeout(() => { s.timer = null; connect() }, RECONNECT_DELAY)
  }
}

async function connect() {
  const s = getState()
  if (s.connecting) return
  if (s.ws && (s.ws.readyState === WebSocket.CONNECTING || s.ws.readyState === WebSocket.OPEN)) return

  s.connecting = true
  const ticket = await fetchTicket()
  s.connecting = false
  if (ticket === null) { scheduleRetry(s); return }

  const url = ticket ? `${WS_URL}${WS_URL.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(ticket)}` : WS_URL
  console.log('[WS] Conectando a', WS_URL)
  const ws = new WebSocket(url)
  s.ws = ws

  ws.onopen = () => {
    console.log('[WS] Conexión establecida')
    if (s.timer) { clearTimeout(s.timer); s.timer = null }
  }

  ws.onmessage = (ev) => {
    try {
      const { event: eventName, data } = JSON.parse(ev.data)

      // El servidor manda "status" al conectar — traducirlo al evento correcto
      if (eventName === 'status') {
        dispatch(data.ready ? 'wa_connected' : 'qr_update', data)
        return
      }

      dispatch(eventName, data)
    } catch {}
  }

  ws.onclose = () => {
    console.log('[WS] Cerrada. Reconectando en', RECONNECT_DELAY, 'ms...')
    s.ws = null
    scheduleRetry(s)
  }

  ws.onerror = () => ws.close()
}

// Arrancar solo si no hay ya una conexión viva (sobrevive HMR)
const _s = getState()
if (!_s.ws || _s.ws.readyState === WebSocket.CLOSED || _s.ws.readyState === WebSocket.CLOSING) {
  connect()
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useWebSocket(handlers = {}) {
  const idRef       = useRef(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const s = getState()
    if (idRef.current === null) idRef.current = s.nextId++

    // Proxy: siempre lee la versión más reciente de handlers sin re-registrar
    s.listeners.set(idRef.current, new Proxy({}, {
      get: (_, prop) => handlersRef.current[prop]
    }))

    return () => {
      s.listeners.delete(idRef.current)
    }
  }, [])
}
