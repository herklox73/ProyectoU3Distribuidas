import { useState, useEffect, useRef } from 'react'
import axios from '../api/axios'

// Límites de WhatsApp (bytes)
const WA_LIMITS = {
  image:    5  * 1024 * 1024,   // 5 MB
  video:    16 * 1024 * 1024,   // 16 MB
  document: 100 * 1024 * 1024,  // 100 MB
}
const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx'

function mediaType(file) {
  if (!file) return null
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'document'
}

function validarMedia(file) {
  const tipo = mediaType(file)
  const limite = WA_LIMITS[tipo] || WA_LIMITS.document
  if (file.size > limite) {
    const mb = (limite / 1024 / 1024).toFixed(0)
    return `El archivo supera el límite de WhatsApp (${mb} MB para ${tipo})`
  }
  return null
}

const STATUS_LABEL = {
  draft: 'Borrador', scheduled: 'Programada', running: 'En curso',
  completed: 'Completada', cancelled: 'Cancelada'
}
const STATUS_COLOR = {
  draft:     { bg: '#f3f4f6', color: '#6b7280' },
  scheduled: { bg: '#dbeafe', color: '#1d4ed8' },
  running:   { bg: '#fef3c7', color: '#92400e' },
  completed: { bg: '#d1fae5', color: '#065f46' },
  cancelled: { bg: '#fee2e2', color: '#991b1b' },
}

function Modal({ titulo, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, padding: 28, width: 500,
        maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>{titulo}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#888' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function CampanasPage() {
  const [campanas, setCampanas]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [modal, setModal]             = useState(null) // 'crear' | 'editar' | 'progreso'
  const [campanaActual, setCampanaActual] = useState(null)
  const [form, setForm]               = useState({ nombre: '', mensaje: '', target_tags: '', media_url: '' })
  const [mediaFile, setMediaFile]     = useState(null)
  const [mediaError, setMediaError]   = useState('')
  const [mediaActual, setMediaActual] = useState({ url: '', nombre: '' }) // media ya guardada
  const [guardando, setGuardando]     = useState(false)
  const [msg, setMsg]                 = useState('')
  const fileInputRef                  = useRef(null)

  const cargar = async () => {
    try {
      const { data } = await axios.get('/whatsapp/api/campanas/')
      setCampanas(data.campanas)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [])

  // Polling automático para campañas en ejecución
  useEffect(() => {
    const hayEnEjecucion = campanas.some(c => c.progreso?.is_running)
    if (!hayEnEjecucion) return
    const t = setInterval(cargar, 3000)
    return () => clearInterval(t)
  }, [campanas])

  const resetForm = () => {
    setForm({ nombre: '', mensaje: '', target_tags: '', media_url: '' })
    setMediaFile(null)
    setMediaError('')
    setMediaActual({ url: '', nombre: '' })
    setMsg('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const abrirCrear = () => {
    resetForm()
    setModal('crear')
  }

  const abrirEditar = async (c) => {
    const { data } = await axios.get(`/whatsapp/api/campanas/${c.id}/`)
    setForm({ nombre: data.nombre, mensaje: data.mensaje, target_tags: data.target_tags || '', media_url: data.media_url || '' })
    setMediaFile(null)
    setMediaError('')
    setMediaActual({ url: data.media_file_url || '', nombre: data.media_file_name || '' })
    setMsg('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    setCampanaActual(data)
    setModal('editar')
  }

  const onMediaChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const err = validarMedia(file)
    if (err) { setMediaError(err); e.target.value = ''; return }
    setMediaError('')
    setMediaFile(file)
  }

  const guardar = async () => {
    if (!form.nombre.trim() || !form.mensaje.trim()) {
      setMsg('El nombre y el mensaje son obligatorios')
      return
    }
    setGuardando(true)
    try {
      const fd = new FormData()
      fd.append('nombre',     form.nombre.trim())
      fd.append('mensaje',    form.mensaje.trim())
      fd.append('target_tags', form.target_tags.trim())
      fd.append('media_url',  form.media_url.trim())
      if (mediaFile) fd.append('media_file', mediaFile)

      const cfg = { headers: { 'Content-Type': 'multipart/form-data' } }
      if (modal === 'crear') {
        await axios.post('/whatsapp/api/campanas/', fd, cfg)
      } else {
        await axios.put(`/whatsapp/api/campanas/${campanaActual.id}/`, fd, cfg)
      }
      await cargar()
      setModal(null)
    } catch (e) {
      setMsg(e.response?.data?.error || 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (c) => {
    if (!confirm(`¿Eliminar la campaña "${c.nombre}"?`)) return
    await axios.delete(`/whatsapp/api/campanas/${c.id}/`)
    cargar()
  }

  const ejecutar = async (c) => {
    if (!confirm(`¿Ejecutar la campaña "${c.nombre}"?`)) return
    try {
      const { data } = await axios.post(`/whatsapp/api/campanas/${c.id}/ejecutar/`)
      if (data.success) {
        alert(data.message)
        cargar()
      } else {
        alert(data.error)
      }
    } catch (e) {
      alert(e.response?.data?.error || 'Error al ejecutar')
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #e5e7eb',
    borderRadius: 8, fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box'
  }
  const labelStyle = { fontSize: '0.8rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: '#f8f9fa' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>Campañas</h1>
        <button onClick={abrirCrear} style={{
          padding: '9px 22px', background: '#25d366', color: '#fff',
          border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem'
        }}>
          + Nueva campaña
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>Cargando campañas...</div>}

      {!loading && campanas.length === 0 && (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 60 }}>
          <p>No hay campañas creadas.</p>
          <p style={{ fontSize: '0.82rem' }}>Crea una nueva campaña para comenzar.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {campanas.map(c => {
          const sc = STATUS_COLOR[c.status] || STATUS_COLOR.draft
          const p  = c.progreso
          return (
            <div key={c.id} style={{
              background: '#fff', borderRadius: 12, padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              borderLeft: c.progreso?.is_running ? '4px solid #f59e0b' : '4px solid transparent'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{c.nombre}</span>
                    <span style={{
                      padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                      background: sc.bg, color: sc.color
                    }}>{STATUS_LABEL[c.status] || c.status}</span>
                    {c.target_tags && (
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', background: '#f3e8ff', color: '#7c3aed' }}>
                        {c.target_tags}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#888', margin: 0 }}>{c.mensaje}</p>
                  {p && p.total > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem', color: '#555', marginBottom: 5 }}>
                        <span>Total: <strong>{p.total}</strong></span>
                        <span style={{ color: '#10b981' }}>Enviados: <strong>{p.sent}</strong></span>
                        <span style={{ color: '#ef4444' }}>Fallidos: <strong>{p.failed}</strong></span>
                        <span>{p.percent}%</span>
                      </div>
                      <div style={{ height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          width: `${p.percent}%`, height: '100%',
                          background: p.is_running ? '#f59e0b' : '#10b981',
                          borderRadius: 3, transition: 'width 0.3s'
                        }} />
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {c.status !== 'running' && (
                    <button onClick={() => ejecutar(c)} style={{
                      padding: '6px 14px', background: '#6366f1', color: '#fff',
                      border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600
                    }}>Ejecutar</button>
                  )}
                  {c.status !== 'running' && (
                    <button onClick={() => abrirEditar(c)} style={{
                      padding: '6px 14px', background: '#f3f4f6', color: '#374151',
                      border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600
                    }}>Editar</button>
                  )}
                  {c.status !== 'running' && (
                    <button onClick={() => eliminar(c)} style={{
                      padding: '6px 14px', background: '#fee2e2', color: '#991b1b',
                      border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600
                    }}>Eliminar</button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#ccc', marginTop: 8 }}>Creada: {c.created_at}</div>
            </div>
          )
        })}
      </div>

      {(modal === 'crear' || modal === 'editar') && (
        <Modal titulo={modal === 'crear' ? 'Nueva campaña' : 'Editar campaña'} onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Nombre de la campaña</label>
              <input style={inputStyle} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Promo de verano" />
            </div>
            <div>
              <label style={labelStyle}>Mensaje — usa {'{{nombre}}'} para personalizar</label>
              <textarea
                style={{ ...inputStyle, height: 120, resize: 'vertical', fontFamily: 'inherit' }}
                value={form.mensaje}
                onChange={e => setForm({ ...form, mensaje: e.target.value })}
                placeholder="Hola {{nombre}}, tenemos una oferta especial para ti..."
              />
              <div style={{ fontSize: '0.72rem', color: '#aaa', marginTop: 3 }}>
                {form.mensaje.length} / 4096 caracteres
              </div>
            </div>
            <div>
              <label style={labelStyle}>Filtrar por etiqueta (opcional)</label>
              <input style={inputStyle} value={form.target_tags} onChange={e => setForm({ ...form, target_tags: e.target.value })} placeholder="Ej: cliente — vacío = enviar a todos" />
            </div>
            {/* Media */}
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', background: '#fafafa' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', margin: '0 0 10px' }}>Media (Imagen / Video / Documento) — opcional</p>

              {/* Archivo ya guardado */}
              {mediaActual.url && !mediaFile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '8px 12px', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.82rem', color: '#065f46', fontWeight: 600 }}>✓ Archivo actual:</span>
                  <a href={mediaActual.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: '#059669', textDecoration: 'underline', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mediaActual.nombre || mediaActual.url}
                  </a>
                  <button onClick={() => setMediaActual({ url: '', nombre: '' })} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>✕</button>
                </div>
              )}

              {/* Subir archivo */}
              <label style={{ ...labelStyle, marginBottom: 6 }}>Subir archivo {mediaActual.url && !mediaFile ? '(reemplazar)' : ''}</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed #c4b5fd', borderRadius: 8, padding: '16px', textAlign: 'center',
                  cursor: 'pointer', background: '#f5f3ff', marginBottom: 10
                }}
              >
                {mediaFile ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.82rem', color: '#7c3aed', fontWeight: 600 }}>{mediaFile.name}</span>
                    <span style={{ fontSize: '0.72rem', color: '#aaa' }}>({(mediaFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                    <button
                      onClick={e => { e.stopPropagation(); setMediaFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}
                    >✕</button>
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: '1.4rem' }}>📎</span>
                    <p style={{ fontSize: '0.78rem', color: '#7c3aed', fontWeight: 600, margin: '4px 0 2px' }}>Haz clic para seleccionar archivo</p>
                    <p style={{ fontSize: '0.7rem', color: '#aaa', margin: 0 }}>Imagen (JPG/PNG/WEBP) · Video (MP4) · Doc (PDF/Word) — máx. 5/16/100 MB</p>
                  </>
                )}
                <input ref={fileInputRef} type="file" accept={MEDIA_ACCEPT} onChange={onMediaChange} style={{ display: 'none' }} />
              </div>
              {mediaError && <div style={{ fontSize: '0.78rem', color: '#ef4444', marginBottom: 8 }}>{mediaError}</div>}

              {/* O URL */}
              <label style={labelStyle}>O pega una URL pública</label>
              <input style={inputStyle} value={form.media_url} onChange={e => setForm({ ...form, media_url: e.target.value })} placeholder="https://..." />
              <p style={{ fontSize: '0.7rem', color: '#aaa', margin: '4px 0 0' }}>Si subes archivo, tiene prioridad sobre la URL.</p>
            </div>

            {msg && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 7, fontSize: '0.82rem' }}>{msg}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { setModal(null); resetForm() }} style={{ padding: '9px 20px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{ padding: '9px 22px', background: '#25d366', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
