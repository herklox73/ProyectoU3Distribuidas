import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login }               = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  // Capturar JWT que llega desde Google OAuth en la URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token  = params.get('token')
    const nombre = params.get('nombre')
    const foto   = params.get('foto')
    const email  = params.get('email')
    const err    = params.get('error')

    if (err) {
      setError('Error al autenticar con Google. Intenta de nuevo.')
      window.history.replaceState({}, '', window.location.pathname)
      return
    }

    if (token) {
      localStorage.setItem('jwt_token', token)
      localStorage.setItem('usuario_nombre', nombre || email || 'Usuario')
      localStorage.setItem('usuario_foto', foto || '')
      localStorage.setItem('usuario_email', email || '')
      window.history.replaceState({}, '', window.location.pathname)
      login(null, null, { token, nombre, foto, email, via_google: true })
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(username, password)
      if (!result.success) setError(result.error || 'Credenciales incorrectas')
    } catch {
      setError('Error de conexión con el servidor')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = () => {
    window.location.href = 'http://localhost:8000/auth/google/'
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f0f2f5'
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '40px 36px',
        width: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.08)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1a1a2e', margin: 0 }}>
            Mass<span style={{ color: '#25d366' }}>Send</span>
          </h1>
          <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 6 }}>
            Sistema de Mensajería WhatsApp
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb',
                borderRadius: 8, fontSize: '0.9rem', outline: 'none',
                boxSizing: 'border-box', transition: 'border-color 0.2s'
              }}
              onFocus={e => e.target.style.borderColor = '#25d366'}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb',
                borderRadius: 8, fontSize: '0.9rem', outline: 'none',
                boxSizing: 'border-box', transition: 'border-color 0.2s'
              }}
              onFocus={e => e.target.style.borderColor = '#25d366'}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>

          {error && (
            <div style={{
              background: '#fee2e2', color: '#991b1b', padding: '10px 14px',
              borderRadius: 8, fontSize: '0.82rem', marginBottom: 16
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px', background: loading ? '#9ca3af' : '#25d366',
              color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700,
              fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

        {/* Separador */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>o</span>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        </div>

        {/* Botón Google */}
        <button
          onClick={handleGoogle}
          style={{
            width: '100%', padding: '11px', background: '#fff',
            border: '1.5px solid #e5e7eb', borderRadius: 8, fontWeight: 600,
            fontSize: '0.9rem', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: 10,
            color: '#374151', transition: 'border-color 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.borderColor = '#25d366'}
          onMouseOut={e => e.currentTarget.style.borderColor = '#e5e7eb'}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continuar con Google
        </button>
      </div>
    </div>
  )
}
