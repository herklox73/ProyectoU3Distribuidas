import { useState } from 'react'
import AuthCard from '../components/auth/AuthCard'
import FormField from '../components/auth/FormField'
import AlertBox from '../components/auth/AlertBox'
import PrimaryButton from '../components/auth/PrimaryButton'
import LinkButton from '../components/auth/LinkButton'
import { registerAccount } from '../api/emailAuth'

// Paso 1 del flujo de verificación de correo: crear la cuenta.
// Al terminar, avisa al orquestador (AuthFlow) para pasar a la
// pantalla de "ingresa tu código" con el correo ya precargado.
export default function RegisterPage({ onRegistered, onGoToLogin }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await registerAccount(name, email, password)
      onRegistered(email)
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo completar el registro.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title="Crear cuenta" subtitle="Te enviaremos un código de verificación por correo">
      <form onSubmit={handleSubmit}>
        <FormField label="Nombre completo" value={name} onChange={setName} autoFocus />
        <FormField label="Correo electrónico" type="email" value={email} onChange={setEmail} />
        <FormField label="Contraseña (mínimo 6 caracteres)" type="password" value={password} onChange={setPassword} />
        <AlertBox>{error}</AlertBox>
        <PrimaryButton loading={loading}>
          {loading ? 'Creando cuenta...' : 'Registrarme'}
        </PrimaryButton>
      </form>
      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <LinkButton onClick={onGoToLogin}>¿Ya tienes cuenta? Inicia sesión</LinkButton>
      </div>
    </AuthCard>
  )
}
