import { useState, useEffect } from 'react'
import { sileo } from 'sileo'
import axios from '../../api/axios'
import { useAlMostrar } from '../../context/PaginaActiva'

// Modo seguro de envío: límite diario y pausa entre mensajes del número
export default function ModoSeguro() {
  const [uso, setUso]           = useState(null)
  const [form, setForm]         = useState({ limite_diario: 50, pausa_min: 20, pausa_max: 60 })
  const [guardando, setGuardando] = useState(false)
  const [editado, setEditado]   = useState(false)

  const cargar = async (conForm = false) => {
    try {
      const { data } = await axios.get('/whatsapp/api/envio/config/')
      setUso(data)
      if (conForm) {
        setForm({ limite_diario: data.limite_diario, pausa_min: data.pausa_min, pausa_max: data.pausa_max })
        setEditado(false)
      }
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    cargar(true)
    const t = setInterval(() => cargar(false), 30000)
    return () => clearInterval(t)
  }, [])
  useAlMostrar('whatsapp', () => cargar(!editado))

  const cambiar = (campo) => (e) => {
    setForm(f => ({ ...f, [campo]: e.target.value }))
    setEditado(true)
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const datos = {
        limite_diario: Number(form.limite_diario),
        pausa_min: Number(form.pausa_min),
        pausa_max: Number(form.pausa_max),
      }
      const { data } = await axios.post('/whatsapp/api/envio/config/', datos)
      setUso(data)
      setEditado(false)
      sileo.success({ title: 'Modo seguro guardado', description: 'Se aplica desde el próximo mensaje, también en campañas en curso.' })
    } catch (e) {
      sileo.error({ title: 'No se guardó', description: e.response?.data?.error || 'Revisa los valores' })
    } finally {
      setGuardando(false)
    }
  }

  const sinLimite = uso && uso.limite_diario === 0
  const porcentaje = uso && !sinLimite ? Math.min(100, Math.round(uso.enviados_hoy / uso.limite_diario * 100)) : 0
  const lleno = uso && !sinLimite && uso.enviados_hoy >= uso.limite_diario

  const input = {
    width: '100%', padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8,
    fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box',
  }
  const label = { fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', maxWidth: 800, marginTop: 20, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" />
        </svg>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Modo seguro de envío</h2>
      </div>
      <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 18px', lineHeight: 1.5 }}>
        Las campañas envían un mensaje a la vez con pausas al azar y una pausa larga cada pocos mensajes.
        Al llegar al límite del día la campaña se pausa y sigue sola al día siguiente desde las {uso?.hora_reanudar ?? 8}:00.
        Si el WhatsApp se desconecta o WhatsApp empieza a bloquear mensajes, se pausa sola.
      </p>

      {/* Uso de hoy */}
      {uso && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#374151', marginBottom: 6 }}>
            <span>Enviados hoy desde este número</span>
            <strong style={{ color: lleno ? '#b42318' : '#374151' }}>
              {uso.enviados_hoy}{sinLimite ? '' : ` / ${uso.limite_diario}`}
            </strong>
          </div>
          {!sinLimite && (
            <div style={{ height: 7, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${porcentaje}%`, height: '100%', borderRadius: 4, transition: 'width 0.4s',
                background: lleno ? '#ef4444' : porcentaje >= 80 ? '#f59e0b' : '#10b981',
              }} />
            </div>
          )}
          {lleno && (
            <p style={{ fontSize: '0.75rem', color: '#b42318', margin: '6px 0 0' }}>
              Límite de hoy alcanzado: las campañas siguen mañana.
            </p>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <div>
          <label style={label}>Límite diario (0 = sin límite)</label>
          <input type="number" min="0" max="5000" value={form.limite_diario} onChange={cambiar('limite_diario')} style={input} />
        </div>
        <div>
          <label style={label}>Pausa mínima entre mensajes (s)</label>
          <input type="number" min="5" max="600" value={form.pausa_min} onChange={cambiar('pausa_min')} style={input} />
        </div>
        <div>
          <label style={label}>Pausa máxima entre mensajes (s)</label>
          <input type="number" min="5" max="600" value={form.pausa_max} onChange={cambiar('pausa_max')} style={input} />
        </div>
      </div>

      <div style={{ background: '#ecfdf5', borderLeft: '4px solid #10b981', padding: '10px 14px', borderRadius: 8, fontSize: '0.76rem', color: '#065f46', margin: '16px 0', lineHeight: 1.5 }}>
        Número nuevo: empieza con 30 a 50 al día y súbelo poco a poco durante 2 a 4 semanas si no hay bloqueos.
        Los mensajes llegan mejor a contactos que tienen tu número guardado o que ya te escribieron.
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={guardar} disabled={guardando || !editado} style={{
          padding: '9px 22px', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem',
          background: guardando || !editado ? '#9ca3af' : '#059669', color: '#fff',
          cursor: guardando || !editado ? 'not-allowed' : 'pointer',
        }}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
