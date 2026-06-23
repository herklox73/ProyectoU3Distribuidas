import { createContext, useContext, useState, useEffect } from 'react'
import axios from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Revisar si ya hay un JWT de Google guardado
    const jwt = localStorage.getItem('jwt_token')
    if (jwt) {
      const nombre = localStorage.getItem('usuario_nombre') || ''
      const foto   = localStorage.getItem('usuario_foto') || ''
      const email  = localStorage.getItem('usuario_email') || ''
      setUser({ username: email, nombre, foto, via_google: true })
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
      setUser({
        username: googleData.email,
        nombre: googleData.nombre,
        foto: googleData.foto,
        via_google: true,
      })
      return { success: true }
    }
    // Login normal con usuario/contraseña
    const r = await axios.post('/whatsapp/api/auth/login/', { username, password })
    if (r.data.success) setUser(r.data.user)
    return r.data
  }

  const logout = async () => {
    localStorage.removeItem('jwt_token')
    localStorage.removeItem('usuario_nombre')
    localStorage.removeItem('usuario_foto')
    localStorage.removeItem('usuario_email')
    await axios.post('/whatsapp/api/auth/logout/').catch(() => {})
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
