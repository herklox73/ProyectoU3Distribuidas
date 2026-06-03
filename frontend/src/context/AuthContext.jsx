import { createContext, useContext, useState, useEffect } from 'react'
import axios from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/whatsapp/api/auth/me/')
      .then(r => { if (r.data.authenticated) setUser(r.data.user) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const login = async (username, password) => {
    const r = await axios.post('/whatsapp/api/auth/login/', { username, password })
    if (r.data.success) setUser(r.data.user)
    return r.data
  }

  const logout = async () => {
    await axios.post('/whatsapp/api/auth/logout/')
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
