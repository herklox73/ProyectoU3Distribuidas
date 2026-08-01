import { useState, useEffect, useRef } from 'react'
import { sileo } from 'sileo'
import axios from '../api/axios'
import { useWa } from '../context/WaContext'

export default function WhatsAppPage() {
  const { waListo } = useWa()   // estado global — siempre actualizado
  const [estado, setEstado]         = useState({ ready: false, has_qr: false, qr: null, has_pairing: false, pairing_code: null })
  const [tab, setTab]               = useState('qr')
  const [telefono, setTelefono]     = useState('593')
  const [msgPairing, setMsgPairing] = useState('')
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

  const pedirCodigo = async () => {
    if (!telefono || telefono.length < 7) {
      setMsgPairing('Ingresa un número válido con código de país, sin el +')
      return
    }
    setMsgPairing('Solicitando código...')
    try {
      const { data } = await axios.post('/whatsapp/api/request-pairing/', { phone: telefono })
      if (data.success && data.code) {
        setMsgPairing(`Código listo: ${data.code}`)
      } else if (data.success) {
        setMsgPairing('Número guardado. El código aparecerá en unos segundos...')
      } else {
        setMsgPairing(data.error || 'Error al solicitar código')
      }
    } catch {
      setMsgPairing('Error de conexión')
    }
  }

  const pairingPartes = estado.pairing_code
    ? [estado.pairing_code.slice(0, 4), estado.pairing_code.slice(4, 8)]
    : ['----', '----']

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
              'Elige código QR o vincular por número de teléfono.',
              'Abre WhatsApp → Dispositivos vinculados → sigue el método.',
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

        {/* Columna derecha — QR / código */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          {/* Tabs */}
          <div style={{ display: 'flex', border: '1.5px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 20, width: '100%' }}>
            {['qr', 'telefono'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: '9px 0', textAlign: 'center',
                fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: tab === t ? '#7c3aed' : '#f9fafb',
                color: tab === t ? '#fff' : '#6b7280',
                transition: 'background 0.15s'
              }}>
                {t === 'qr' ? 'Código QR' : 'Por teléfono'}
              </button>
            ))}
          </div>

          {/* Panel QR */}
          {tab === 'qr' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <p style={{ fontSize: '0.82rem', color: '#888', marginBottom: 16 }}>Código QR para escanear</p>

              {waListo ? (
                <div style={{ textAlign: 'center', padding: '28px 20px' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>✅</div>
                  <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#065f46' }}>WhatsApp conectado</p>
                  <p style={{ fontSize: '0.78rem', color: '#888', marginTop: 4 }}>El número está vinculado y listo para enviar mensajes.</p>
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
          )}

          {/* Panel teléfono */}
          {tab === 'telefono' && (
            <div style={{ width: '100%' }}>
              <p style={{ fontSize: '0.82rem', color: '#888', marginBottom: 16 }}>
                Vincula por número de teléfono sin necesitar escanear QR.
              </p>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
                  Número con código de país (sin +)
                </label>
                <input
                  value={telefono}
                  onChange={e => setTelefono(e.target.value.replace(/\D/g, ''))}
                  placeholder="593XXXXXXXXX"
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <button onClick={pedirCodigo} style={{
                width: '100%', padding: '10px', background: '#7c3aed', color: '#fff',
                border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem', marginBottom: 16
              }}>
                Solicitar código de vinculación
              </button>

              {estado.has_pairing && estado.pairing_code && (
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <p style={{ fontSize: '0.78rem', color: '#555', marginBottom: 10 }}>
                    Ingresa este código en WhatsApp → Dispositivos vinculados → Vincular con número de teléfono:
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div style={{ background: '#fff', border: '2px solid #7c3aed', borderRadius: 10, padding: '10px 16px', fontSize: '1.6rem', fontWeight: 700, fontFamily: 'monospace', letterSpacing: 4, color: '#1e1b4b' }}>
                      {pairingPartes[0]}
                    </div>
                    <span style={{ fontSize: '1.4rem', color: '#7c3aed', fontWeight: 700 }}>-</span>
                    <div style={{ background: '#fff', border: '2px solid #7c3aed', borderRadius: 10, padding: '10px 16px', fontSize: '1.6rem', fontWeight: 700, fontFamily: 'monospace', letterSpacing: 4, color: '#1e1b4b' }}>
                      {pairingPartes[1]}
                    </div>
                  </div>
                </div>
              )}

              {msgPairing && (
                <div style={{
                  fontSize: '0.8rem', marginTop: 8, padding: '8px 12px', borderRadius: 7, textAlign: 'center',
                  background: msgPairing.includes('Error') || msgPairing.includes('error') ? '#fee2e2' : '#f0fdf4',
                  color: msgPairing.includes('Error') || msgPairing.includes('error') ? '#991b1b' : '#065f46'
                }}>
                  {msgPairing}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
