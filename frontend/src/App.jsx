import { useState, useEffect } from 'react'
import { Toaster } from 'sileo'
import { AuthProvider, useAuth } from './context/AuthContext'
import { WaProvider, useWa } from './context/WaContext'
import AuthFlow from './pages/AuthFlow'
import ResetPasswordPage from './pages/ResetPasswordPage'
import InicioPage from './pages/InicioPage'
import ChatPage from './pages/ChatPage'
import ReportesPage from './pages/ReportesPage'
import CampanasPage from './pages/CampanasPage'
import ContactosPage from './pages/ContactosPage'
import MensajesPage from './pages/MensajesPage'
import WhatsAppPage from './pages/WhatsAppPage'
import ImportarContactosPage from './pages/ImportarContactosPage'
import SecuritySettingsPage from './pages/SecuritySettingsPage'
import NotificacionesPage from './pages/NotificacionesPage'
import ColaCorreosPage from './pages/ColaCorreosPage'
import CreditosPage from './pages/CreditosPage'
import PaymentReturnPage from './pages/PaymentReturnPage'
import AsistentePage from './pages/AsistentePage'

// SVG icons para cada módulo
const ICONS = {
  inicio: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  chat: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  campanas: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  ),
  contactos: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  importar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
      <line x1="9" y1="15" x2="15" y2="15"/>
    </svg>
  ),
  mensajes: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  reportes: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  whatsapp: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.95a16 16 0 0 0 6 6l1.06-.94a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  seguridad: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  notificaciones: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v16H4z"/>
      <polyline points="4 4 12 13 20 4"/>
    </svg>
  ),
  cola: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  creditos: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
  asistente: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="7" width="16" height="12" rx="2"/>
      <circle cx="9" cy="13" r="1"/>
      <circle cx="15" cy="13" r="1"/>
      <line x1="12" y1="7" x2="12" y2="3"/>
      <circle cx="12" cy="3" r="1"/>
    </svg>
  ),
}

const NAV = [
  { id: 'inicio',         label: 'Inicio'              },
  { id: 'chat',           label: 'Chat'                },
  { id: 'campanas',       label: 'Campañas'            },
  { id: 'contactos',      label: 'Contactos'           },
  { id: 'importar',       label: 'Importar CSV'        },
  { id: 'mensajes',       label: 'Mensajes'            },
  { id: 'reportes',       label: 'Reportes'            },
  { id: 'whatsapp',       label: 'Conectar WhatsApp'   },
  { id: 'notificaciones', label: 'Notificaciones'      },
  { id: 'cola',           label: 'Cola de correos'     },
  { id: 'seguridad',      label: 'Seguridad (MFA)'     },
  { id: 'creditos',       label: 'Créditos'            },
  { id: 'asistente',      label: 'Asistente IA'        },
]

// El admin (cualquier cuenta marcada is_staff=True en Django) ve TODO
// el menú: lo administrativo (reportes, cola de correos) más todo lo
// operativo, por si necesita probar o ejecutar algo él mismo. Los
// usuarios normales ven las páginas operativas de envío de mensajes
// más "Seguridad (MFA)" -es su propia configuración de cuenta, no algo
// exclusivo de admin- y "Créditos". El rol se decide con user.isStaff,
// validado siempre desde el backend (nunca de la URL ni localStorage).
// Los admins no consumen créditos al ejecutar campañas (ver
// mass_sender/views.py api_campanas_ejecutar), aunque sí puedan ver la
// página.
const USER_NAV_IDS  = ['inicio', 'campanas', 'contactos', 'importar', 'mensajes', 'whatsapp', 'notificaciones', 'seguridad', 'creditos', 'asistente']
const ADMIN_NAV_IDS = NAV.map(n => n.id)

function SidebarStatus({ collapsed }) {
  const { waListo } = useWa()
  if (collapsed) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 4px', padding: '8px 0' }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: waListo ? '#10b981' : '#ef4444',
          boxShadow: waListo ? '0 0 6px #10b981' : 'none',
          display: 'inline-block',
        }} />
      </div>
    )
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '8px 12px', margin: '0 12px 4px',
      borderRadius: 8,
      background: waListo ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)',
      border: `1px solid ${waListo ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.2)'}`,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: waListo ? '#10b981' : '#ef4444',
        boxShadow: waListo ? '0 0 6px #10b981' : 'none',
        animation: waListo ? 'none' : 'pulse 2s infinite',
      }} />
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: waListo ? '#059669' : '#dc2626' }}>
        {waListo ? 'WA Conectado' : 'WA Desconectado'}
      </span>
    </div>
  )
}

function Layout() {
  const { user, logout, loading } = useAuth()
  const [pagina, setPagina]       = useState('inicio')
  const [collapsed, setCollapsed] = useState(false)

  const visibleIds = user?.isStaff ? ADMIN_NAV_IDS : USER_NAV_IDS
  const visibleNav = NAV.filter(n => visibleIds.includes(n.id))

  // Si la página actual no le corresponde a este rol (ej: quedó
  // "inicio" seleccionada pero el usuario es admin, que no tiene esa
  // pestaña), se cambia a la primera página válida para su rol.
  useEffect(() => {
    if (user && !visibleIds.includes(pagina)) {
      setPagina(visibleIds[0])
    }
  }, [user, pagina])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#aaa' }}>
      Cargando...
    </div>
  )

  if (!user) return <AuthFlow />

  const w = collapsed ? 64 : 220

  return (
    <div className="layout">
      <aside style={{
        width: w, minWidth: w, background: '#fff',
        borderRight: '1px solid #e5e7eb',
        display: 'flex', flexDirection: 'column',
        padding: '0', flexShrink: 0,
        transition: 'width 0.22s ease',
        overflow: 'hidden',
      }}>

        {/* Header del sidebar */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '18px 0' : '18px 16px 18px 20px',
          borderBottom: '1px solid #e5e7eb',
          minHeight: 60,
        }}>
          {!collapsed && (
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a2e', whiteSpace: 'nowrap' }}>
              Mass<span style={{ color: '#25d366' }}>Send</span>
            </span>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expandir menú' : 'Contraer menú'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#6b7280', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.background = '#f3f4f6'}
            onMouseOut={e => e.currentTarget.style.background = 'none'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed
                ? <><polyline points="9 18 15 12 9 6"/></>
                : <><polyline points="15 18 9 12 15 6"/></>
              }
            </svg>
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ display: 'flex', flexDirection: 'column', padding: '12px 0', gap: 2, flex: 1, overflowY: 'auto' }}>
          {visibleNav.map(n => (
            <button
              key={n.id}
              title={collapsed ? n.label : ''}
              onClick={() => setPagina(n.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: collapsed ? 0 : 10,
                padding: collapsed ? '11px 0' : '10px 20px',
                color: pagina === n.id ? '#25d366' : '#374151',
                background: pagina === n.id ? '#f0fdf4' : 'none',
                borderTop: 'none',
                borderRight: 'none',
                borderBottom: 'none',
                borderLeft: pagina === n.id ? '3px solid #25d366' : '3px solid transparent',
                fontWeight: pagina === n.id ? 600 : 400,
                fontSize: '0.9rem',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                transition: 'background 0.15s, color 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseOver={e => { if (pagina !== n.id) e.currentTarget.style.background = '#f9fafb' }}
              onMouseOut={e => { if (pagina !== n.id) e.currentTarget.style.background = 'none' }}
            >
              <span style={{ flexShrink: 0 }}>{ICONS[n.id]}</span>
              {!collapsed && <span>{n.label}</span>}
            </button>
          ))}
        </nav>

        {/* Estado WA */}
        <SidebarStatus collapsed={collapsed} />

        {/* Footer usuario */}
        <div style={{
          padding: collapsed ? '12px 0' : '12px 16px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex', flexDirection: 'column',
          alignItems: collapsed ? 'center' : 'stretch',
          gap: 8,
        }}>
          {!collapsed && (
            <div style={{ fontSize: '0.74rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.username || user.email}
            </div>
          )}
          <button
            onClick={logout}
            title={collapsed ? 'Cerrar sesión' : ''}
            style={{
              width: collapsed ? 38 : '100%',
              height: collapsed ? 38 : 'auto',
              padding: collapsed ? 0 : '8px',
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: 7,
              color: '#374151',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'background 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.background = '#e5e7eb'}
            onMouseOut={e => e.currentTarget.style.background = '#f3f4f6'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {!collapsed && 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      <main className="main">
        {/* Cada página solo se monta si el rol del usuario la tiene
            habilitada (visibleIds); así una cuenta normal nunca llega a
            pedir datos de endpoints solo-admin (ej. la cola de correos),
            y viceversa. */}
        {visibleIds.includes('inicio')         && <div style={{ display: pagina === 'inicio'    ? 'contents' : 'none' }}><InicioPage onNavegar={setPagina} /></div>}
        {visibleIds.includes('chat')           && <div style={{ display: pagina === 'chat'      ? 'contents' : 'none' }}><ChatPage /></div>}
        {visibleIds.includes('campanas')       && <div style={{ display: pagina === 'campanas'  ? 'contents' : 'none' }}><CampanasPage /></div>}
        {visibleIds.includes('contactos')      && <div style={{ display: pagina === 'contactos' ? 'contents' : 'none' }}><ContactosPage /></div>}
        {visibleIds.includes('importar')       && <div style={{ display: pagina === 'importar'  ? 'contents' : 'none' }}><ImportarContactosPage /></div>}
        {visibleIds.includes('mensajes')       && <div style={{ display: pagina === 'mensajes'  ? 'contents' : 'none' }}><MensajesPage /></div>}
        {visibleIds.includes('reportes')       && <div style={{ display: pagina === 'reportes'  ? 'contents' : 'none' }}><ReportesPage /></div>}
        {visibleIds.includes('whatsapp')       && <div style={{ display: pagina === 'whatsapp'  ? 'contents' : 'none' }}><WhatsAppPage /></div>}
        {visibleIds.includes('notificaciones') && <div style={{ display: pagina === 'notificaciones' ? 'contents' : 'none' }}><NotificacionesPage /></div>}
        {visibleIds.includes('cola')           && <div style={{ display: pagina === 'cola'      ? 'contents' : 'none' }}><ColaCorreosPage /></div>}
        {visibleIds.includes('seguridad')      && <div style={{ display: pagina === 'seguridad' ? 'contents' : 'none' }}><SecuritySettingsPage /></div>}
        {visibleIds.includes('creditos')       && <div style={{ display: pagina === 'creditos'  ? 'contents' : 'none' }}><CreditosPage /></div>}
        {visibleIds.includes('asistente')      && <div style={{ display: pagina === 'asistente' ? 'contents' : 'none' }}><AsistentePage /></div>}
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
  // El enlace de recuperación de contraseña que llega por Gmail apunta
  // directo a esta ruta (?token=...&email=...). Se renderiza aparte,
  // sin exigir sesión, igual que hacía /reset-password en la práctica
  // de Node (que servía una página estática independiente).
  if (window.location.pathname === '/reset-password') {
    return <ResetPasswordPage />
  }

  // PayPal/PayPhone redirigen de vuelta acá tras el pago (ver
  // application_context.return_url en paypal_gateway.py y la
  // redirección configurada en el panel de PayPhone). Se muestra
  // fuera del Layout normal, igual que /reset-password.
  if (window.location.pathname === '/billing/return') {
    return <PaymentReturnPage onGoToDashboard={() => { window.location.href = '/' }} />
  }

  return (
    <AuthProvider>
      <WaProvider>
        <Layout />
        <Toaster position="bottom-center" />
      </WaProvider>
    </AuthProvider>
  )
}
