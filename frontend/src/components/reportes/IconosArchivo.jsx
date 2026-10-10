// Íconos de tipo de archivo (genéricos: hoja con la esquina doblada y la
// extensión en una etiqueta de color). No son logotipos de ninguna marca.

function Hoja({ color, fondo, etiqueta, children }) {
  return (
    <svg width="26" height="30" viewBox="0 0 26 30" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {/* hoja */}
      <path d="M4 1.5h12.5L23.5 8.5V27a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 27V3A1.5 1.5 0 0 1 4 1.5Z"
        fill={fondo} stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
      {/* esquina doblada */}
      <path d="M16.5 1.5V7a1.5 1.5 0 0 0 1.5 1.5h5.5" fill="#fff" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
      {children}
      {/* etiqueta con la extensión */}
      <rect x="0.5" y="16" width="20" height="9" rx="2" fill={color} />
      <text x="10.5" y="22.6" textAnchor="middle" fontSize="6.6" fontWeight="800" fill="#fff"
        fontFamily="'Figtree Variable', 'Segoe UI', system-ui, sans-serif" letterSpacing="0.3">{etiqueta}</text>
    </svg>
  )
}

export function IconoPDF() {
  return (
    <Hoja color="#d93025" fondo="#fdecea" etiqueta="PDF">
      {/* líneas de texto */}
      <path d="M6 6.5h7M6 9.5h11M6 12.5h11" stroke="#d93025" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
    </Hoja>
  )
}

export function IconoExcel() {
  return (
    <Hoja color="#1d7f45" fondo="#e7f4ec" etiqueta="XLS">
      {/* cuadrícula de hoja de cálculo */}
      <path d="M6 5.5h11v9H6z" fill="none" stroke="#1d7f45" strokeWidth="1" opacity="0.6" />
      <path d="M6 8.5h11M6 11.5h11M10.5 5.5v9" stroke="#1d7f45" strokeWidth="1" opacity="0.6" />
    </Hoja>
  )
}

export function Girando({ color }) {
  return (
    <svg width="26" height="30" viewBox="0 0 26 30" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      <circle cx="13" cy="15" r="8" fill="none" stroke="#e4e3df" strokeWidth="2.5" />
      <path d="M13 7a8 8 0 0 1 8 8" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 13 15" to="360 13 15" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}
