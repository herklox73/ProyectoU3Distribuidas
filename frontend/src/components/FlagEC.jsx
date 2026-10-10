// Bandera de Ecuador en SVG. Se dibuja en vez de usar el emoji 🇪🇨 porque
// Windows no tiene emojis de banderas y lo muestra como las letras "EC".
// Franjas oficiales: amarillo (mitad superior), azul y rojo (un cuarto cada
// una), con el escudo simplificado al centro para distinguirla de Colombia.
export default function FlagEC({ width = 22, title = 'Ecuador' }) {
  const height = Math.round(width * 2 / 3)
  return (
    <svg width={width} height={height} viewBox="0 0 30 20" role="img" aria-label={title}
      style={{ display: 'inline-block', flexShrink: 0, borderRadius: 2, boxShadow: '0 0 0 0.5px rgba(0,0,0,0.25)' }}>
      <title>{title}</title>
      <rect width="30" height="10" fill="#FFDD00" />
      <rect y="10" width="30" height="5" fill="#034EA2" />
      <rect y="15" width="30" height="5" fill="#ED1C24" />
      <ellipse cx="15" cy="10" rx="2.6" ry="3.2" fill="#7FC4EC" stroke="#8A5A1C" strokeWidth="0.9" />
      <path d="M12.2 6.9 Q15 5.2 17.8 6.9" fill="none" stroke="#3B2A14" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  )
}
