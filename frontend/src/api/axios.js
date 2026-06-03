import axios from 'axios'

// withCredentials: true es esencial para que las cookies de sesión
// de Django se envíen en cada petición desde React
axios.defaults.withCredentials = true

export default axios
