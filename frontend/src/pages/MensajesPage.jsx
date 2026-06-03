import { useState, useEffect } from 'react'
import axios from '../api/axios'

const STATUS_LABEL = { sent: 'Enviado', delivered: 'Entregado', read: 'Leído', failed: 'Fallido', pending: 'Pendiente' }
const STATUS_COLOR = {
  sent:      { bg: '#f3f4f6', color: '#6b7280' },
  delivered: { bg: '#dbeafe', color: '#1d4ed8' },
  read:      { bg: '#d1fae5', color: '#065f46' },
  failed:    { bg: '#fee2e2', color: '#991b1b' },
  pending:   { bg: '#fef3c7', color: '#92400e' },
}

export default function MensajesPage() {
  const [mensajes, setMensajes]   = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [pages, setPages]         = useState(1)
  const [loading, setLoading]     = useState(true)
  const [busqueda, setBusqueda]   = useState('')
  const [direccion, setDireccion] = useState('')

  const cargar = async (p = page) => {
    setLoading(true)
    try {
      const params = { page: p }
      if (busqueda) params.q = busqueda
      if (direccion) params.direccion = direccion
      const { data } = await axios.get('/whatsapp/api/mensajes/', { params })
      setMensajes(data.mensajes)
      setTotal(data.total)
      setPages(data.pages)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar(1); setPage(1) }, [busqueda, direccion])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: '#f8f9fa' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>
          Mensajes <span style={{ fontSize: '0.85rem', color: '#aaa', fontWeight: 400 }}>({total})</span>
        </h1>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <input
          placeholder="Buscar por teléfono o contenido..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', outline: 'none', width: 280 }}
        />
        <select value={direccion} onChange={e => setDireccion(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', outline: 'none' }}>
          <option value="">Todos</option>
          <option value="outbound">Salientes</option>
          <option value="inbound">Entrantes</option>
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Cargando mensajes...</div>
        ) : mensajes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>No hay mensajes que mostrar.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Contacto', 'Teléfono', 'Dirección', 'Mensaje', 'Campaña', 'Estado', 'Fecha'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mensajes.map(m => {
                const sc = STATUS_COLOR[m.status] || STATUS_COLOR.sent
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f8f9fa' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.83rem' }}>{m.nombre}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#555' }}>+{m.telefono}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                        background: m.direccion === 'outbound' ? '#dcfce7' : '#dbeafe',
                        color: m.direccion === 'outbound' ? '#15803d' : '#1d4ed8'
                      }}>
                        {m.direccion === 'outbound' ? 'Saliente' : 'Entrante'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '0.83rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.contenido}</td>
                    <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: m.campana ? '#333' : '#ccc' }}>{m.campana || '—'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: sc.bg, color: sc.color }}>
                        {STATUS_LABEL[m.status] || m.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '0.78rem', color: '#aaa', whiteSpace: 'nowrap' }}>{m.fecha}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button disabled={page === 1} onClick={() => { setPage(page - 1); cargar(page - 1) }} style={{ padding: '6px 14px', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', background: '#fff' }}>Anterior</button>
          <span style={{ padding: '6px 14px', fontSize: '0.85rem', color: '#555' }}>Página {page} de {pages}</span>
          <button disabled={page === pages} onClick={() => { setPage(page + 1); cargar(page + 1) }} style={{ padding: '6px 14px', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', background: '#fff' }}>Siguiente</button>
        </div>
      )}
    </div>
  )
}
