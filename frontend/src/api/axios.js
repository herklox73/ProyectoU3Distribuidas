import axios from 'axios'

// Enviar cookies de sesión Django (login normal)
axios.defaults.withCredentials = true

// Interceptor: si hay JWT en localStorage (login con Google),
// lo agrega automáticamente en cada petición como Bearer token
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt_token')
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

export default axios
