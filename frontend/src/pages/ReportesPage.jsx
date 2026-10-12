import { useState, useEffect } from 'react'
import axios from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { formatearTelefono } from '../utils/telefono'
import { IconoExcel, IconoPDF, Girando } from '../components/reportes/IconosArchivo'
import { ActividadDiaria, DonaEstados, Embudo, PorHora, TablaCampanas } from '../components/reportes/Graficos'

const ESTADO_LABEL = {
  sent: 'Enviado',
  delivered: 'Entregado',
  read: 'Leído',
  failed: 'Fallido',
  pending: 'Pendiente',
}

// Mismos colores que los gráficos (ver components/reportes/Graficos.jsx)
const ESTADO_COLOR = {
  pending:   { bg: '#f0efec', color: '#52514e' },
  sent:      { bg: '#e6f0fc', color: '#1c5cab' },
  delivered: { bg: '#cde2fb', color: '#184f95' },
  read:      { bg: '#104281', color: '#ffffff' },
  failed:    { bg: '#fde7e7', color: '#b42318' },
}

const card = { background: '#fff', borderRadius: 12, padding: '20px 22px', boxShadow: '0 1px 3px #0001' }
const tituloCard = { fontSize: '0.95rem', fontWeight: 600, color: '#111', margin: 0 }
const subCard = { fontSize: '0.76rem', color: '#8a8983', marginTop: 3 }

function Tarjeta({ titulo, sub, children, style }) {
  return (
    <section style={{ ...card, ...style }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={tituloCard}>{titulo}</h2>
        {sub && <div style={subCard}>{sub}</div>}
      </div>
      {children}
    </section>
  )
}

function Indicador({ valor, label, detalle, pct, color }) {
  return (
    <div style={{ ...card, padding: '18px 20px' }}>
      <div style={{ fontSize: '1.9rem', fontWeight: 700, color: '#0b0b0b', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {Number(valor || 0).toLocaleString('es-EC')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#52514e', marginTop: 6 }}>
        {color && <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />}
        {label}
      </div>
      {pct !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <div style={{ flex: 1, height: 5, background: '#f0efec', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .4s' }} />
          </div>
          <span style={{ fontSize: '0.74rem', color: '#52514e', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
        </div>
      )}
      {detalle && <div style={{ fontSize: '0.72rem', color: '#8a8983', marginTop: 6 }}>{detalle}</div>}
    </div>
  )
}

function mejorHora(porHora) {
  const total = porHora.reduce((a, h) => a + h.enviados, 0)
  const minimo = Math.max(3, total * 0.05)
  const candidatas = porHora.filter(h => h.enviados >= minimo)
  if (!candidatas.length) return null
  return candidatas.reduce((m, h) => (h.tasa_lectura > m.tasa_lectura ? h : m))
}

export default function ReportesPage() {
  // El administrador puede ver el reporte de cualquier usuario o de todos
  const { user } = useAuth()
  const esAdmin = Boolean(user?.isStaff)
  const [verUsuario, setVerUsuario] = useState('')     // '' = el mío, 'todos' o id
  const [usuarios, setUsuarios]     = useState([])
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [desde, setDesde]       = useState('')
  const [hasta, setHasta]       = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [descargando, setDescargando] = useState('')
  const [errorDescarga, setErrorDescarga] = useState('')

  // Fecha local (toISOString daría la fecha en UTC: después de las 19:00 en
  // Ecuador ya marcaría el día siguiente)
  const fechaLocal = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const hoy = () => fechaLocal(new Date())
  const hace30 = () => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return fechaLocal(d)
  }

  useEffect(() => {
    if (!esAdmin) return
    axios.get('/whatsapp/api/usuarios-contactos/')
      .then(({ data }) => setUsuarios(data.usuarios || []))
      .catch(() => setUsuarios([]))
  }, [esAdmin])

  const cargar = async (d = desde, h = hasta, u = verUsuario) => {
    setLoading(true)
    try {
      const params = {}
      if (d) params.desde = d
      if (h) params.hasta = h
      if (esAdmin && u) params.usuario = u
      const resp = await axios.get('/whatsapp/api/reportes/', { params })
      setData(resp.data)
    } catch (e) {
      console.error('Error cargando reportes:', e)
    } finally {
      setLoading(false)
    }
  }

  // El archivo se genera en el servidor en ese momento y llega directo al
  // navegador: no se guarda en ningún lado.
  const descargar = async (tipo) => {
    setDescargando(tipo)
    setErrorDescarga('')
    try {
      const params = {}
      if (desde) params.desde = desde
      if (hasta) params.hasta = hasta
      if (esAdmin && verUsuario) params.usuario = verUsuario
      const resp = await axios.get(`/whatsapp/api/reportes/${tipo}/`, { params, responseType: 'blob' })
      const ext = tipo === 'excel' ? 'xlsx' : 'pdf'
      const url = URL.createObjectURL(resp.data)
      const a = document.createElement('a')
      a.href = url
      a.download = /filename="([^"]+)"/.exec(resp.headers['content-disposition'] || '')?.[1]
        || `reporte_masssend_${desde || 'inicio'}_${hasta || 'hoy'}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      console.error('Error al descargar:', e)
      setErrorDescarga('No se pudo generar el archivo. Intenta de nuevo.')
    } finally {
      setDescargando('')
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
  const porEstado = data?.por_estado || []
  const porHora   = data?.por_hora  || []
  const porCampana = data?.por_campana || []
  const hora      = mejorHora(porHora)
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#111', margin: 0 }}>Reportes de Mensajería</h1>
          <div style={{ fontSize: '0.8rem', color: '#8a8983', marginTop: 4 }}>
            {esAdmin && verUsuario
              ? <>Viendo: <b style={{ color: '#0b0b0b' }}>{data?.alcance || '…'}</b></>
              : 'Estados de entrega, lectura y rendimiento de tus envíos'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { tipo: 'pdf', label: 'PDF', color: '#d93025', Icono: IconoPDF },
            { tipo: 'excel', label: 'Excel', color: '#1d7f45', Icono: IconoExcel },
          ].map(({ tipo, label, color, Icono }) => (
            <button key={tipo} className="btn-descarga" title={`Descargar ${label}`} aria-label={`Descargar ${label}`} onClick={() => descargar(tipo)} disabled={!!descargando}
              style={{
                '--acento': color,
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '7px 16px 7px 10px', background: '#fff', color: '#0b0b0b',
                border: '1px solid #e4e3df', borderRadius: 10, textAlign: 'left',
                cursor: descargando ? 'wait' : 'pointer',
                opacity: descargando && descargando !== tipo ? 0.5 : 1,
              }}>
              {descargando === tipo ? <Girando color={color} /> : <Icono />}
              <span style={{ fontWeight: 600, fontSize: '0.86rem' }}>{label}</span>
            </button>
          ))}
          <style>{`
            .btn-descarga { transition: border-color .15s, box-shadow .15s, transform .15s; box-shadow: 0 1px 2px #0000000d; }
            .btn-descarga:not(:disabled):hover { border-color: var(--acento); box-shadow: 0 4px 14px #00000014; transform: translateY(-1px); }
            .btn-descarga:not(:disabled):active { transform: translateY(0); }
            .btn-descarga:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }
          `}</style>
        </div>
      </div>
      {errorDescarga && (
        <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: '#fde7e7', color: '#b42318', fontSize: '0.8rem' }}>
          {errorDescarga}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        {esAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title="Solo administradores">
            <label style={{ fontSize: '0.82rem', color: '#555', fontWeight: 500 }}>Usuario</label>
            <select value={verUsuario} onChange={e => { setVerUsuario(e.target.value); cargar(desde, hasta, e.target.value) }}
              style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: '0.82rem', outline: 'none', maxWidth: 260, background: '#fff' }}>
              <option value="">Mis reportes</option>
              <option value="todos">Todos los usuarios</option>
              {usuarios.filter(u => u.usuario !== user?.username).map(u => (
                <option key={u.id} value={u.id}>{u.usuario}{u.admin ? ' (admin)' : ''}</option>
              ))}
            </select>
          </div>
        )}
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
          {/* Indicadores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 18 }}>
            <Indicador valor={resumen.enviados} label="Mensajes enviados" detalle={`${resumen.recibidos || 0} recibidos`} />
            <Indicador valor={resumen.entregados} label="Entregados" pct={resumen.tasa_entrega} color="#2a78d6" detalle="Incluye los leídos" />
            <Indicador valor={resumen.leidos} label="Leídos" pct={resumen.tasa_lectura} color="#104281"
              detalle={totalEnv ? `${resumen.tasa_lectura_entregados}% de los entregados` : null} />
            <Indicador valor={resumen.fallidos} label="Fallidos" pct={resumen.tasa_fallo} color="#d03b3b" />
          </div>

          {/* Estado + embudo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, marginBottom: 18 }}>
            <Tarjeta titulo="Mensajes por estado" sub="Estado actual de cada mensaje enviado">
              <DonaEstados porEstado={porEstado} total={totalEnv} />
            </Tarjeta>
            <Tarjeta titulo="Embudo de entrega" sub="Cuántos mensajes avanzan en cada etapa">
              <Embudo resumen={resumen} />
            </Tarjeta>
          </div>

          <Tarjeta titulo="Actividad diaria" sub="Mensajes enviados por día, separados por estado" style={{ marginBottom: 18 }}>
            <ActividadDiaria porDia={porDia} />
            {totalEnv > 0 && (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
                {[['read', 'Leído', '#104281'], ['delivered', 'Entregado', '#2a78d6'], ['sent', 'Enviado', '#86b6ef'], ['pending', 'Pendiente', '#a3a29b'], ['failed', 'Fallido', '#d03b3b']].map(([k, l, c]) => (
                  <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#52514e' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: c }} />{l}
                  </span>
                ))}
              </div>
            )}
          </Tarjeta>

          <Tarjeta style={{ marginBottom: 18 }} titulo="Envíos por hora del día"
            sub={hora ? `Mejor hora para escribir: ${String(hora.hora).padStart(2, '0')}:00, con ${hora.tasa_lectura}% de lectura` : 'Pasa el cursor por una barra para ver su tasa de lectura'}>
            <PorHora porHora={porHora} />
          </Tarjeta>
          {data?.por_usuario?.length > 0 && (
            <Tarjeta style={{ marginBottom: 18 }} titulo="Rendimiento por usuario" sub="Cómo le va a cada usuario con sus envíos en este periodo">
              <TablaCampanas porCampana={data.por_usuario} titulo="Usuario" campo="usuario" />
            </Tarjeta>
          )}
          <Tarjeta style={{ marginBottom: 18 }} titulo="Rendimiento por campaña" sub="Porcentaje de entrega y lectura sobre lo enviado">
            <TablaCampanas porCampana={porCampana} />
          </Tarjeta>

          {/* Tabla de mensajes */}
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px #0001', overflow: 'hidden' }}>
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
                    {['Contacto', 'Teléfono', 'Campaña', 'Mensaje', 'Estado', 'Fecha', ...(verUsuario === 'todos' ? ['Usuario'] : [])].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.length === 0 && (
                    <tr>
                      <td colSpan={verUsuario === 'todos' ? 7 : 6} style={{ textAlign: 'center', padding: 28, color: '#ccc', fontSize: '0.85rem' }}>
                        Sin resultados
                      </td>
                    </tr>
                  )}
                  {filtrados.map(m => {
                    const est = ESTADO_COLOR[m.status] || { bg: '#f3f4f6', color: '#888' }
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid #f8f9fa' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.83rem' }}>{m.nombre}</td>
                        <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: '#4b5563', whiteSpace: 'nowrap' }}>{formatearTelefono(m.telefono)}</td>
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
                        {verUsuario === 'todos' && (
                          <td style={{ padding: '10px 16px', fontSize: '0.78rem', color: '#52514e', whiteSpace: 'nowrap' }}>{m.usuario}</td>
                        )}
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
