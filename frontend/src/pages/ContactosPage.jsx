import { useState, useEffect, useRef, useCallback } from 'react'
import axios from '../api/axios'

// ── Validación de teléfono (igual que en ImportarContactosPage) ────────────
function normalizarTelefono(raw) {
  if (!raw) return { ok: false, tel: '', err: 'Teléfono vacío' }
  let s = String(raw).trim()
  if (/[Ee][+\-]?\d/.test(s)) return { ok: false, tel: '', err: 'Número en notación científica' }
  let limpio = s.replace(/[^\d+]/g, '')
  if (limpio.startsWith('+')) limpio = limpio.slice(1)
  if (!/^\d+$/.test(limpio)) return { ok: false, tel: '', err: 'Caracteres inválidos' }
  if (/^0\d{7,9}$/.test(limpio)) {
    const sinCero = limpio.slice(1)
    if (!sinCero.startsWith('9')) return { ok: false, tel: '', err: 'Número fijo — no recibe WhatsApp' }
    limpio = '593' + sinCero
  }
  if (limpio.startsWith('593')) {
    if (!limpio.startsWith('5939')) return { ok: false, tel: '', err: 'Número fijo de Ecuador' }
    if (limpio.length !== 12) return { ok: false, tel: '', err: `Móvil Ecuador inválido: ${limpio.length} dígitos` }
    return { ok: true, tel: limpio, err: null }
  }
  if (limpio.length < 11) return { ok: false, tel: '', err: `Muy corto (${limpio.length} dígitos)` }
  if (limpio.length > 15) return { ok: false, tel: '', err: `Muy largo (${limpio.length} dígitos)` }
  return { ok: true, tel: limpio, err: null }
}

function parseCSV(texto, sep) {
  const lineas = texto.split(/\r?\n/).filter(l => l.trim())
  if (!lineas.length) return { headers: [], rows: [] }
  const parse = (l) => {
    const res = []; let cur = ''; let inQ = false
    for (let i = 0; i < l.length; i++) {
      const c = l[i]
      if (c === '"') { inQ = !inQ }
      else if (c === sep && !inQ) { res.push(cur.trim()); cur = '' }
      else cur += c
    }
    res.push(cur.trim())
    return res
  }
  const headers = parse(lineas[0])
  const rows = lineas.slice(1).map((l, i) => ({ _i: i, cells: parse(l) })).filter(r => r.cells.some(c => c))
  return { headers, rows }
}

function autoMap(headers) {
  const map = {}
  const norm = h => h.toLowerCase().replace(/[^a-z0-9]/g, '')
  headers.forEach((h, i) => {
    const n = norm(h)
    if (['telefono','phone','tel','celular','movil','mobile','homephone','phonenumber'].some(k => n.includes(k))) map[i] = 'telefono'
    else if (['nombre','name','rawname','fullname'].some(k => n.includes(k))) map[i] = map[i] || 'nombre'
    else if (['etiqueta','tag','label','categoria'].some(k => n.includes(k))) map[i] = map[i] || 'etiquetas'
    else if (['nota','note','obs','comment'].some(k => n.includes(k))) map[i] = map[i] || 'notas'
    else map[i] = ''
  })
  return map
}

const CSV_CAMPOS = [
  { value: '', label: 'No importar' },
  { value: 'telefono', label: 'Telefono (requerido)' },
  { value: 'nombre', label: 'Nombre' },
  { value: 'etiquetas', label: 'Etiquetas' },
  { value: 'notas', label: 'Notas' },
]

export default function ContactosPage() {
  const [contactos, setContactos]   = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [pages, setPages]           = useState(1)
  const [loading, setLoading]       = useState(true)
  const [busqueda, setBusqueda]     = useState('')
  const [tagFiltro, setTagFiltro]   = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [tagsDisponibles, setTagsDisponibles] = useState([])
  const [seleccion, setSeleccion]   = useState(new Set())  // IDs seleccionados
  const [modal, setModal]           = useState(null) // 'crear' | 'importar' | 'csv-preview'
  const [form, setForm]             = useState({ telefono: '', nombre: '', tags: '' })
  const [guardando, setGuardando]   = useState(false)
  const [msg, setMsg]               = useState('')
  // CSV import state
  const [csvArchivo, setCsvArchivo]     = useState(null)
  const [csvSep, setCsvSep]             = useState(',')
  const [csvParsed, setCsvParsed]       = useState(null)
  const [csvMapeo, setCsvMapeo]         = useState({})
  const [csvSel, setCsvSel]             = useState(new Set())
  const [csvDragging, setCsvDragging]   = useState(false)
  const [importResult, setImportResult] = useState(null)
  const csvInputRef                     = useRef(null)

  const cargar = async (p = page) => {
    setLoading(true)
    try {
      const params = { page: p }
      if (busqueda) params.q = busqueda
      if (tagFiltro) params.tag = tagFiltro
      if (estadoFiltro) params.estado = estadoFiltro
      const { data } = await axios.get('/whatsapp/api/contactos/', { params })
      setContactos(data.contactos)
      setTotal(data.total)
      setPages(data.pages)
      setTagsDisponibles(data.tags_disponibles || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar(1); setPage(1) }, [busqueda, tagFiltro, estadoFiltro])

  // Limpiar selección al cambiar de página/filtro
  useEffect(() => { setSeleccion(new Set()) }, [busqueda, tagFiltro, estadoFiltro, page])

  const toggleSeleccion = (id) => setSeleccion(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleTodos = () => {
    const ids = new Set(contactos.map(c => c.id))
    const todosSel = contactos.every(c => seleccion.has(c.id))
    setSeleccion(prev => { const n = new Set(prev); todosSel ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id)); return n })
  }
  const eliminarSeleccionados = async () => {
    if (!seleccion.size) return
    if (!confirm(`¿Eliminar ${seleccion.size} contacto${seleccion.size > 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return
    try {
      await axios.post('/whatsapp/api/contactos/bulk-delete/', { ids: [...seleccion] })
      setSeleccion(new Set())
      cargar(page)
    } catch (e) { alert(e.response?.data?.error || 'Error al eliminar') }
  }

  const toggleOptout = async (c) => {
    await axios.put(`/whatsapp/api/contactos/${c.id}/`, { is_opted_out: !c.is_opted_out })
    cargar(page)
  }

  const eliminar = async (c) => {
    if (!confirm(`¿Eliminar a ${c.nombre || c.telefono}?`)) return
    await axios.delete(`/whatsapp/api/contactos/${c.id}/`)
    cargar(page)
  }

  const guardarContacto = async () => {
    if (!form.telefono.trim()) { setMsg('El teléfono es obligatorio'); return }
    setGuardando(true)
    try {
      await axios.post('/whatsapp/api/contactos/', form)
      setModal(null)
      cargar(page)
    } catch (e) {
      setMsg(e.response?.data?.error || 'Error al guardar')
    } finally { setGuardando(false) }
  }

  const procesarCsvArchivo = useCallback((file, sep) => {
    if (!file) return
    setCsvArchivo(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      const { headers, rows } = parseCSV(e.target.result, sep)
      const m = autoMap(headers)
      setCsvMapeo(m)
      setCsvParsed({ headers, rows })
      setCsvSel(new Set(rows.map(r => r._i)))
      setModal('csv-preview')
    }
    reader.readAsText(file, 'utf-8')
  }, [])

  const csvFilasVistas = csvParsed ? csvParsed.rows.map(r => {
    const get = (campo) => {
      const idx = Object.entries(csvMapeo).find(([, v]) => v === campo)?.[0]
      return idx != null ? (r.cells[idx] || '') : ''
    }
    const rawTel = get('telefono')
    const { ok, tel, err } = rawTel ? normalizarTelefono(rawTel) : { ok: false, tel: '', err: 'Sin columna teléfono' }
    return { _i: r._i, cells: r.cells, telefono: ok ? tel : rawTel, nombre: get('nombre'), etiquetas: get('etiquetas'), notas: get('notas'), telOk: ok, telErr: err }
  }) : []

  const csvFilasValidas   = csvFilasVistas.filter(r => r.telOk)
  const csvFilasInvalidas = csvFilasVistas.filter(r => !r.telOk)
  const csvSelValidas     = csvFilasValidas.filter(r => csvSel.has(r._i))
  const csvTelAsignada    = Object.values(csvMapeo).includes('telefono')

  const csvToggleRow = (i) => setCsvSel(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  const csvToggleAll = () => {
    const ids = new Set(csvFilasValidas.map(r => r._i))
    const todos = csvFilasValidas.every(r => csvSel.has(r._i))
    setCsvSel(prev => { const n = new Set(prev); todos ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id)); return n })
  }

  const importarCSV = async () => {
    if (!csvSelValidas.length) return
    setGuardando(true)
    try {
      const contactos = csvSelValidas.map(r => ({ telefono: r.telefono, nombre: r.nombre, etiquetas: r.etiquetas, notas: r.notas }))
      const { data } = await axios.post('/whatsapp/api/contactos/importar/', { contactos })
      setImportResult(data)
      setModal('importar')  // volver al panel de resultado
      setCsvArchivo(null); setCsvParsed(null)
      if (csvInputRef.current) csvInputRef.current.value = ''
      cargar(1)
    } catch (e) {
      alert(e.response?.data?.error || 'Error al importar')
    } finally { setGuardando(false) }
  }

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { fontSize: '0.8rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: '#f8f9fa' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>
          Contactos <span style={{ fontSize: '0.85rem', color: '#aaa', fontWeight: 400 }}>({total})</span>
        </h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setModal('importar'); setMsg(''); setImportResult(null); setCsvArchivo(null); setCsvParsed(null) }} style={{ padding: '8px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
            Importar CSV
          </button>
          <button onClick={() => { setModal('crear'); setForm({ telefono: '', nombre: '', tags: '' }); setMsg('') }} style={{ padding: '8px 18px', background: '#25d366', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
            + Agregar contacto
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          placeholder="Buscar por nombre o teléfono..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', outline: 'none', width: 250 }}
        />
        <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', outline: 'none' }}>
          <option value="">Todos</option>
          <option value="activo">Solo activos</option>
          <option value="optout">Opt-out</option>
        </select>
        <select value={tagFiltro} onChange={e => setTagFiltro(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', outline: 'none' }}>
          <option value="">Todas las etiquetas</option>
          {tagsDisponibles.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Barra de selección masiva */}
      {seleccion.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#eef2ff', border: '1px solid #a5b4fc', borderRadius: 10, padding: '10px 16px', marginBottom: 12 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4338ca' }}>
            {seleccion.size} contacto{seleccion.size > 1 ? 's' : ''} seleccionado{seleccion.size > 1 ? 's' : ''}
          </span>
          <button onClick={eliminarSeleccionados} style={{ padding: '6px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
            🗑 Eliminar seleccionados
          </button>
          <button onClick={() => setSeleccion(new Set())} style={{ padding: '6px 14px', background: 'transparent', color: '#6366f1', border: '1px solid #a5b4fc', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>
            Cancelar selección
          </button>
        </div>
      )}

      {/* Tabla */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Cargando contactos...</div>
        ) : contactos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>
            <p>No hay contactos que mostrar.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '10px 14px', width: 36 }}>
                  <input type="checkbox"
                    checked={contactos.length > 0 && contactos.every(c => seleccion.has(c.id))}
                    onChange={toggleTodos}
                    style={{ width: 15, height: 15, accentColor: '#6366f1', cursor: 'pointer' }} />
                </th>
                {['Nombre', 'Teléfono', 'Etiquetas', 'Estado', 'Fecha', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contactos.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f8f9fa', background: seleccion.has(c.id) ? '#eef2ff' : 'transparent' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <input type="checkbox" checked={seleccion.has(c.id)} onChange={() => toggleSeleccion(c.id)}
                      style={{ width: 15, height: 15, accentColor: '#6366f1', cursor: 'pointer' }} />
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: '0.85rem' }}>{c.nombre || '—'}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.82rem', color: '#555' }}>+{c.telefono}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {c.tags ? c.tags.split(',').map(t => (
                      <span key={t} style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 20, fontSize: '0.7rem', background: '#f3e8ff', color: '#7c3aed', marginRight: 3 }}>
                        {t.trim()}
                      </span>
                    )) : <span style={{ color: '#ddd', fontSize: '0.78rem' }}>Sin etiqueta</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                      background: c.is_opted_out ? '#fee2e2' : '#d1fae5',
                      color: c.is_opted_out ? '#991b1b' : '#065f46'
                    }}>
                      {c.is_opted_out ? 'Opt-out' : 'Activo'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#aaa' }}>{c.created_at}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => toggleOptout(c)} style={{
                        padding: '4px 10px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                        border: 'none', borderRadius: 6,
                        background: c.is_opted_out ? '#d1fae5' : '#fef3c7',
                        color: c.is_opted_out ? '#065f46' : '#92400e'
                      }}>
                        {c.is_opted_out ? 'Activar' : 'Opt-out'}
                      </button>
                      <button onClick={() => eliminar(c)} style={{ padding: '4px 10px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', border: 'none', borderRadius: 6, background: '#fee2e2', color: '#991b1b' }}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button disabled={page === 1} onClick={() => { setPage(page - 1); cargar(page - 1) }} style={{ padding: '6px 14px', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', background: '#fff' }}>Anterior</button>
          <span style={{ padding: '6px 14px', fontSize: '0.85rem', color: '#555' }}>Página {page} de {pages}</span>
          <button disabled={page === pages} onClick={() => { setPage(page + 1); cargar(page + 1) }} style={{ padding: '6px 14px', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', background: '#fff' }}>Siguiente</button>
        </div>
      )}

      {/* Modal crear contacto */}
      {modal === 'crear' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Agregar contacto</h2>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#888' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Teléfono (con código de país, sin +)</label>
                <input style={inputStyle} value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} placeholder="5930000000000" />
              </div>
              <div>
                <label style={labelStyle}>Nombre (opcional)</label>
                <input style={inputStyle} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre completo" />
              </div>
              <div>
                <label style={labelStyle}>Etiquetas (opcional, separadas por coma)</label>
                <input style={inputStyle} value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="cliente, lead" />
              </div>
              {msg && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 7, fontSize: '0.82rem' }}>{msg}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setModal(null)} style={{ padding: '9px 20px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                <button onClick={guardarContacto} disabled={guardando} style={{ padding: '9px 22px', background: '#25d366', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal importar CSV — subida de archivo */}
      {modal === 'importar' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 480, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Importar contactos desde CSV</h2>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#888' }}>✕</button>
            </div>

            {importResult ? (
              <div>
                <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
                  <p style={{ fontWeight: 700, color: '#065f46', marginBottom: 6 }}>Importación completada</p>
                  <div style={{ display: 'flex', gap: 20, fontSize: '0.85rem' }}>
                    <span>Total: <strong>{importResult.total}</strong></span>
                    <span style={{ color: '#10b981' }}>Creados: <strong>{importResult.creados}</strong></span>
                    <span style={{ color: '#3b82f6' }}>Actualizados: <strong>{importResult.actualizados}</strong></span>
                    <span style={{ color: '#ef4444' }}>Errores: <strong>{importResult.errores}</strong></span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setImportResult(null); setCsvArchivo(null); setCsvParsed(null) }} style={{ padding: '9px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Importar otro</button>
                  <button onClick={() => setModal(null)} style={{ padding: '9px 20px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cerrar</button>
                </div>
              </div>
            ) : (
              <>
                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setCsvDragging(true) }}
                  onDragLeave={() => setCsvDragging(false)}
                  onDrop={e => { e.preventDefault(); setCsvDragging(false); procesarCsvArchivo(e.dataTransfer.files[0], csvSep) }}
                  onClick={() => csvInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${csvDragging ? '#6366f1' : '#c7d2fe'}`,
                    borderRadius: 10, padding: '28px 20px', textAlign: 'center',
                    background: csvDragging ? '#eef2ff' : '#f5f3ff',
                    cursor: 'pointer', marginBottom: 16, transition: 'all 0.2s'
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" style={{ margin: '0 auto 8px', display: 'block' }}>
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <p style={{ color: '#6366f1', fontWeight: 600, margin: '0 0 4px', fontSize: '0.9rem' }}>
                    {csvArchivo ? csvArchivo.name : 'Arrastra tu CSV aquí o haz clic'}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: '#aaa', margin: 0 }}>Formatos: .csv — máximo 5MB</p>
                  <input ref={csvInputRef} type="file" accept=".csv,.txt" onChange={e => procesarCsvArchivo(e.target.files[0], csvSep)} style={{ display: 'none' }} />
                </div>

                {/* Separador */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Separador</label>
                  <select value={csvSep} onChange={e => { setCsvSep(e.target.value); if (csvArchivo) procesarCsvArchivo(csvArchivo, e.target.value) }}
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.82rem', outline: 'none' }}>
                    <option value=",">Coma ( , )</option>
                    <option value=";">Punto y coma ( ; )</option>
                    <option value={'\t'}>Tabulación</option>
                  </select>
                </div>

                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', fontSize: '0.75rem', color: '#92400e', marginBottom: 16 }}>
                  ⚠ Solo se importan móviles. Los números fijos (02, 03…) serán rechazados.
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setModal(null)} style={{ padding: '9px 20px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
                  <button onClick={() => csvArchivo && setModal('csv-preview')} disabled={!csvArchivo}
                    style={{ padding: '9px 22px', background: !csvArchivo ? '#9ca3af' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: !csvArchivo ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                    Vista previa →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal vista previa CSV */}
      {modal === 'csv-preview' && csvParsed && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 860, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 48px rgba(0,0,0,0.2)' }}>

            {/* Header */}
            <div style={{ padding: '18px 22px 0', paddingBottom: 14, borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Vista previa del archivo</h2>
                  <p style={{ fontSize: '0.75rem', color: '#888', margin: '3px 0 0' }}>{csvArchivo?.name} · {csvParsed.rows.length} filas encontradas</p>
                </div>
                <button onClick={() => setModal('importar')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#888' }}>✕</button>
              </div>

              {!csvTelAsignada && (
                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 7, padding: '7px 12px', fontSize: '0.75rem', color: '#92400e', marginBottom: 10 }}>
                  ⚠ Asigna la columna <strong>Telefono (requerido)</strong> para poder importar.
                </div>
              )}

              <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 7 }}>Asigna cada columna del CSV a un campo</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {csvParsed.headers.map((h, i) => (
                  <div key={i} style={{ minWidth: 130 }}>
                    <div style={{ fontSize: '0.67rem', color: '#888', marginBottom: 2, fontFamily: 'monospace' }}>{h}</div>
                    <select value={csvMapeo[i] || ''} onChange={e => setCsvMapeo(prev => ({ ...prev, [i]: e.target.value }))}
                      style={{ width: '100%', padding: '5px 7px', border: `1.5px solid ${csvMapeo[i] === 'telefono' ? '#6366f1' : csvMapeo[i] ? '#a5b4fc' : '#e5e7eb'}`, borderRadius: 6, fontSize: '0.75rem', outline: 'none', background: csvMapeo[i] === 'telefono' ? '#eef2ff' : '#fff' }}>
                      {CSV_CAMPOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabla */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f0f2f5', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                  <input type="checkbox" checked={csvFilasValidas.length > 0 && csvFilasValidas.every(r => csvSel.has(r._i))} onChange={csvToggleAll} style={{ width: 15, height: 15, accentColor: '#6366f1' }} />
                  Seleccionar todo
                </label>
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#555' }}>
                  <strong style={{ color: '#6366f1' }}>{csvSelValidas.length}</strong> de <strong>{csvFilasValidas.length}</strong> filas seleccionadas
                  {csvFilasInvalidas.length > 0 && <span style={{ color: '#ef4444', marginLeft: 8 }}>· {csvFilasInvalidas.length} rechazadas</span>}
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}></th>
                    {['Teléfono', 'Nombre', 'Etiquetas', 'Notas'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>{h}</th>
                    ))}
                    <th style={{ width: 150 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {csvFilasVistas.map(r => (
                    <tr key={r._i} style={{ borderBottom: '1px solid #f8f9fa', background: !r.telOk ? '#fff5f5' : csvSel.has(r._i) ? '#eef2ff' : '#fff' }}>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        {r.telOk
                          ? <input type="checkbox" checked={csvSel.has(r._i)} onChange={() => csvToggleRow(r._i)} style={{ width: 14, height: 14, accentColor: '#6366f1' }} />
                          : <span style={{ color: '#ef4444' }}>✕</span>}
                      </td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600, color: r.telOk ? '#374151' : '#ef4444' }}>{r.telefono || '—'}</td>
                      <td style={{ padding: '6px 10px' }}>{r.nombre || <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ padding: '6px 10px' }}>
                        {r.etiquetas ? r.etiquetas.split(/[, ]+/).filter(Boolean).map(t => (
                          <span key={t} style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 20, fontSize: '0.65rem', background: '#eef2ff', color: '#6366f1', marginRight: 2 }}>{t}</span>
                        )) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#888', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notas || <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ padding: '6px 10px', fontSize: '0.67rem', color: '#ef4444' }}>{!r.telOk && r.telErr?.slice(0, 35)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 22px', borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '0.8rem', color: '#555', flex: 1 }}><strong style={{ color: '#6366f1' }}>{csvSelValidas.length}</strong> contactos listos para importar</span>
              <button onClick={() => setModal('importar')} style={{ padding: '8px 20px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Atrás</button>
              <button onClick={importarCSV} disabled={guardando || !csvSelValidas.length || !csvTelAsignada}
                style={{ padding: '8px 22px', background: (guardando || !csvSelValidas.length || !csvTelAsignada) ? '#9ca3af' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                {guardando ? 'Importando...' : 'Importar contactos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
