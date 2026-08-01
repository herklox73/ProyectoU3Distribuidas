import { useState } from 'react'
import AuthCard from '../components/auth/AuthCard'
import FormField from '../components/auth/FormField'
import AlertBox from '../components/auth/AlertBox'
import PrimaryButton from '../components/auth/PrimaryButton'
import LinkButton from '../components/auth/LinkButton'
import { useAuth } from '../context/AuthContext'

// Segundo factor del login (MFA). Reutilizable para las dos variantes
// que existen: login normal (usuario/contraseña) y login con Google.
// Por defecto usa el flujo normal (verifyMfaAndLogin/cancelMfaChallenge
// del contexto); si se pasan `onVerify`/`onCancelChallenge`, se usan
// esos en su lugar (caso del login con Google).
export default function MfaLoginPage({ email, onCancel, onVerify, onCancelChallenge }) {
  const { verifyMfaAndLogin, cancelMfaChallenge } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const verify = onVerify || verifyMfaAndLogin
  const cancelChallenge = onCancelChallenge || cancelMfaChallenge

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await verify(code)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Código incorrecto.')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    cancelChallenge()
    onCancel?.()
  }

  return (
    <AuthCard title="Verificación en dos pasos" subtitle={email}>
      <form onSubmit={handleSubmit}>
        <FormField label="Código del autenticador" value={code} onChange={setCode} placeholder="123456" autoFocus />
        <AlertBox>{error}</AlertBox>
        <PrimaryButton loading={loading}>
          {loading ? 'Verificando...' : 'Confirmar'}
        </PrimaryButton>
      </form>
      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <LinkButton onClick={handleCancel}>Cancelar</LinkButton>
      </div>
    </AuthCard>
  )
}
