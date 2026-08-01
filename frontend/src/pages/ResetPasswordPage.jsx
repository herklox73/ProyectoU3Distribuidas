import { useEffect, useState } from 'react'
import AuthCard from '../components/auth/AuthCard'
import FormField from '../components/auth/FormField'
import AlertBox from '../components/auth/AlertBox'
import PrimaryButton from '../components/auth/PrimaryButton'
import { validateRecoveryToken, resetPassword } from '../api/emailAuth'

// Pantalla a la que apunta el enlace del correo de recuperación:
// /reset-password?token=...&email=...
// Se renderiza de forma independiente en App.jsx cuando la URL es
// exactamente esa ruta (sin necesidad de agregar react-router).
export default function ResetPasswordPage() {
  const params = new URLSearchParams(window.location.search)
  const email = params.get('email') || ''
  const token = params.get('token') || ''

  const [checking, setChecking] = useState(true)
  const [validToken, setValidToken] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!email || !token) {
      setError('El enlace de recuperación no es válido.')
      setChecking(false)
      return
    }
    validateRecoveryToken(email, token)
      .then(() => setValidToken(true))
      .catch(err => setError(err?.response?.data?.detail || 'El enlace venció o no es válido.'))
      .finally(() => setChecking(false))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setLoading(true)
    try {
      await resetPassword(email, token, password)
      setDone(true)
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo cambiar la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title="Restablecer contraseña">
      {checking && <p style={{ textAlign: 'center', color: '#888' }}>Validando enlace...</p>}

      {!checking && done && (
        <AlertBox type="success">
          Contraseña actualizada. Ya puedes cerrar esta pestaña e iniciar sesión.
        </AlertBox>
      )}

      {!checking && !done && validToken && (
        <form onSubmit={handleSubmit}>
          <FormField label="Nueva contraseña" type="password" value={password} onChange={setPassword} autoFocus />
          <FormField label="Confirmar contraseña" type="password" value={confirm} onChange={setConfirm} />
          <AlertBox>{error}</AlertBox>
          <PrimaryButton loading={loading}>
            {loading ? 'Guardando...' : 'Cambiar contraseña'}
          </PrimaryButton>
        </form>
      )}

      {!checking && !done && !validToken && <AlertBox>{error}</AlertBox>}
    </AuthCard>
  )
}
