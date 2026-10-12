// Gráficos de la página de reportes, dibujados en SVG (sin librerías extra).
// Colores por estado: rampa azul de menos a más avance (enviado -> entregado
// -> leído), gris para pendiente y rojo de alerta para fallido. Siempre van
// acompañados de su nombre y cifra, nunca solo por color.
import { useRef, useState } from 'react'

export const ESTADOS = [
  { key: 'pending',   label: 'Pendiente', color: '#a3a29b' },
  { key: 'sent',      label: 'Enviado',   color: '#86b6ef' },
  { key: 'delivered', label: 'Entregado', color: '#2a78d6' },
  { key: 'read',      label: 'Leído',     color: '#104281' },
  { key: 'failed',    label: 'Fallido',   color: '#d03b3b' },
]

const TINTA = '#0b0b0b'
const TINTA2 = '#52514e'
const MUTED = '#8a8983'
const RAYA = '#e4e3df'

const fmt = (n) => Number(n || 0).toLocaleString('es-EC')

// ── Tooltip compartido ──────────────────────────────────────────────
function useTooltip() {
  const ref = useRef(null)
  const [tip, setTip] = useState(null)
  const mostrar = (e, contenido) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, ancho: box.width, contenido })
  }
  const ocultar = () => setTip(null)
  const nodo = tip && (
    <div style={{
      position: 'absolute', left: Math.min(tip.x + 12, tip.ancho - 190), top: Math.max(tip.y - 12, 0),
      transform: 'translateY(-100%)', pointerEvents: 'none', zIndex: 5,
      background: '#fff', border: `1px solid ${RAYA}`, borderRadius: 8,
      boxShadow: '0 6px 18px rgba(0,0,0,0.10)', padding: '8px 10px', minWidth: 150,
      fontSize: '0.76rem', color: TINTA, lineHeight: 1.5,
    }}>
      {tip.contenido}
    </div>
  )
  return { ref, mostrar, ocultar, nodo }
}

function FilaTip({ color, label, valor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {color && <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />}
      <span style={{ color: TINTA2, flex: 1 }}>{label}</span>
      <b style={{ fontWeight: 600 }}>{valor}</b>
    </div>
  )
}

export function Vacio({ alto = 160, texto = 'Sin datos para el periodo seleccionado' }) {
  return (
    <div style={{ height: alto, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: '0.84rem' }}>
      {texto}
    </div>
  )
}

// ── Anillo: distribución por estado ─────────────────────────────────
export function DonaEstados({ porEstado, total }) {
  const t = useTooltip()
  const [activo, setActivo] = useState(null)
  if (!total) return <Vacio />

  const R = 78, r = 50, C = 90
  let angulo = -Math.PI / 2
  const arcos = []
  for (const e of porEstado) {
    if (!e.total) continue
    const meta = ESTADOS.find(s => s.key === e.estado)
    const barrido = (e.total / total) * Math.PI * 2
    arcos.push({ ...e, color: meta.color, ini: angulo, fin: angulo + barrido })
    angulo += barrido
  }
  const punto = (rad, a) => [C + rad * Math.cos(a), C + rad * Math.sin(a)]
  const ruta = ({ ini, fin }) => {
    if (fin - ini >= Math.PI * 2 - 1e-6) fin = ini + Math.PI * 2 - 1e-4
    const g = fin - ini > Math.PI ? 1 : 0
    const [x1, y1] = punto(R, ini), [x2, y2] = punto(R, fin)
    const [x3, y3] = punto(r, fin), [x4, y4] = punto(r, ini)
    return `M${x1},${y1} A${R},${R} 0 ${g} 1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${g} 0 ${x4},${y4} Z`
  }

  return (
    <div ref={t.ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
      <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Mensajes por estado">
        {arcos.map(a => (
          <path key={a.estado} d={ruta(a)} fill={a.color} stroke="#fff" strokeWidth="2"
            opacity={activo && activo !== a.estado ? 0.35 : 1}
            style={{ transition: 'opacity .15s', cursor: 'default' }}
            onMouseMove={ev => { setActivo(a.estado); t.mostrar(ev, <FilaTip color={a.color} label={a.etiqueta} valor={`${fmt(a.total)} · ${a.pct}%`} />) }}
            onMouseLeave={() => { setActivo(null); t.ocultar() }} />
        ))}
        <text x={C} y={C - 2} textAnchor="middle" fontSize="24" fontWeight="700" fill={TINTA}>{fmt(total)}</text>
        <text x={C} y={C + 16} textAnchor="middle" fontSize="10.5" fill={TINTA2}>enviados</text>
      </svg>
      <div style={{ display: 'grid', gap: 7, minWidth: 170, flex: 1 }}>
        {porEstado.map(e => {
          const meta = ESTADOS.find(s => s.key === e.estado)
          return (
            <div key={e.estado}
              onMouseEnter={() => setActivo(e.total ? e.estado : null)} onMouseLeave={() => setActivo(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', opacity: e.total ? 1 : 0.5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: meta.color }} />
              <span style={{ color: TINTA, flex: 1 }}>{e.etiqueta}</span>
              <span style={{ color: TINTA, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(e.total)}</span>
              <span style={{ color: MUTED, width: 46, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{e.pct}%</span>
            </div>
          )
        })}
      </div>
      {t.nodo}
    </div>
  )
}

// ── Embudo: enviados -> entregados -> leídos ────────────────────────
export function Embudo({ resumen }) {
  const total = resumen.enviados || 0
  if (!total) return <Vacio />
  const etapas = [
    { label: 'Enviados', valor: total, color: '#86b6ef', nota: '100%' },
    { label: 'Entregados', valor: resumen.entregados, color: '#2a78d6', nota: `${resumen.tasa_entrega}% de enviados` },
    { label: 'Leídos', valor: resumen.leidos, color: '#104281', nota: `${resumen.tasa_lectura}% de enviados · ${resumen.tasa_lectura_entregados}% de entregados` },
  ]
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {etapas.map(e => (
        <div key={e.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 5 }}>
            <span style={{ color: TINTA, fontWeight: 600 }}>{e.label}</span>
            <span style={{ color: TINTA, fontVariantNumeric: 'tabular-nums' }}>{fmt(e.valor)}</span>
          </div>
          <div style={{ height: 14, background: '#f0efec', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(e.valor / total) * 100}%`, minWidth: e.valor ? 4 : 0, height: '100%', background: e.color, borderRadius: 4, transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: '0.72rem', color: MUTED, marginTop: 4 }}>{e.nota}</div>
        </div>
      ))}
    </div>
  )
}

// Rectángulo con solo las esquinas de arriba redondeadas (extremo del dato)
function barraTop(x, y, w, h, r = 3) {
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

// Escala "bonita" para el eje Y
function escala(max) {
  if (max <= 4) return { tope: Math.max(max, 1), paso: 1 }
  const crudo = max / 4
  const mag = 10 ** Math.floor(Math.log10(crudo))
  const paso = [1, 2, 2.5, 5, 10].map(m => m * mag).find(p => p >= crudo)
  return { tope: Math.ceil(max / paso) * paso, paso }
}

const ARRIBA = 10   // margen para que la etiqueta superior del eje no se corte

function Ejes({ ancho, alto, izq, tope, paso }) {
  const lineas = []
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    const y = ARRIBA + alto - (v / tope) * alto
    lineas.push(
      <g key={v}>
        <line x1={izq} x2={ancho} y1={y} y2={y} stroke={RAYA} strokeWidth="1" />
        <text x={izq - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill={MUTED}>{fmt(v)}</text>
      </g>
    )
  }
  return <g>{lineas}</g>
}

// ── Columnas apiladas por día ───────────────────────────────────────
export function ActividadDiaria({ porDia }) {
  const t = useTooltip()
  const [hover, setHover] = useState(null)
  const hayDatos = porDia.some(d => d.enviados > 0)
  if (!hayDatos) return <Vacio />

  const W = 760, H = 200, IZQ = 34, ABAJO = 22
  const alto = H - ABAJO - ARRIBA
  const { tope, paso } = escala(Math.max(...porDia.map(d => d.enviados)))
  const n = porDia.length
  const banda = (W - IZQ) / n
  const anchoBarra = Math.max(3, Math.min(26, banda * 0.68))
  const cadaEtiqueta = Math.ceil(n / 10)
  const fechaCorta = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

  return (
    <div ref={t.ref} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Mensajes enviados por día y estado">
        <Ejes ancho={W} alto={alto} izq={IZQ} tope={tope} paso={paso} />
        {porDia.map((d, i) => {
          const x = IZQ + i * banda + (banda - anchoBarra) / 2
          let y = ARRIBA + alto
          const segs = ESTADOS.filter(s => d[s.key] > 0).map(s => {
            const h = (d[s.key] / tope) * alto
            y -= h
            return { ...s, y, h }
          })
          return (
            <g key={d.dia}
              onMouseMove={ev => {
                setHover(i)
                t.mostrar(ev, (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{fechaCorta(d.dia)} · {fmt(d.enviados)} enviados</div>
                    {[...ESTADOS].reverse().map(s => <FilaTip key={s.key} color={s.color} label={s.label} valor={fmt(d[s.key])} />)}
                    <div style={{ color: MUTED, marginTop: 4 }}>{fmt(d.recibidos)} recibidos</div>
                  </>
                ))
              }}
              onMouseLeave={() => { setHover(null); t.ocultar() }}>
              <rect x={IZQ + i * banda} y={ARRIBA} width={banda} height={alto} fill={hover === i ? '#f3f2ef' : 'transparent'} />
              {segs.map((s, k) => {
                // 1px de separación (color de fondo) entre segmentos apilados
                const arriba = k === segs.length - 1
                const yy = arriba ? s.y : s.y + 1
                const hh = Math.max(0, arriba ? s.h : s.h - 1)
                return arriba
                  ? <path key={s.key} d={barraTop(x, yy, anchoBarra, hh)} fill={s.color} />
                  : <rect key={s.key} x={x} y={yy} width={anchoBarra} height={hh} fill={s.color} />
              })}
              {i % cadaEtiqueta === 0 && (
                <text x={IZQ + i * banda + banda / 2} y={H - 6} textAnchor="middle" fontSize="10" fill={MUTED}>{fechaCorta(d.dia)}</text>
              )}
            </g>
          )
        })}
      </svg>
      {t.nodo}
    </div>
  )
}

// ── Envíos por hora del día ─────────────────────────────────────────
export function PorHora({ porHora }) {
  const t = useTooltip()
  const [hover, setHover] = useState(null)
  if (!porHora.some(h => h.enviados > 0)) return <Vacio />

  const W = 760, H = 170, IZQ = 34, ABAJO = 22
  const alto = H - ABAJO - ARRIBA
  const { tope, paso } = escala(Math.max(...porHora.map(h => h.enviados)))
  const banda = (W - IZQ) / 24
  const anchoBarra = banda * 0.62

  return (
    <div ref={t.ref} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Envíos por hora del día">
        <Ejes ancho={W} alto={alto} izq={IZQ} tope={tope} paso={paso} />
        {porHora.map((h, i) => {
          const alt = (h.enviados / tope) * alto
          return (
            <g key={h.hora}
              onMouseMove={ev => {
                setHover(i)
                t.mostrar(ev, (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{String(h.hora).padStart(2, '0')}:00 a {String(h.hora).padStart(2, '0')}:59</div>
                    <FilaTip label="Enviados" valor={fmt(h.enviados)} />
                    <FilaTip label="Entregados" valor={fmt(h.entregados)} />
                    <FilaTip label="Leídos" valor={`${fmt(h.leidos)} (${h.tasa_lectura}%)`} />
                  </>
                ))
              }}
              onMouseLeave={() => { setHover(null); t.ocultar() }}>
              <rect x={IZQ + i * banda} y={ARRIBA} width={banda} height={alto} fill={hover === i ? '#f3f2ef' : 'transparent'} />
              {h.enviados > 0 && (
                <path d={barraTop(IZQ + i * banda + (banda - anchoBarra) / 2, ARRIBA + alto - alt, anchoBarra, alt)} fill="#2a78d6" />
              )}
              {i % 2 === 0 && (
                <text x={IZQ + i * banda + banda / 2} y={H - 6} textAnchor="middle" fontSize="10" fill={MUTED}>{String(h.hora).padStart(2, '0')}h</text>
              )}
            </g>
          )
        })}
      </svg>
      {t.nodo}
    </div>
  )
}

// ── Tabla de campañas con medidores ─────────────────────────────────
function Medidor({ pct, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 6, background: '#f0efec', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ width: 44, textAlign: 'right', fontSize: '0.78rem', color: TINTA, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
    </div>
  )
}

export function TablaCampanas({ porCampana, titulo = 'Campaña', campo = 'campana' }) {
  if (!porCampana.length) return <Vacio alto={90} />
  const th = { padding: '9px 14px', textAlign: 'left', fontSize: '0.74rem', color: TINTA2, fontWeight: 600, whiteSpace: 'nowrap' }
  const td = { padding: '10px 14px', fontSize: '0.82rem', color: TINTA, fontVariantNumeric: 'tabular-nums' }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${RAYA}` }}>
            <th style={th}>{titulo}</th>
            <th style={{ ...th, textAlign: 'right' }}>Enviados</th>
            <th style={{ ...th, textAlign: 'right' }}>Fallidos</th>
            <th style={th}>Entrega</th>
            <th style={th}>Lectura</th>
          </tr>
        </thead>
        <tbody>
          {porCampana.map(c => (
            <tr key={c[campo]} style={{ borderBottom: `1px solid #f3f2ef` }}>
              <td style={{ ...td, fontWeight: 600 }}>{c[campo]}</td>
              <td style={{ ...td, textAlign: 'right' }}>{fmt(c.enviados)}</td>
              <td style={{ ...td, textAlign: 'right', color: c.fallidos ? '#b42318' : MUTED }}>{fmt(c.fallidos)}</td>
              <td style={td}><Medidor pct={c.tasa_entrega} color="#2a78d6" /></td>
              <td style={td}><Medidor pct={c.tasa_lectura} color="#104281" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
