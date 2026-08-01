// frontend/src/pages/InicioPage.jsx
import { useAuth } from '../context/AuthContext'
import { useWa } from '../context/WaContext'

const MODULOS = [
  {
    id: 'chat',
    titulo: 'Chat',
    desc: 'Conversaciones en tiempo real con tus contactos de WhatsApp.',
    color: '#25d366',
    bg: 'rgba(37,211,102,0.08)',
  },
  {
    id: 'campanas',
    titulo: 'Campañas',
    desc: 'Crea y ejecuta campañas de mensajes masivos personalizados.',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
  },
  {
    id: 'contactos',
    titulo: 'Contactos',
    desc: 'Administra tu lista de contactos y gestiona grupos.',
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.08)',
  },
  {
    id: 'importar',
    titulo: 'Importar CSV',
    desc: 'Importa contactos masivamente desde un archivo CSV.',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
  },
  {
    id: 'mensajes',
    titulo: 'Mensajes',
    desc: 'Revisa el historial completo de mensajes enviados.',
    color: '#ec4899',
    bg: 'rgba(236,72,153,0.08)',
  },
  {
    id: 'reportes',
    titulo: 'Reportes',
    desc: 'Estadísticas de entrega, lecturas y fallos por campaña.',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.08)',
  },
  {
    id: 'whatsapp',
    titulo: 'Conectar WhatsApp',
    desc: 'Escanea el código QR para vincular tu número de WhatsApp.',
    color: '#25d366',
    bg: 'rgba(37,211,102,0.06)',
  },
  {
    id: 'creditos',
    titulo: 'Créditos',
    desc: 'Compra créditos con PayPal o PayPhone para enviar campañas.',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.1)',
  },
]

export default function InicioPage({ onNavegar }) {
  const { user } = useAuth()
  const { waListo } = useWa()

  const nombre = user?.nombre || user?.username || 'Usuario'
  const foto   = user?.foto || null
  const hora   = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div style={s.page}>
      {/* Header de bienvenida */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          {foto
            ? <img src={foto} alt="avatar" style={s.avatar} />
            : <div style={s.avatarFallback}>{nombre[0]?.toUpperCase()}</div>
          }
          <div>
            <p style={s.saludo}>{saludo},</p>
            <h1 style={s.nombre}>{nombre}</h1>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 20,
          background: waListo ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${waListo ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)'}`,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: waListo ? '#10b981' : '#ef4444',
            boxShadow: waListo ? '0 0 6px #10b981' : 'none',
          }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: waListo ? '#10b981' : '#ef4444' }}>
            {waListo ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
          </span>
        </div>
      </div>

      <p style={s.subtitulo}>¿Qué quieres hacer hoy?</p>

      {/* Grid de módulos */}
      <div style={s.grid}>
        {MODULOS.map(m => (
          <button
            key={m.id}
            style={{ ...s.card, background: m.bg, borderColor: m.color + '33' }}
            onClick={() => onNavegar(m.id)}
            onMouseOver={e => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = `0 8px 24px ${m.color}22`
            }}
            onMouseOut={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <h3 style={{ ...s.cardTitulo, color: m.color }}>{m.titulo}</h3>
            <p style={s.cardDesc}>{m.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

const s = {
  page: {
    flex: 1,
    overflowY: 'auto',
    padding: '36px 40px',
    background: '#f8fafc',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 16,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2px solid #25d366',
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: '#25d366',
    color: '#fff',
    fontSize: '1.4rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saludo: {
    fontSize: '0.85rem',
    color: '#888',
    margin: 0,
  },
  nombre: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#1a1a2e',
    margin: 0,
  },
  subtitulo: {
    fontSize: '0.95rem',
    color: '#666',
    marginBottom: 28,
    marginTop: 20,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 20,
  },
  card: {
    border: '1px solid',
    borderRadius: 16,
    padding: '24px 20px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    background: 'transparent',
  },
  cardTitulo: {
    fontSize: '1rem',
    fontWeight: 700,
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: '0.82rem',
    color: '#666',
    lineHeight: 1.5,
    margin: 0,
  },
}
