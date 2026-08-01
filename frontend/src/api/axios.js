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

// Interceptor de respuestas: si el backend responde 401 (sesión de
// Django caducada o JWT vencido), se emite un evento global para que
// AuthContext muestre el modal de "sesión expirada" en vez de dejar
// al usuario viendo errores sin explicación.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('session-expired'))
    }
    return Promise.reject(error)
  }
)

// Varias páginas usan fetch() en lugar de axios, así que también se
// envuelve fetch globalmente: cualquier 401 del backend dispara el
// mismo evento de sesión expirada, sin importar cómo se hizo la llamada.
const _fetchOriginal = window.fetch.bind(window)
window.fetch = async (...args) => {
  const response = await _fetchOriginal(...args)
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('session-expired'))
  }
  return response
}

export default axios
