import { useState, useEffect } from 'react'
import { sileo } from 'sileo'
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
  const [seleccion, setSeleccion] = useState(new Set())
  const [eliminando, setEliminando] = useState(false)

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

  useEffect(() => { cargar(1); setPage(1); setSeleccion(new Set()) }, [busqueda, direccion])

  const toggleSeleccion = (id) => setSeleccion(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleTodos = () => {
    const ids = new Set(mensajes.map(m => m.id))
    const todosSel = mensajes.length > 0 && mensajes.every(m => seleccion.has(m.id))
    setSeleccion(prev => { const n = new Set(prev); todosSel ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id)); return n })
  }

  const eliminarSeleccionados = async () => {
    if (!seleccion.size) return
    const cantidad = seleccion.size
    setEliminando(true)
    try {
      await axios.post('/whatsapp/api/mensajes/bulk-delete/', { ids: [...seleccion] })
      sileo.success({ title: `${cantidad} mensaje${cantidad > 1 ? 's eliminados' : ' eliminado'}` })
      setSeleccion(new Set())
      cargar(page)
    } catch (e) {
      sileo.error({ title: 'Error al eliminar', description: e.response?.data?.error || 'Error desconocido' })
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: '#f8f9fa' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>
          Mensajes <span style={{ fontSize: '0.85rem', color: '#aaa', fontWeight: 400 }}>({total})</span>
        </h1>
        <button
          onClick={() => {
            if (seleccion.size === 0) {
              sileo.info({ title: 'Selecciona mensajes', description: 'Marca los checkboxes primero' })
              return
            }
            eliminarSeleccionados()
          }}
          disabled={eliminando}
          style={{
            padding: '8px 18px',
            background: seleccion.size > 0 ? '#ef4444' : '#f3f4f6',
            color: seleccion.size > 0 ? '#fff' : '#9ca3af',
            border: 'none', borderRadius: 8,
            cursor: eliminando ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: '0.85rem',
            display: 'flex', alignItems: 'center', gap: 7,
            transition: 'background 0.2s, color 0.2s',
            opacity: eliminando ? 0.7 : 1,
          }}
        >
          {eliminando ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Eliminando...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
              {seleccion.size > 0 ? `Eliminar ${seleccion.size} seleccionado${seleccion.size > 1 ? 's' : ''}` : 'Eliminar seleccionados'}
            </>
          )}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 10px', background: '#f9fafb', borderRight: '1px solid #e5e7eb', fontSize: '0.82rem', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', userSelect: 'none' }}>
            <span>🇪🇨</span>
            <span>+593</span>
          </div>
          <input
            placeholder="Buscar por teléfono o contenido..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ padding: '8px 12px', border: 'none', outline: 'none', fontSize: '0.85rem', width: 240 }}
          />
        </div>
        <select value={direccion} onChange={e => setDireccion(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', outline: 'none' }}>
          <option value="">Todos</option>
          <option value="outbound">Salientes</option>
          <option value="inbound">Entrantes</option>
        </select>
      </div>

      {seleccion.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '8px 16px', marginBottom: 12, fontSize: '0.82rem', color: '#991b1b', fontWeight: 600 }}>
          {seleccion.size} mensaje{seleccion.size > 1 ? 's' : ''} seleccionado{seleccion.size > 1 ? 's' : ''}
          <button onClick={() => setSeleccion(new Set())} style={{ marginLeft: 8, padding: '4px 12px', background: 'transparent', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem' }}>
            Cancelar selección
          </button>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Cargando mensajes...</div>
        ) : mensajes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>No hay mensajes que mostrar.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '10px 14px', width: 36 }}>
                  <input type="checkbox"
                    checked={mensajes.length > 0 && mensajes.every(m => seleccion.has(m.id))}
                    onChange={toggleTodos}
                    style={{ width: 15, height: 15, accentColor: '#ef4444', cursor: 'pointer' }} />
                </th>
                {['Contacto', 'Teléfono', 'Dirección', 'Mensaje', 'Campaña', 'Estado', 'Fecha'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mensajes.map(m => {
                const sc = STATUS_COLOR[m.status] || STATUS_COLOR.sent
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f8f9fa', background: seleccion.has(m.id) ? '#fff1f2' : 'transparent' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <input type="checkbox" checked={seleccion.has(m.id)} onChange={() => toggleSeleccion(m.id)}
                        style={{ width: 15, height: 15, accentColor: '#ef4444', cursor: 'pointer' }} />
                    </td>
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
