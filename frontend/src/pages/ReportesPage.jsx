import { useState, useEffect } from 'react'
import axios from '../api/axios'

const ESTADO_LABEL = {
  sent: 'Enviado',
  delivered: 'Entregado',
  read: 'Leído',
  failed: 'Fallido',
  pending: 'Pendiente',
}

const ESTADO_COLOR = {
  sent:      { bg: '#f3f4f6', color: '#6b7280' },
  delivered: { bg: '#dbeafe', color: '#1d4ed8' },
  read:      { bg: '#d1fae5', color: '#065f46' },
  failed:    { bg: '#fee2e2', color: '#991b1b' },
  pending:   { bg: '#fef3c7', color: '#92400e' },
}

function BarraProgreso({ valor, total, color }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '0.75rem', color: '#888', width: 36, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

function GraficaBarras({ datos }) {
  if (!datos || datos.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: '#ccc', fontSize: '0.85rem' }}>
      Sin datos para el periodo seleccionado
    </div>
  )

  const maxVal = Math.max(...datos.map(d => Math.max(d.enviados, d.recibidos)), 1)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, padding: '0 4px' }}>
      {datos.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 130 }}>
            <div style={{
              flex: 1,
              height: `${(d.enviados / maxVal) * 100}%`,
              background: '#6366f1',
              borderRadius: '3px 3px 0 0',
              minHeight: d.enviados > 0 ? 4 : 0,
              transition: 'height 0.3s'
            }} title={`Enviados: ${d.enviados}`} />
            <div style={{
              flex: 1,
              height: `${(d.recibidos / maxVal) * 100}%`,
              background: '#10b981',
              borderRadius: '3px 3px 0 0',
              minHeight: d.recibidos > 0 ? 4 : 0,
              transition: 'height 0.3s'
            }} title={`Recibidos: ${d.recibidos}`} />
          </div>
          <span style={{ fontSize: '0.65rem', color: '#aaa', whiteSpace: 'nowrap' }}>
            {d.dia ? d.dia.slice(5) : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ReportesPage() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [desde, setDesde]       = useState('')
  const [hasta, setHasta]       = useState('')
  const [busqueda, setBusqueda] = useState('')

  const hoy = () => new Date().toISOString().slice(0, 10)
  const hace30 = () => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  }

  const cargar = async (d = desde, h = hasta) => {
    setLoading(true)
    try {
      const params = {}
      if (d) params.desde = d
      if (h) params.hasta = h
      const resp = await axios.get('/whatsapp/api/reportes/', { params })
      setData(resp.data)
    } catch (e) {
      console.error('Error cargando reportes:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const d = hace30()
    const h = hoy()
    setDesde(d)
    setHasta(h)
    cargar(d, h)
  }, [])

  const resumen   = data?.resumen   || {}
  const porDia    = data?.por_dia   || []
  const mensajes  = data?.mensajes  || []
  const totalEnv  = resumen.enviados || 0

  const filtrados = mensajes.filter(m => {
    const texto = busqueda.toLowerCase()
    return (
      m.nombre?.toLowerCase().includes(texto) ||
      m.telefono?.includes(texto) ||
      m.mensaje?.toLowerCase().includes(texto)
    )
  })

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: '#f8f9fa' }}>
      <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#111', marginBottom: 20 }}>
        Reportes de Mensajería
      </h1>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: '0.82rem', color: '#555', fontWeight: 500 }}>Desde</label>
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: '0.82rem', outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: '0.82rem', color: '#555', fontWeight: 500 }}>Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: '0.82rem', outline: 'none' }}
          />
        </div>
        <button
          onClick={() => cargar()}
          style={{
            padding: '7px 22px', background: '#25d366', color: '#fff',
            border: 'none', borderRadius: 7, cursor: 'pointer',
            fontWeight: 600, fontSize: '0.85rem'
          }}
        >
          Filtrar
        </button>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#aaa' }}>
          Cargando datos...
      </div>
      )}

      {!loading && data && (
        <>
          {/* Tarjetas de resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Mensajes enviados', valor: resumen.enviados || 0, sub: `${resumen.recibidos || 0} recibidos`, color: '#6366f1' },
              { label: 'Entregados',        valor: resumen.entregados || 0, color: '#3b82f6' },
              { label: 'Leídos',            valor: resumen.leidos || 0,     color: '#10b981' },
              { label: 'Fallidos',          valor: resumen.fallidos || 0,   color: '#ef4444' },
            ].map((t, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '18px 20px', boxShadow: '0 1px 3px #0001' }}>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: t.color, lineHeight: 1 }}>{t.valor}</div>
                <div style={{ fontSize: '0.78rem', color: '#888', marginTop: 5 }}>{t.label}</div>
                {t.sub && <div style={{ fontSize: '0.72rem', color: '#aaa', marginTop: 2 }}>{t.sub}</div>}
                {totalEnv > 0 && t.label !== 'Mensajes enviados' && (
                  <div style={{ marginTop: 8 }}>
                    <BarraProgreso valor={t.valor} total={totalEnv} color={t.color} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Grafica de actividad */}
          <div style={{ background: '#fff', borderRadius: 10, padding: '20px 24px', boxShadow: '0 1px 3px #0001', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111' }}>Actividad diaria</h2>

              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: '#6366f1' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888' }}>Enviados</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: '#10b981' }} />
                  <span style={{ fontSize: '0.75rem', color: '#888' }}>Recibidos</span>
                </div>
              </div>
            </div>
            <GraficaBarras datos={porDia} />
          </div>

          {/* Tabla de mensajes */}
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px #0001', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111' }}>Mensajes recientes</h2>

              <input
                placeholder="Buscar..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                style={{
                  padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 7,
                  fontSize: '0.82rem', outline: 'none', width: 200, background: '#f9fafb'
                }}
              />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Contacto', 'Teléfono', 'Campaña', 'Mensaje', 'Estado', 'Fecha'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 28, color: '#ccc', fontSize: '0.85rem' }}>
                        Sin resultados
                      </td>
                    </tr>
                  )}
                  {filtrados.map(m => {
                    const est = ESTADO_COLOR[m.status] || { bg: '#f3f4f6', color: '#888' }
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid #f8f9fa' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.83rem' }}>{m.nombre}</td>
                        <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#555' }}>+{m.telefono}</td>
                        <td style={{ padding: '10px 16px', fontSize: '0.83rem', color: m.campana ? '#333' : '#ccc' }}>{m.campana || '—'}</td>

                        <td style={{ padding: '10px 16px', fontSize: '0.83rem', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.mensaje}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                            fontSize: '0.72rem', fontWeight: 700,
                            background: est.bg, color: est.color
                          }}>
                            {ESTADO_LABEL[m.status] || m.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: '0.78rem', color: '#aaa', whiteSpace: 'nowrap' }}>{m.fecha}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
