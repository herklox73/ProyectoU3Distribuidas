import { useState, useEffect, useRef } from 'react'
import { sileo } from 'sileo'
import axios from '../api/axios'
import { useWa } from '../context/WaContext'

export default function WhatsAppPage() {
  const { waListo } = useWa()   // estado global — siempre actualizado
  const [estado, setEstado]         = useState({ ready: false, has_qr: false, qr: null, has_pairing: false, pairing_code: null })
  const [msgBtn, setMsgBtn]         = useState('')
  const [desconectando, setDesconectando] = useState(false)
  const qrRef                       = useRef(null)
  const qrInstance                  = useRef(null)
  const pollingRef                  = useRef(null)

  const cargarEstado = async () => {
    try {
      const { data } = await axios.get('/whatsapp/api/qr-status/')
      setEstado(data)
    } catch {}
  }

  useEffect(() => {
    cargarEstado()
    pollingRef.current = setInterval(cargarEstado, 3000)
    return () => clearInterval(pollingRef.current)
  }, [])

  // Renderizar QR cuando cambia
  useEffect(() => {
    if (!estado.qr || !qrRef.current) return
    if (typeof window.QRCode === 'undefined') return
    qrRef.current.innerHTML = ''
    qrInstance.current = new window.QRCode(qrRef.current, {
      text: estado.qr,
      width: 220, height: 220,
      colorDark: '#000', colorLight: '#fff',
      correctLevel: window.QRCode.CorrectLevel.M
    })
  }, [estado.qr])

  const desconectar = async () => {
    // Confirmación nativa: siempre visible (el aviso de sileo abajo era
    // fácil de pasar por alto y parecía que el botón no hacía nada).
    if (!window.confirm('¿Desconectar WhatsApp? Tendrás que escanear el QR de nuevo.')) return
    setDesconectando(true)
    setMsgBtn('')
    try {
      await axios.post('/whatsapp/api/cambiar-numero/')
      setMsgBtn('Desconectado. Esperando nuevo código QR...')
      sileo.success({ title: 'WhatsApp desconectado', description: 'Escanea el nuevo QR para reconectar' })
    } catch {
      setMsgBtn('Error al desconectar')
      sileo.error({ title: 'Error al desconectar' })
    } finally {
      setDesconectando(false)
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: '#f8f9fa' }}>
      <h1 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: 6 }}>Conexión WhatsApp</h1>
      <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: 28 }}>
        Vincula un número de WhatsApp para enviar y recibir mensajes.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 800 }}>

        {/* Columna izquierda — estado */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Estado de la conexión
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 16px', borderRadius: 20,
              background: waListo ? '#d1fae5' : '#fee2e2',
              color: waListo ? '#065f46' : '#991b1b',
              fontWeight: 700, fontSize: '0.85rem'
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: waListo ? '#10b981' : '#ef4444',
              }} />
              {waListo ? 'Conectado' : 'Desconectado'}
            </div>
          </div>

          <div style={{ fontSize: '0.82rem', color: '#555', marginBottom: 24 }}>
            <p style={{ fontWeight: 600, marginBottom: 10 }}>Cómo vincular un número:</p>
            {[
              'Haz clic en Desconectar si hay un número activo.',
              'Espera a que aparezca el código QR.',
              'En tu celular abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo y escanea el código.',
              'Cuando el estado cambie a Conectado, ya está listo.'
            ].map((paso, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <span style={{
                  minWidth: 22, height: 22, borderRadius: '50%',
                  background: '#7c3aed', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.72rem', fontWeight: 700, flexShrink: 0
                }}>{i + 1}</span>
                <span style={{ paddingTop: 2 }}>{paso}</span>
              </div>
            ))}
          </div>

          <div style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b', padding: '10px 14px', borderRadius: 8, fontSize: '0.78rem', color: '#92400e', marginBottom: 20 }}>
            El historial de chats y contactos no se borra al cambiar el número.
          </div>

          <button
            onClick={desconectar}
            disabled={desconectando || !waListo}
            style={{
              width: '100%', padding: '10px',
              background: desconectando || !waListo ? '#9ca3af' : '#dc2626',
              color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700,
              cursor: desconectando || !waListo ? 'not-allowed' : 'pointer', fontSize: '0.88rem'
            }}
          >
            {desconectando ? 'Desconectando...' : 'Desconectar número actual'}
          </button>
          {msgBtn && (
            <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#6b7280', textAlign: 'center' }}>{msgBtn}</div>
          )}
        </div>

        {/* Columna derecha — QR */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          {/* Panel QR (la vinculación por código de teléfono se quitó: fallaba y bloqueaba el QR) */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <p style={{ fontSize: '0.82rem', color: '#888', marginBottom: 16 }}>Código QR para escanear</p>

              {waListo && estado.restriccion ? (
                <div style={{ textAlign: 'center', padding: '20px 18px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12 }}>
                  <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>⚠️</div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#9a3412' }}>Conectado, pero WhatsApp restringió este número</p>
                  <p style={{ fontSize: '0.78rem', color: '#7c2d12', marginTop: 6, lineHeight: 1.5 }}>
                    En las últimas 24 h WhatsApp bloqueó {estado.restriccion.bloqueados_24h} mensaje(s) (error 463, último: {estado.restriccion.ultimo}).
                    Por un tiempo no deja escribir a contactos nuevos desde el sistema.
                    No lances campañas hasta que pase: insistir puede terminar en un bloqueo definitivo.
                  </p>
                </div>
              ) : waListo ? (
                <div style={{ textAlign: 'center', padding: '28px 20px' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>✅</div>
                  <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#065f46' }}>WhatsApp conectado</p>
                  <p style={{ fontSize: '0.78rem', color: '#888', marginTop: 4 }}>El número está vinculado y listo para enviar mensajes.</p>
                </div>
              ) : estado.limit_reached ? (
                <div style={{ border: '1.5px dashed #fca5a5', borderRadius: 10, padding: '32px 24px', textAlign: 'center', width: '100%' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>⚠️</div>
                  <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#991b1b' }}>Servidor lleno</p>
                  <p style={{ fontSize: '0.78rem', color: '#888', marginTop: 4 }}>
                    {estado.error || 'Se alcanzó el máximo de números conectados.'} Intenta más tarde o contacta al administrador.
                  </p>
                </div>
              ) : estado.has_qr && estado.qr ? (
                <div>
                  <div ref={qrRef} style={{ padding: 8, border: '1.5px dashed #c4b5fd', borderRadius: 10 }} />
                  <p style={{ fontSize: '0.72rem', color: '#aaa', textAlign: 'center', marginTop: 8 }}>
                    El código QR se actualiza automáticamente cada 3 segundos.
                  </p>
                </div>
              ) : (
                <div style={{ border: '1.5px dashed #e5e7eb', borderRadius: 10, padding: '48px 32px', textAlign: 'center', width: '100%' }}>
                  <div style={{ width: 36, height: 36, border: '3px solid #c4b5fd', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 14px' }} />
                  <p style={{ fontSize: '0.82rem', color: '#aaa' }}>Esperando código QR de WhatsApp...</p>
                </div>
              )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
