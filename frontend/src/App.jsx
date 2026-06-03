import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { WaProvider, useWa } from './context/WaContext'
import LoginPage from './pages/LoginPage'
import ChatPage from './pages/ChatPage'
import ReportesPage from './pages/ReportesPage'
import CampanasPage from './pages/CampanasPage'
import ContactosPage from './pages/ContactosPage'
import MensajesPage from './pages/MensajesPage'
import WhatsAppPage from './pages/WhatsAppPage'
import ImportarContactosPage from './pages/ImportarContactosPage'

const NAV = [
  { id: 'chat',      label: 'Chat',              icon: '💬' },
  { id: 'campanas',  label: 'Campañas',           icon: '📢' },
  { id: 'contactos', label: 'Contactos',          icon: '👥' },
  { id: 'importar',  label: 'Importar CSV',       icon: '📥' },
  { id: 'mensajes',  label: 'Mensajes',           icon: '📨' },
  { id: 'reportes',  label: 'Reportes',           icon: '📊' },
  { id: 'whatsapp',  label: 'Conectar WhatsApp',  icon: '🔗' },
]

function SidebarStatus() {
  const { waListo } = useWa()
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '8px 16px', margin: '0 12px 4px',
      borderRadius: 8,
      background: waListo ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
      border: `1px solid ${waListo ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)'}`,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: waListo ? '#10b981' : '#ef4444',
        boxShadow: waListo ? '0 0 6px #10b981' : 'none',
        animation: waListo ? 'none' : 'pulse 2s infinite',
      }} />
      <span style={{ fontSize: '0.73rem', fontWeight: 600, color: waListo ? '#6ee7b7' : '#fca5a5' }}>
        {waListo ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
      </span>
    </div>
  )
}

function Layout() {
  const { user, logout, loading } = useAuth()
  const [pagina, setPagina] = useState('chat')

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#aaa' }}>
      Cargando...
    </div>
  )

  if (!user) return <LoginPage />

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">Mass<span>Send</span></div>

        <nav className="sidebar-nav">
          {NAV.map(n => (
            <button
              key={n.id}
              className={`nav-item ${pagina === n.id ? 'active' : ''}`}
              onClick={() => setPagina(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>

        {/* Indicador de conexión global — siempre visible */}
        <SidebarStatus />

        <div style={{ padding: '12px 20px', borderTop: '1px solid #ffffff15' }}>
          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 8 }}>
            {user.username}
          </div>
          <button
            onClick={logout}
            style={{
              width: '100%', padding: '8px', background: '#ffffff10',
              border: '1px solid #ffffff20', borderRadius: 7, color: '#aaa',
              cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
              transition: 'background 0.15s'
            }}
            onMouseOver={e => e.target.style.background = '#ffffff20'}
            onMouseOut={e => e.target.style.background = '#ffffff10'}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main">
        {/*
          SPA real: todas las páginas están SIEMPRE montadas.
          Solo se ocultan con display:none al no estar activas.
          Esto evita que el estado se resetee al navegar.
        */}
        <div style={{ display: pagina === 'chat'      ? 'contents' : 'none' }}><ChatPage /></div>
        <div style={{ display: pagina === 'campanas'  ? 'contents' : 'none' }}><CampanasPage /></div>
        <div style={{ display: pagina === 'contactos' ? 'contents' : 'none' }}><ContactosPage /></div>
        <div style={{ display: pagina === 'importar'  ? 'contents' : 'none' }}><ImportarContactosPage /></div>
        <div style={{ display: pagina === 'mensajes'  ? 'contents' : 'none' }}><MensajesPage /></div>
        <div style={{ display: pagina === 'reportes'  ? 'contents' : 'none' }}><ReportesPage /></div>
        <div style={{ display: pagina === 'whatsapp'  ? 'contents' : 'none' }}><WhatsAppPage /></div>
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <WaProvider>
        <Layout />
      </WaProvider>
    </AuthProvider>
  )
}
