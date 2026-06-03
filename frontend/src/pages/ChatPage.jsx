import { useState, useEffect, useRef } from 'react'
import axios from '../api/axios'
import { useWebSocket } from '../hooks/useWebSocket'
import { useWa } from '../context/WaContext'

const TICK = { pending: '🕐', sent: '✓', delivered: '✓✓', read: '✓✓', failed: '✗' }

export default function ChatPage() {
  const [mensajes, setMensajes]     = useState({})
  const [activo, setActivo]         = useState(null)
  const [busqueda, setBusqueda]     = useState('')
  const [texto, setTexto]           = useState('')
  const { waListo } = useWa()   // estado global — no se resetea al navegar
  const [enviando, setEnviando]     = useState(false)
  const [loading, setLoading]       = useState(true)
  const bottomRef                   = useRef(null)

  // ── Cargar mensajes desde Django ──────────────────────────────────
  const cargarMensajes = async () => {
    try {
      const { data } = await axios.get('/whatsapp/chat/leer_mensajes.php')
      setMensajes(data.mensajes || {})
    } catch (e) {
      console.error('Error cargando mensajes:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarMensajes()
    const timer = setInterval(cargarMensajes, 5000)
    // El estado WA viene del WaContext global — no hace falta consultarlo aquí
    return () => clearInterval(timer)
  }, [])

  // ── WebSocket: eventos en tiempo real desde Node.js ───────────────
  useWebSocket({
    new_message: (data) => {
      // Mensaje entrante: actualizar sin esperar el polling
      setMensajes(prev => {
        const num = data.from
        const chat = prev[num] || { nombre: num, custom_name: '', mensajes: [], foto: `https://ui-avatars.com/api/?name=${num}&background=4f46e5&color=fff`, etiqueta: '' }
        return {
          ...prev,
          [num]: {
            ...chat,
            mensajes: [...chat.mensajes, {
              texto: data.body,
              tipo: 'recibido',
              direccion: 'IN',
              hora: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
              fecha: new Date().toLocaleDateString('es'),
              status: 'delivered',
            }]
          }
        }
      })
    },
    message_ack: (data) => {
      // Actualizar estado del tick de un mensaje
      setMensajes(prev => {
        const chat = prev[data.number]
        if (!chat) return prev
        return {
          ...prev,
          [data.number]: {
            ...chat,
            mensajes: chat.mensajes.map(m =>
              m.wpp_message_id === data.wpp_message_id
                ? { ...m, status: data.status }
                : m
            )
          }
        }
      })
    }
  })

  // ── Auto-scroll al último mensaje ─────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activo, mensajes])

  // ── Enviar mensaje ────────────────────────────────────────────────
  const enviar = async () => {
    if (!texto.trim() || !activo || enviando) return
    const msg = texto.trim()
    setTexto('')
    setEnviando(true)

    // Agregar el mensaje localmente de inmediato (UX responsiva)
    const nuevaMsj = {
      texto: msg, tipo: 'enviado', direccion: 'OUT',
      hora: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
      fecha: new Date().toLocaleDateString('es'),
      status: 'pending',
    }
    setMensajes(prev => ({
      ...prev,
      [activo]: { ...prev[activo], mensajes: [...(prev[activo]?.mensajes || []), nuevaMsj] }
    }))

    try {
      await axios.post('/whatsapp/chat/enviar_whatsapp.php', { to: activo, message: msg })
    } catch (e) {
      console.error('Error enviando:', e)
    } finally {
      setEnviando(false)
    }
  }

  const onKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }

  // ── Filtrar contactos por búsqueda ────────────────────────────────
  const contactos = Object.entries(mensajes).filter(([num, data]) => {
    const nombre = data.custom_name || data.nombre || num
    return nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
           num.includes(busqueda)
  })

  const chatActivo = activo ? mensajes[activo] : null

  if (loading) return <div className="loading">Cargando conversaciones...</div>

  return (
    <div className="chat-page">
      {/* ── Lista de chats ── */}
      <div className="chat-list">
        <div className="chat-list-header">
          <span>Chats</span>
          <span className={`wa-badge ${waListo ? 'connected' : 'disconnected'}`}>
            <span className={`wa-dot ${waListo ? 'on' : 'off'}`}></span>
            {waListo ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
        <div className="chat-search">
          <input
            placeholder="Buscar contacto..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <div className="chat-items">
          {contactos.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: '0.85rem' }}>
              No hay chats aún
            </div>
          )}
          {contactos.map(([num, data]) => {
            const msgs    = data.mensajes || []
            const ultimo  = msgs[msgs.length - 1]
            const nombre  = data.custom_name || data.nombre || num
            return (
              <div
                key={num}
                className={`chat-item ${activo === num ? 'active' : ''}`}
                onClick={() => setActivo(num)}
              >
                <img className="chat-avatar" src={data.foto || `https://ui-avatars.com/api/?name=${nombre}&background=4f46e5&color=fff`} alt="" />
                <div className="chat-info">
                  <div className="chat-name">{nombre}</div>
                  <div className="chat-preview">{ultimo?.texto || 'Sin mensajes'}</div>
                </div>
                {data.etiqueta && <span className="chat-tag">{data.etiqueta}</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Ventana de chat ── */}
      {chatActivo ? (
        <div className="chat-window">
          <div className="chat-window-header">
            <img
              className="chat-avatar"
              src={chatActivo.foto || `https://ui-avatars.com/api/?name=${chatActivo.custom_name || activo}&background=4f46e5&color=fff`}
              alt=""
            />
            <div>
              <div className="chat-window-name">{chatActivo.custom_name || chatActivo.nombre || activo}</div>
              <div className="chat-window-num">+{activo}</div>
            </div>
          </div>

          <div className="messages-area">
            {(chatActivo.mensajes || []).map((m, i) => (
              <div key={i} className={`bubble-row ${m.tipo === 'enviado' ? 'out' : 'in'}`}>
                <div className={`bubble ${m.tipo === 'enviado' ? 'out' : 'in'}`}>
                  {m.texto}
                  <div className="bubble-time">
                    {m.hora}
                    {m.tipo === 'enviado' && (
                      <span className="bubble-status"> {TICK[m.status] || '✓'}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-area">
            <input
              className="chat-input"
              placeholder="Escribe un mensaje..."
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={enviando}
            />
            <button className="send-btn" onClick={enviar} disabled={enviando}>
              &rarr;
            </button>
          </div>
        </div>
      ) : (
        <div className="empty-chat">
          <p>Selecciona una conversación para comenzar</p>
        </div>
      )}
    </div>
  )
}
