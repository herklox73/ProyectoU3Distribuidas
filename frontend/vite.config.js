import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/whatsapp': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Necesario para que las cookies de sesión de Django funcionen con React
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.headers.cookie) {
              proxyReq.setHeader('Cookie', req.headers.cookie)
            }
          })
        }
      },
      '/admin': 'http://localhost:8000',
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Necesario para el login por sesión (MFA / verificación de correo)
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.headers.cookie) {
              proxyReq.setHeader('Cookie', req.headers.cookie)
            }
          })
        }
      },
    }
  }
})
