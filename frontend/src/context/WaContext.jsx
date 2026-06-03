/**
 * WaContext — estado global de conexión WhatsApp
 *
 * Centraliza el estado `waListo` para que TODAS las páginas lo compartan.
 * Se inicializa una sola vez al montar el layout, así al navegar entre páginas
 * nunca se resetea a false.
 */
import { createContext, useContext, useState, useEffect } from 'react'
import axios from '../api/axios'
import { useWebSocket } from '../hooks/useWebSocket'

const WaContext = createContext({ waListo: false })

export function WaProvider({ children }) {
  const [waListo, setWaListo] = useState(false)

  // Consulta inicial + polling cada 10s (respaldo por si el WS falla)
  useEffect(() => {
    const consultar = () =>
      axios.get('/whatsapp/api/qr-status/')
        .then(r => setWaListo(!!r.data.ready))
        .catch(() => {})
    consultar()
    const t = setInterval(consultar, 10_000)
    return () => clearInterval(t)
  }, [])

  // Actualización instantánea vía WebSocket
  useWebSocket({
    status:       (d) => setWaListo(!!d?.ready),
    wa_connected: ()  => setWaListo(true),
    qr_update:    ()  => setWaListo(false),
  })

  return (
    <WaContext.Provider value={{ waListo, setWaListo }}>
      {children}
    </WaContext.Provider>
  )
}

export const useWa = () => useContext(WaContext)
