import { useState, useRef, useEffect } from 'react'
import axios from '../api/axios'

// Asistente de IA local (Ollama). El navegador envía la pregunta al
// backend Django, que hace una llamada síncrona (RPC sobre HTTP) al
// modelo qwen2.5 servido por Ollama y devuelve la respuesta completa.

const SUGERENCIAS = [
  '¿Cómo creo una campaña?',
  '¿Cómo importo mis contactos?',
  '¿Cómo funcionan los créditos?',
  'Redáctame un mensaje para promocionar un descuento del 20%',
]

export default function AsistentePage() {
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [estadoIA, setEstadoIA] = useState(null)
  const [copiado, setCopiado] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    axios.get('/whatsapp/api/asistente/health/')
      .then(r => setEstadoIA(r.data))
      .catch(() => setEstadoIA({ available: false }))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes, cargando])

  const enviar = async (prompt) => {
    const pregunta = (prompt ?? texto).trim()
    if (!pregunta || cargando) return
    setTexto('')
    const nuevoHistorial = [...mensajes, { role: 'user', content: pregunta }]
    setMensajes(nuevoHistorial)
    setCargando(true)
    try {
      const { data } = await axios.post('/whatsapp/api/asistente/chat/', {
        prompt: pregunta,
        history: mensajes.map(m => ({ role: m.role, content: m.content })),
      })
      setMensajes([...nuevoHistorial, {
        role: 'assistant',
        content: data.answer,
        model: data.model,
        latencyMs: data.latencyMs,
        ollamaTotalMs: data.ollamaTotalMs,
      }])
    } catch (err) {
      const msg = err?.response?.data?.error || 'No se pudo contactar al asistente. Verifica que Ollama esté iniciado.'
      setMensajes([...nuevoHistorial, { role: 'assistant', content: msg, error: true }])
    } finally {
      setCargando(false)
    }
  }

  const copiar = async (contenido, idx) => {
    try {
      await navigator.clipboard.writeText(contenido)
      setCopiado(idx)
      setTimeout(() => setCopiado(null), 1500)
    } catch { /* portapapeles no disponible */ }
  }

  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, color: '#1a1a2e' }}>Asistente IA</h2>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', margin: '6px 0 0' }}>
            Modelo de IA local ejecutado con Ollama. Pregunta cómo usar MassSend o pide que te redacte un mensaje de campaña.
          </p>
        </div>
        {estadoIA && (
          <span style={{
            fontSize: '0.78rem', fontWeight: 700, padding: '6px 12px', borderRadius: 999,
            background: estadoIA.available ? (estadoIA.modelDownloaded ? '#dcfce7' : '#fef3c7') : '#fee2e2',
            color: estadoIA.available ? (estadoIA.modelDownloaded ? '#15803d' : '#b45309') : '#b91c1c',
          }}>
            {estadoIA.available
              ? (estadoIA.modelDownloaded ? `Ollama listo · ${estadoIA.model}` : `Ollama activo · falta descargar ${estadoIA.model}`)
              : 'Ollama no disponible'}
          </span>
        )}
      </div>

      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', margin: '18px 0', padding: 18,
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
      }}>
        {mensajes.length === 0 && (
          <div style={{ textAlign: 'center', color: '#6b7280', marginTop: 40 }}>
            <p style={{ fontWeight: 600, marginBottom: 16 }}>¿En qué te puedo ayudar?</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {SUGERENCIAS.map(s => (
                <button key={s} onClick={() => enviar(s)} style={{
                  padding: '8px 14px', borderRadius: 999, border: '1.5px solid #e5e7eb',
                  background: '#f9fafb', color: '#374151', fontSize: '0.83rem', cursor: 'pointer',
                }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
            <div style={{
              maxWidth: '75%', padding: '10px 14px', borderRadius: 12, fontSize: '0.9rem',
              whiteSpace: 'pre-wrap', lineHeight: 1.5,
              background: m.role === 'user' ? '#25d366' : (m.error ? '#fee2e2' : '#f3f4f6'),
              color: m.role === 'user' ? '#fff' : (m.error ? '#b91c1c' : '#1f2937'),
            }}>
              {m.content}
              {m.role === 'assistant' && !m.error && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.72rem', color: '#6b7280' }}>
                  <span>{m.model} · {m.latencyMs} ms{m.ollamaTotalMs ? ` (inferencia ${m.ollamaTotalMs} ms)` : ''}</span>
                  <button onClick={() => copiar(m.content, idx)} style={{
                    border: 'none', background: 'transparent', color: '#2563eb',
                    cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, padding: 0,
                  }}>
                    {copiado === idx ? '✓ Copiado' : 'Copiar (para tu campaña)'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {cargando && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{ padding: '10px 14px', borderRadius: 12, background: '#f3f4f6', color: '#6b7280', fontSize: '0.9rem' }}>
              El modelo está pensando<span style={{ animation: 'pulse 1s infinite' }}>...</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={e => { e.preventDefault(); enviar() }} style={{ display: 'flex', gap: 10 }}>
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          disabled={cargando}
          placeholder="Escribe tu pregunta o pide un mensaje para tu campaña..."
          style={{
            flex: 1, padding: '12px 16px', border: '1.5px solid #e5e7eb', borderRadius: 10,
            fontSize: '0.9rem', outline: 'none',
          }}
        />
        <button type="submit" disabled={cargando || !texto.trim()} style={{
          padding: '12px 22px', background: cargando || !texto.trim() ? '#9ca3af' : '#25d366',
          color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700,
          fontSize: '0.9rem', cursor: cargando || !texto.trim() ? 'not-allowed' : 'pointer',
        }}>
          {cargando ? 'Esperando...' : 'Enviar'}
        </button>
      </form>
    </div>
  )
}
