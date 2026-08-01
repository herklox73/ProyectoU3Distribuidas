import { useState } from 'react'
import AuthCard from '../components/auth/AuthCard'
import FormField from '../components/auth/FormField'
import AlertBox from '../components/auth/AlertBox'
import PrimaryButton from '../components/auth/PrimaryButton'
import LinkButton from '../components/auth/LinkButton'
import { requestAccountRecovery } from '../api/emailAuth'

export default function ForgotPasswordPage({ onGoToLogin }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await requestAccountRecovery(email)
      setSent(true)
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo procesar la solicitud.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title="Recuperar contraseña" subtitle="Te enviaremos un enlace a tu correo">
      {sent ? (
        <>
          <AlertBox type="success">
            Revisa tu bandeja de entrada. El enlace de recuperación vence en 15 minutos.
          </AlertBox>
          <PrimaryButton onClick={onGoToLogin} type="button">Volver a iniciar sesión</PrimaryButton>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <FormField label="Correo electrónico" type="email" value={email} onChange={setEmail} autoFocus />
          <AlertBox>{error}</AlertBox>
          <PrimaryButton loading={loading}>
            {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
          </PrimaryButton>
        </form>
      )}
      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <LinkButton onClick={onGoToLogin}>Volver a iniciar sesión</LinkButton>
      </div>
    </AuthCard>
  )
}
