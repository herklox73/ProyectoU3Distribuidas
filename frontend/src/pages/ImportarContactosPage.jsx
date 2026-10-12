import { useState, useRef, useCallback } from 'react'
import { sileo } from 'sileo'
import axios from '../api/axios'

// ── Validación de teléfono (espejo de normalizar_telefono en Python) ──────
function normalizarTelefono(raw) {
  if (!raw) return { ok: false, tel: '', err: 'Teléfono vacío' }
  let s = String(raw).trim()

  // Notación científica
  if (/[Ee][+\-]?\d/.test(s)) return { ok: false, tel: '', err: 'Número en notación científica' }

  // Quitar todo excepto dígitos y +
  let limpio = s.replace(/[^\d+]/g, '')
  if (limpio.startsWith('+')) limpio = limpio.slice(1)
  if (!/^\d+$/.test(limpio)) return { ok: false, tel: '', err: 'Caracteres inválidos' }
  // +593 0987654321 (el 0 sobra) y 987654321 (sin 0 ni código) -> 593987654321
  if (/^5930\d{9}$/.test(limpio)) limpio = '593' + limpio.slice(4)
  else if (/^9\d{8}$/.test(limpio)) limpio = '593' + limpio

  // Local Ecuador (empieza con 0)
  if (/^0\d{7,9}$/.test(limpio)) {
    const sinCero = limpio.slice(1)
    if (!sinCero.startsWith('9'))
      return { ok: false, tel: '', err: `Número fijo — los fijos no reciben WhatsApp` }
    limpio = '593' + sinCero
  }

  // Con código Ecuador
  if (limpio.startsWith('593')) {
    if (!limpio.startsWith('5939'))
      return { ok: false, tel: '', err: 'Número fijo de Ecuador — solo móviles 5939XXXXXXXX' }
    if (limpio.length !== 12)
      return { ok: false, tel: '', err: `Móvil Ecuador inválido: ${limpio.length} dígitos (se esperan 12)` }
    return { ok: true, tel: limpio, err: null }
  }

  // Internacional
  if (limpio.length < 11) return { ok: false, tel: '', err: `Muy corto (${limpio.length} dígitos). Agrega código de país.` }
  if (limpio.length > 15) return { ok: false, tel: '', err: `Muy largo (${limpio.length} dígitos, máx 15)` }
  return { ok: true, tel: limpio, err: null }
}

// Formatos que acepta el servidor (ver backend/mass_sender/archivos_contactos.py)
const EXTENSIONES = ['.xlsx', '.xls', '.xlsm', '.xlsb', '.xltx', '.xltm', '.ods', '.csv', '.txt', '.tsv']
const MAX_MB = 50
const LOTE_IMPORTACION = 1000   // contactos por petición al importar
const FILAS_VISTA = 300          // filas que se dibujan en la vista previa

function descargarPlantilla() {
  const c = 'telefono,nombre,etiquetas,notas\n5930000000001,Juan Pérez,cliente,Interesado en producto A\n5930000000002,María López,lead,\n5930000000003,Carlos Ríos,cliente lead,Cliente VIP'
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([c], { type: 'text/csv' })), download: 'plantilla_contactos.csv' })
  a.click()
}

// ── Constantes ─────────────────────────────────────────────────────────────
const CAMPOS = [
  { value: '',          label: 'No importar' },
  { value: 'telefono',  label: 'Telefono (requerido)' },
  { value: 'nombre',    label: 'Nombre' },
  { value: 'etiquetas', label: 'Etiquetas' },
  { value: 'notas',     label: 'Notas' },
]

// Intenta mapear automáticamente por nombre de columna
function autoMap(headers) {
  const map = {}
  const norm = h => h.toLowerCase().replace(/[^a-z0-9]/g, '')
  headers.forEach((h, i) => {
    const n = norm(h)
    if (['telefono','phone','tel','celular','movil','mobile','homephone','phonenumber'].some(k => n.includes(k))) map[i] = 'telefono'
    else if (['nombre','name','rawname','fullname','apellido','contacto'].some(k => n.includes(k))) map[i] = map[i] || 'nombre'
    else if (['etiqueta','tag','label','categoria','tipo'].some(k => n.includes(k))) map[i] = map[i] || 'etiquetas'
    else if (['nota','note','obs','comment','detalle'].some(k => n.includes(k))) map[i] = map[i] || 'notas'
    else map[i] = ''
  })
  return map
}

// ── Componente principal ──────────────────────────────────────────────────
export default function ImportarContactosPage() {
  const [separador, setSeparador]   = useState('')
  const [archivo, setArchivo]       = useState(null)
  const [parsed, setParsed]         = useState(null)   // { headers, rows }
  const [mapeo, setMapeo]           = useState({})     // { colIndex: campo }
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [modal, setModal]           = useState(false)
  const [importing, setImporting]   = useState(false)
  const [resultado, setResultado]   = useState(null)
  const [dragging, setDragging]     = useState(false)
  const [leyendo, setLeyendo]       = useState(false)
  const [progreso, setProgreso]     = useState(null)   // { hechos, total }
  const inputRef                    = useRef(null)

  // El archivo se manda al servidor solo para leerlo (no se guarda) y vuelve
  // como columnas y filas para la vista previa.
  const procesarArchivo = useCallback(async (file, sep) => {
    if (!file) return
    const nombre = file.name.toLowerCase()
    if (!EXTENSIONES.some(ext => nombre.endsWith(ext))) {
      sileo.error({ title: 'Formato inválido', description: 'Usa Excel (.xlsx, .xls, .xlsm, .xlsb), .ods o .csv' }); return
    }
    if (file.size > MAX_MB * 1024 * 1024) { sileo.error({ title: 'Archivo muy grande', description: `El límite es ${MAX_MB} MB` }); return }
    setArchivo(file)
    setResultado(null)
    setLeyendo(true)
    try {
      const form = new FormData()
      form.append('archivo', file)
      if (sep) form.append('separador', sep)
      const { data } = await axios.post('/whatsapp/api/contactos/leer-archivo/', form)
      const rows = data.rows.map((cells, i) => ({ _i: i, cells }))
      setMapeo(autoMap(data.headers))
      setParsed({ headers: data.headers, rows })
      setSeleccionados(new Set(rows.map(r => r._i)))
      setModal(true)
    } catch (e) {
      sileo.error({ title: 'No se pudo leer el archivo', description: e.response?.data?.error || 'Revisa que no esté dañado' })
      setArchivo(null)
      if (inputRef.current) inputRef.current.value = ''
    } finally {
      setLeyendo(false)
    }
  }, [])

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false)
    procesarArchivo(e.dataTransfer.files[0], separador)
  }
  const onFileChange = (e) => procesarArchivo(e.target.files[0], separador)
  const onSepChange  = (s) => {
    setSeparador(s)
    if (archivo) procesarArchivo(archivo, s)
  }

  // Construir filas con datos ya mapeados + validación de teléfono
  const filasVistas = parsed ? parsed.rows.map(r => {
    const get = (campo) => {
      const idx = Object.entries(mapeo).find(([, v]) => v === campo)?.[0]
      return idx != null ? (r.cells[idx] || '') : ''
    }
    const rawTel = get('telefono')
    const { ok, tel, err } = rawTel ? normalizarTelefono(rawTel) : { ok: false, tel: '', err: 'Sin columna teléfono' }
    return {
      _i: r._i,
      cells: r.cells,
      telefono: ok ? tel : rawTel,
      nombre:   get('nombre'),
      etiquetas:get('etiquetas'),
      notas:    get('notas'),
      telOk:    ok,
      telErr:   err,
    }
  }) : []

  const filasValidas    = filasVistas.filter(r => r.telOk)
  const filasInvalidas  = filasVistas.filter(r => !r.telOk)
  const selValidas      = filasValidas.filter(r => seleccionados.has(r._i))
  const telColAsignada  = Object.values(mapeo).includes('telefono')

  const toggleRow = (i) => setSeleccionados(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })
  const toggleAll = () => {
    const idsValidos = new Set(filasValidas.map(r => r._i))
    const todosSeleccionados = filasValidas.every(r => seleccionados.has(r._i))
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (todosSeleccionados) { idsValidos.forEach(id => next.delete(id)) }
      else { idsValidos.forEach(id => next.add(id)) }
      return next
    })
  }

  // Se envía en partes de 1.000 para que archivos grandes (25.000+ filas)
  // no se queden colgados y se vea el avance.
  const importar = async () => {
    if (!selValidas.length) return
    setImporting(true)
    const contactos = selValidas.map(r => ({
      telefono: r.telefono, nombre: r.nombre, etiquetas: r.etiquetas, notas: r.notas
    }))
    const total = { total: 0, creados: 0, actualizados: 0, errores: 0 }
    setProgreso({ hechos: 0, total: contactos.length })
    try {
      for (let i = 0; i < contactos.length; i += LOTE_IMPORTACION) {
        const { data } = await axios.post('/whatsapp/api/contactos/importar/', { contactos: contactos.slice(i, i + LOTE_IMPORTACION) })
        for (const k of Object.keys(total)) total[k] += data[k] || 0
        setProgreso({ hechos: Math.min(i + LOTE_IMPORTACION, contactos.length), total: contactos.length })
      }
      setResultado(total)
      setModal(false)
      setArchivo(null)
      setParsed(null)
      if (inputRef.current) inputRef.current.value = ''
      sileo.success({ title: 'Importación completada', description: `${total.creados} nuevos · ${total.actualizados} actualizados · ${total.errores} errores` })
    } catch (e) {
      // Lo que alcanzó a subir ya quedó guardado
      if (total.total) setResultado(total)
      sileo.error({ title: 'Error al importar', description: (e.response?.data?.error || 'Error de conexión') + (total.total ? ` · se guardaron ${total.total} antes del error` : '') })
    } finally {
      setImporting(false)
      setProgreso(null)
    }
  }

  const limpiar = () => {
    setArchivo(null); setParsed(null); setResultado(null); setModal(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  // ── UI ────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: '#f8f9fa' }}>
      <h1 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: 24 }}>Importar contactos desde Excel o CSV</h1>

      {/* Resultado */}
      {resultado && (
        <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
          <p style={{ fontWeight: 700, color: '#065f46', marginBottom: 8 }}>Importación completada</p>
          <div style={{ display: 'flex', gap: 24, fontSize: '0.88rem', color: '#374151' }}>
            <span>Total: <strong>{resultado.total}</strong></span>
            <span style={{ color: '#10b981' }}>Creados: <strong>{resultado.creados}</strong></span>
            <span style={{ color: '#3b82f6' }}>Actualizados: <strong>{resultado.actualizados}</strong></span>
            <span style={{ color: '#ef4444' }}>Errores: <strong>{resultado.errores}</strong></span>
          </div>
          <button onClick={limpiar} style={{ marginTop: 14, padding: '8px 20px', background: '#065f46', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
            Importar otro archivo
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Panel subir */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>Subir archivo</h2>
          <p style={{ fontSize: '0.82rem', color: '#888', marginBottom: 16 }}>
            Sube tu archivo con los contactos. Podrás asignar cada columna al campo correcto.
          </p>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#7c3aed' : '#c4b5fd'}`,
              borderRadius: 12, padding: '32px 20px', textAlign: 'center',
              background: dragging ? '#f5f3ff' : '#faf5ff',
              cursor: 'pointer', marginBottom: 20, transition: 'all 0.2s'
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" style={{ margin: '0 auto 10px', display: 'block' }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p style={{ color: '#7c3aed', fontWeight: 600, margin: '0 0 4px' }}>
              {leyendo ? `Leyendo ${archivo?.name || 'archivo'}…` : archivo ? archivo.name : 'Arrastra tu archivo aquí o haz clic para seleccionar'}
            </p>
            <p style={{ fontSize: '0.75rem', color: '#aaa', margin: 0 }}>Excel (.xlsx, .xls, .xlsm, .xlsb), .ods o .csv · máximo {MAX_MB} MB</p>
            <input ref={inputRef} type="file" accept={EXTENSIONES.join(',')} onChange={onFileChange} style={{ display: 'none' }} />
          </div>

          {/* Separador */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Separador de columnas (solo CSV)</label>
            <select value={separador} onChange={e => onSepChange(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', outline: 'none' }}>
              <option value="">Detectar automáticamente</option>
              <option value=",">Coma ( , )</option>
              <option value=";">Punto y coma ( ; )</option>
              <option value={'\t'}>Tabulación</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => archivo && setModal(true)} disabled={!archivo}
              style={{ flex: 1, padding: '10px', background: !archivo ? '#e5e7eb' : '#7c3aed', color: !archivo ? '#aaa' : '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: !archivo ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
              Vista previa e importar
            </button>
            <button onClick={descargarPlantilla}
              style={{ padding: '10px 16px', background: '#fff', color: '#7c3aed', border: '1.5px solid #7c3aed', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
              Descargar plantilla
            </button>
          </div>
        </div>

        {/* Panel formato */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>Formato esperado</h2>
          <p style={{ fontSize: '0.82rem', color: '#888', marginBottom: 14 }}>
            Se lee la primera hoja del Excel. Puede tener cualquier columna: podrás asignarlas al importar. Formato ideal:
          </p>
          <pre style={{ background: '#f8f9fa', padding: '14px 16px', borderRadius: 8, fontSize: '0.78rem', fontFamily: 'monospace', color: '#374151', overflowX: 'auto', marginBottom: 16 }}>
{`telefono,nombre,etiquetas,notas
5939XXXXXXXX,Juan Pérez,cliente,Interesado
5939XXXXXXXX,María López,lead,`}
          </pre>
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', color: '#92400e' }}>
            <strong>⚠ Teléfonos válidos para WhatsApp:</strong><br />
            Solo móviles. Ecuador: <code>09XXXXXXXX</code> o <code>5939XXXXXXXX</code>.<br />
            Los números fijos (02, 03, 04…) serán rechazados automáticamente.
          </div>
        </div>
      </div>

      {/* ── Modal vista previa ──────────────────────────────────────────── */}
      {modal && parsed && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 48px rgba(0,0,0,0.2)' }}>

            {/* Header modal */}
            <div style={{ padding: '20px 24px 0', borderBottom: '1px solid #e5e7eb', paddingBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Vista previa del archivo</h2>
                  <p style={{ fontSize: '0.78rem', color: '#888', margin: '4px 0 0' }}>
                    {archivo?.name} · {parsed.rows.length} filas encontradas
                  </p>
                </div>
                <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#888', padding: 4 }}>✕</button>
              </div>

              {/* Mapeo de columnas */}
              {!telColAsignada && (
                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', color: '#92400e', marginTop: 12 }}>
                  ⚠ Asigna al menos la columna <strong>Telefono (requerido)</strong> para poder importar.
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Asigna cada columna del archivo a un campo
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {parsed.headers.map((h, i) => (
                    <div key={i} style={{ minWidth: 140 }}>
                      <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: 3, fontFamily: 'monospace' }}>{h}</div>
                      <select
                        value={mapeo[i] || ''}
                        onChange={e => setMapeo(prev => ({ ...prev, [i]: e.target.value }))}
                        style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e5e7eb', borderRadius: 6, fontSize: '0.78rem', outline: 'none',
                          borderColor: mapeo[i] === 'telefono' ? '#7c3aed' : mapeo[i] ? '#c4b5fd' : '#e5e7eb',
                          background: mapeo[i] === 'telefono' ? '#faf5ff' : '#fff' }}
                      >
                        {CAMPOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tabla */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
              {/* Barra selección */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f0f2f5', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
                  <input type="checkbox"
                    checked={filasValidas.length > 0 && filasValidas.every(r => seleccionados.has(r._i))}
                    onChange={toggleAll}
                    style={{ width: 16, height: 16, accentColor: '#7c3aed' }} />
                  Seleccionar todo
                </label>
                <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#555' }}>
                  <strong style={{ color: '#7c3aed' }}>{selValidas.length}</strong> de <strong>{filasValidas.length}</strong> filas seleccionadas
                  {filasInvalidas.length > 0 && (
                    <span style={{ color: '#ef4444', marginLeft: 8 }}>· {filasInvalidas.length} rechazadas (fijos/inválidos)</span>
                  )}
                </span>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: '8px 10px', width: 32 }}></th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.68rem' }}>Teléfono</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.68rem' }}>Nombre</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#aaa', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.68rem' }}>Etiquetas —</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#aaa', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.68rem' }}>Notas —</th>
                    <th style={{ padding: '8px 10px', width: 140 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filasVistas.slice(0, FILAS_VISTA).map((r) => (
                    <tr key={r._i} style={{ borderBottom: '1px solid #f8f9fa', background: !r.telOk ? '#fff5f5' : seleccionados.has(r._i) ? '#faf5ff' : '#fff', opacity: !r.telOk ? 0.7 : 1 }}>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        {r.telOk
                          ? <input type="checkbox" checked={seleccionados.has(r._i)} onChange={() => toggleRow(r._i)} style={{ width: 15, height: 15, accentColor: '#7c3aed' }} />
                          : <span style={{ color: '#ef4444', fontSize: '0.9rem' }}>✕</span>}
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 600, color: r.telOk ? '#374151' : '#ef4444' }}>
                        {r.telefono || <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px' }}>{r.nombre || <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ padding: '7px 10px', color: '#888' }}>
                        {r.etiquetas
                          ? r.etiquetas.split(/[, ]+/).filter(Boolean).map(t => (
                              <span key={t} style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 20, fontSize: '0.68rem', background: '#f3e8ff', color: '#7c3aed', marginRight: 3 }}>{t}</span>
                            ))
                          : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px', color: '#888', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.notas || <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: '0.7rem' }}>
                        {!r.telOk && (
                          <span style={{ color: '#ef4444', display: 'block', maxWidth: 160 }} title={r.telErr}>{r.telErr?.slice(0, 40)}{r.telErr?.length > 40 ? '…' : ''}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filasVistas.length > FILAS_VISTA && (
                <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#888', padding: '12px 0 16px', margin: 0 }}>
                  Se muestran las primeras {FILAS_VISTA} filas de {filasVistas.length.toLocaleString('es-EC')}. Al importar se incluyen todas las seleccionadas.
                </p>
              )}
            </div>

            {/* Footer modal */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '0.82rem', color: '#555', flex: 1 }}>
                <strong style={{ color: '#7c3aed' }}>{selValidas.length.toLocaleString('es-EC')}</strong> contactos listos para importar
              </span>
              <button onClick={() => setModal(false)} style={{ padding: '9px 22px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button onClick={importar} disabled={importing || !selValidas.length || !telColAsignada}
                style={{ padding: '9px 26px', background: (importing || !selValidas.length || !telColAsignada) ? '#9ca3af' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: (importing || !selValidas.length || !telColAsignada) ? 'not-allowed' : 'pointer', fontSize: '0.88rem' }}>
                {importing && progreso ? `Importando ${progreso.hechos.toLocaleString('es-EC')} de ${progreso.total.toLocaleString('es-EC')}…` : 'Importar contactos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
