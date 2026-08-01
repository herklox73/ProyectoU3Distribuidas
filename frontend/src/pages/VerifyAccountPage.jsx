import { useState } from 'react'
import AuthCard from '../components/auth/AuthCard'
import FormField from '../components/auth/FormField'
import AlertBox from '../components/auth/AlertBox'
import PrimaryButton from '../components/auth/PrimaryButton'
import LinkButton from '../components/auth/LinkButton'
import { verifyAccount, resendVerificationCode } from '../api/emailAuth'

// Paso 2: el usuario copia el código de 6 dígitos que le llegó a Gmail.
export default function VerifyAccountPage({ email: initialEmail, onVerified, onGoToLogin }) {
  const [email, setEmail] = useState(initialEmail || '')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      await verifyAccount(email, code)
      onVerified(email)
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo verificar la cuenta.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setError('')
    setInfo('')
    setResending(true)
    try {
      await resendVerificationCode(email)
      setInfo('Se envió un nuevo código a tu correo.')
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo reenviar el código.')
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthCard title="Verifica tu correo" subtitle="Ingresa el código de 6 dígitos que te enviamos">
      <form onSubmit={handleSubmit}>
        <FormField label="Correo electrónico" type="email" value={email} onChange={setEmail} />
        <FormField label="Código de verificación" value={code} onChange={setCode} placeholder="123456" />
        <AlertBox>{error}</AlertBox>
        <AlertBox type="success">{info}</AlertBox>
        <PrimaryButton loading={loading}>
          {loading ? 'Verificando...' : 'Activar cuenta'}
        </PrimaryButton>
      </form>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
        <LinkButton onClick={handleResend}>{resending ? 'Enviando...' : 'Reenviar código'}</LinkButton>
        <LinkButton onClick={onGoToLogin}>Volver a iniciar sesión</LinkButton>
      </div>
    </AuthCard>
  )
}
