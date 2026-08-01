import { useEffect, useState } from 'react'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'
import VerifyAccountPage from './VerifyAccountPage'
import ForgotPasswordPage from './ForgotPasswordPage'
import MfaLoginPage from './MfaLoginPage'
import { useAuth } from '../context/AuthContext'

// Orquestador de las pantallas de "no autenticado": login, registro,
// verificación de código, recuperación de contraseña y segundo factor
// (MFA, tanto del login normal como del login con Google). Cada
// pantalla solo sabe hacer su propia tarea (SRP); AuthFlow es el único
// que decide cuál mostrar y qué datos pasarle.
export default function AuthFlow() {
  const { googleMfaEmail, verifyGoogleMfaAndLogin, cancelGoogleMfaChallenge } = useAuth()
  const [screen, setScreen] = useState('login') // login | register | verify | forgot | mfa | google-mfa
  const [pendingEmail, setPendingEmail] = useState('')
  const [mfaEmail, setMfaEmail] = useState('')

  // google_callback redirigió pidiendo el segundo factor: AuthContext
  // guarda ese estado (googleMfaEmail) y aquí solo se reacciona
  // cambiando de pantalla.
  useEffect(() => {
    if (googleMfaEmail) setScreen('google-mfa')
  }, [googleMfaEmail])

  const goToLogin = () => setScreen('login')

  switch (screen) {
    case 'register':
      return (
        <RegisterPage
          onRegistered={(email) => { setPendingEmail(email); setScreen('verify') }}
          onGoToLogin={goToLogin}
        />
      )

    case 'verify':
      return (
        <VerifyAccountPage
          email={pendingEmail}
          onVerified={goToLogin}
          onGoToLogin={goToLogin}
        />
      )

    case 'forgot':
      return <ForgotPasswordPage onGoToLogin={goToLogin} />

    case 'mfa':
      return <MfaLoginPage email={mfaEmail} onCancel={goToLogin} />

    case 'google-mfa':
      return (
        <MfaLoginPage
          email={googleMfaEmail}
          onVerify={verifyGoogleMfaAndLogin}
          onCancelChallenge={cancelGoogleMfaChallenge}
          onCancel={goToLogin}
        />
      )

    default:
      return (
        <LoginPage
          onRequireMfa={(email) => { setMfaEmail(email); setScreen('mfa') }}
          onGoToRegister={() => setScreen('register')}
          onGoToForgotPassword={() => setScreen('forgot')}
        />
      )
  }
}
