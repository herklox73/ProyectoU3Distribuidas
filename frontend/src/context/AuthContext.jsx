import { createContext, useContext, useState, useEffect } from 'react'
import axios from '../api/axios'
import { loginStep1, loginStep2, googleMfaVerify } from '../api/emailAuth'

const AuthContext = createContext(null)

// Trae datos autoritativos del usuario autenticado por JWT (Google),
// incluyendo isStaff (rol de administrador). Nunca se confía en un
// isStaff que venga solo de la URL o de localStorage: siempre se
// valida contra el backend, que es quien de verdad sabe el rol.
const fetchGooglePerfil = async () => {
  try {
    const r = await axios.get('/auth/perfil/')
    return r.data
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  // Correo que está esperando el segundo factor (MFA) del login
  // normal (usuario/contraseña).
  const [mfaChallengeEmail, setMfaChallengeEmail] = useState(null)
  // Correo que está esperando el segundo factor (MFA) del login con
  // Google (flujo distinto porque termina emitiendo un JWT, no abre
  // sesión de Django).
  const [googleMfaEmail, setGoogleMfaEmail] = useState(null)

  useEffect(() => {
    // Revisar si ya hay un JWT de Google guardado
    const jwt = localStorage.getItem('jwt_token')
    if (jwt) {
      const nombre = localStorage.getItem('usuario_nombre') || ''
      const foto   = localStorage.getItem('usuario_foto') || ''
      const email  = localStorage.getItem('usuario_email') || ''
      setUser({ username: email, nombre, foto, via_google: true, isStaff: false })
      // Se valida el JWT contra el backend: si ya venció, se limpia la
      // sesión y se obliga a iniciar sesión de nuevo (no se deja al
      // usuario en una app "fantasma" donde todo da error 401).
      fetchGooglePerfil().then(perfil => {
        if (perfil) {
          setUser(u => ({ ...u, isStaff: Boolean(perfil.isStaff) }))
        } else {
          localStorage.removeItem('jwt_token')
          localStorage.removeItem('usuario_nombre')
          localStorage.removeItem('usuario_foto')
          localStorage.removeItem('usuario_email')
          setUser(null)
        }
      })
      setLoading(false)
      return
    }
    // Si no hay JWT, verificar sesión Django normal
    axios.get('/whatsapp/api/auth/me/')
      .then(r => { if (r.data.authenticated) setUser(r.data.user) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const login = async (username, password, googleData = null) => {
    // Login via Google OAuth (googleData viene del callback)
    if (googleData) {
      const perfil = await fetchGooglePerfil()
      setUser({
        username: googleData.email,
        nombre: perfil?.nombre || googleData.nombre,
        foto: perfil?.foto || googleData.foto,
        isStaff: Boolean(perfil?.isStaff),
        via_google: true,
      })
      return { success: true }
    }

    // Login normal (usuario/contraseña), con soporte de MFA: primero
    // se valida la contraseña; si la cuenta tiene 2FA activo, todavía
    // no se abre sesión y se pide el código del autenticador.
    try {
      const data = await loginStep1(username, password)
      if (data.requiresMfa) {
        setMfaChallengeEmail(data.email)
        return { success: false, requiresMfa: true, email: data.email }
      }
      setUser(data.user)
      return { success: true }
    } catch (err) {
      return { success: false, error: err?.response?.data?.detail || 'Credenciales incorrectas' }
    }
  }

  // Completa el login cuando la cuenta tiene MFA activo (usuario/contraseña).
  const verifyMfaAndLogin = async (code) => {
    const data = await loginStep2(mfaChallengeEmail, code)
    setUser(data.user)
    setMfaChallengeEmail(null)
    return data
  }

  const cancelMfaChallenge = () => setMfaChallengeEmail(null)

  // Se llama cuando google_callback redirige con ?mfa_required=1&email=...
  const requireGoogleMfa = (email) => setGoogleMfaEmail(email)

  const cancelGoogleMfaChallenge = () => setGoogleMfaEmail(null)

  // Completa el login con Google cuando la cuenta tiene MFA activo.
  const verifyGoogleMfaAndLogin = async (code) => {
    const data = await googleMfaVerify(googleMfaEmail, code)
    localStorage.setItem('jwt_token', data.token)
    localStorage.setItem('usuario_nombre', data.nombre || data.email || 'Usuario')
    localStorage.setItem('usuario_foto', data.foto || '')
    localStorage.setItem('usuario_email', data.email || '')
    setUser({
      username: data.email,
      nombre: data.nombre,
      foto: data.foto,
      isStaff: Boolean(data.isStaff),
      via_google: true,
    })
    setGoogleMfaEmail(null)
    return data
  }

  const logout = async () => {
    localStorage.removeItem('jwt_token')
    localStorage.removeItem('usuario_nombre')
    localStorage.removeItem('usuario_foto')
    localStorage.removeItem('usuario_email')
    await axios.post('/whatsapp/api/auth/logout/').catch(() => {})
    setUser(null)
  }

  // ── Sesión expirada ─────────────────────────────────────────────
  // El interceptor de axios emite 'session-expired' ante cualquier 401.
  // Solo se muestra el modal si el usuario TENÍA sesión iniciada (así los
  // 401 normales del formulario de login no lo disparan).
  const [sessionExpired, setSessionExpired] = useState(false)
  useEffect(() => {
    const onExpired = () => {
      if (user) setSessionExpired(true)
    }
    window.addEventListener('session-expired', onExpired)
    return () => window.removeEventListener('session-expired', onExpired)
  }, [user])

  const handleSessionExpired = () => {
    localStorage.removeItem('jwt_token')
    localStorage.removeItem('usuario_nombre')
    localStorage.removeItem('usuario_foto')
    localStorage.removeItem('usuario_email')
    setSessionExpired(false)
    setUser(null) // vuelve a mostrar la pantalla de login
  }

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout,
      mfaChallengeEmail, verifyMfaAndLogin, cancelMfaChallenge,
      googleMfaEmail, requireGoogleMfa, verifyGoogleMfaAndLogin, cancelGoogleMfaChallenge,
    }}>
      {children}
      {sessionExpired && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: '28px 32px',
            maxWidth: 380, width: '90%', textAlign: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          }}>
            <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>⏰</div>
            <h3 style={{ margin: '0 0 8px', color: '#1a1a2e' }}>Tu sesión ha expirado</h3>
            <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Por seguridad, la sesión se cierra tras un tiempo de inactividad.
              Vuelve a iniciar sesión para continuar donde estabas.
            </p>
            <button
              onClick={handleSessionExpired}
              style={{
                width: '100%', padding: '12px 18px', background: '#25d366',
                color: '#fff', border: 'none', borderRadius: 10,
                fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
              }}
            >
              Iniciar sesión de nuevo
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
