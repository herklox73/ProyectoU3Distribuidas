// Selector de etiquetas para segmentar una campaña.
// Ninguna marcada = se envía a todos. Varias marcadas = se envía a los
// contactos que tengan CUALQUIERA de ellas. El valor se guarda como texto
// separado por comas ("norte, sur"), igual que antes.
import { useEffect, useMemo, useState } from 'react'
import axios from '../../api/axios'

const separar = (texto) => {
  const vistas = new Set()
  return (texto || '').split(',').map(t => t.trim()).filter(t => {
    const k = t.toLowerCase()
    if (!t || vistas.has(k)) return false
    vistas.add(k)
    return true
  })
}

export default function SelectorEtiquetas({ value, onChange }) {
  const [etiquetas, setEtiquetas] = useState([])
  const [total, setTotal]         = useState(0)
  const [destinatarios, setDestinatarios] = useState(null)
  const [busqueda, setBusqueda]   = useState('')
  const [cargando, setCargando]   = useState(true)

  const elegidas = useMemo(() => separar(value), [value])
  const elegidasLower = useMemo(() => new Set(elegidas.map(e => e.toLowerCase())), [elegidas])

  // Cuántos contactos recibirían la campaña con la selección actual
  useEffect(() => {
    let vivo = true
    setDestinatarios(null)   // mientras se recalcula se muestra "…"
    const t = setTimeout(() => {
      axios.get('/whatsapp/api/contactos/etiquetas/', { params: { seleccion: elegidas.join(',') } })
        .then(({ data }) => {
          if (!vivo) return
          setEtiquetas(data.etiquetas || [])
          setTotal(data.total || 0)
          setDestinatarios(data.destinatarios)
        })
        .catch(() => {})
        .finally(() => vivo && setCargando(false))
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [elegidas])

  const alternar = (etq) => {
    const k = etq.toLowerCase()
    const nuevas = elegidasLower.has(k) ? elegidas.filter(e => e.toLowerCase() !== k) : [...elegidas, etq]
    onChange(nuevas.join(', '))
  }

  const visibles = etiquetas.filter(e => e.etiqueta.toLowerCase().includes(busqueda.trim().toLowerCase()))
  // Etiquetas guardadas en la campaña que ya no tiene ningún contacto
  const huerfanas = elegidas.filter(e => !etiquetas.some(x => x.etiqueta.toLowerCase() === e.toLowerCase()))

  const chip = (activo) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20,
    fontSize: '0.78rem', cursor: 'pointer', userSelect: 'none', transition: 'background .12s, border-color .12s',
    border: `1.5px solid ${activo ? '#7c3aed' : '#e5e7eb'}`,
    background: activo ? '#f3e8ff' : '#fff', color: activo ? '#5b21b6' : '#374151', fontWeight: activo ? 600 : 500,
  })

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar etiqueta…"
          style={{ flex: 1, minWidth: 150, padding: '7px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.82rem', outline: 'none' }} />
        {elegidas.length > 0 && (
          <button type="button" onClick={() => onChange('')}
            style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: '0.78rem', color: '#52514e' }}>
            Quitar todas
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 170, overflowY: 'auto', paddingRight: 2 }}>
        {cargando && <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Cargando etiquetas…</span>}
        {!cargando && etiquetas.length === 0 && (
          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
            Tus contactos aún no tienen etiquetas. Asígnalas al importar (columna "Etiquetas") o al editar un contacto.
          </span>
        )}
        {huerfanas.map(e => (
          <span key={'h-' + e} style={chip(true)} onClick={() => alternar(e)} title="Ningún contacto tiene esta etiqueta ahora">
            ✓ {e} <span style={{ color: '#9ca3af', fontWeight: 400 }}>0</span>
          </span>
        ))}
        {visibles.map(e => {
          const activo = elegidasLower.has(e.etiqueta.toLowerCase())
          return (
            <span key={e.etiqueta} role="checkbox" aria-checked={activo} tabIndex={0}
              onClick={() => alternar(e.etiqueta)}
              onKeyDown={ev => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); alternar(e.etiqueta) } }}
              style={chip(activo)}>
              {activo ? '✓ ' : ''}{e.etiqueta}
              <span style={{ color: activo ? '#7c3aed' : '#9ca3af', fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>
                {e.contactos.toLocaleString('es-EC')}
              </span>
            </span>
          )
        })}
        {!cargando && etiquetas.length > 0 && visibles.length === 0 && (
          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Ninguna etiqueta coincide con "{busqueda}"</span>
        )}
      </div>

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f3f4f6', fontSize: '0.8rem', color: '#374151' }}>
        {elegidas.length === 0
          ? <>Sin filtro: se enviará a <b>todos tus contactos</b> ({total.toLocaleString('es-EC')}).</>
          : <>Se enviará a <b style={{ color: '#5b21b6' }}>{destinatarios == null ? '…' : destinatarios.toLocaleString('es-EC')}</b> contactos
              que tengan {elegidas.length === 1 ? 'la etiqueta' : 'cualquiera de las'} <b>{elegidas.length}</b> {elegidas.length === 1 ? 'elegida' : 'etiquetas elegidas'}.</>}
      </div>
    </div>
  )
}
