import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { startMfaSetup, confirmMfaSetup, getMfaStatus, disableMfa } from '../api/emailAuth'

const boxStyle = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
  padding: 24, maxWidth: 460,
}
const inputStyle = {
  width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb',
  borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', marginBottom: 14,
}
const buttonStyle = (disabled) => ({
  padding: '10px 18px', background: disabled ? '#9ca3af' : '#25d366',
  color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700,
  fontSize: '0.88rem', cursor: disabled ? 'not-allowed' : 'pointer',
})
const activeBadgeStyle = {
  display: 'flex', alignItems: 'center', gap: 10,
  background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10,
  padding: '14px 16px', color: '#166534', fontSize: '0.9rem', fontWeight: 600,
}

// Página para que un usuario YA logueado active MFA (2FA) en su propia
// cuenta. Equivalente de la pantalla que en la práctica de Node se
// probaba directamente con Postman (/api/mfa/setup, /api/mfa/confirm).
export default function SecuritySettingsPage() {
  const { user } = useAuth()
  const email = user?.email || user?.username || ''

  // Antes de mostrar el botón "Activar", se consulta el estado real en
  // el backend. Así, si ya estaba activada de antes, se muestra un
  // aviso claro en vez de dejar que el usuario presione el botón y
  // reciba un error confuso.
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [mfaEnabled, setMfaEnabled] = useState(false)

  const [step, setStep] = useState('idle') // idle | qr | done
  const [qrCode, setQrCode] = useState('')
  const [manualKey, setManualKey] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  // Desactivar MFA (se pide la contraseña para confirmar que es el
  // dueño de la cuenta quien lo está apagando).
  const [showDisableForm, setShowDisableForm] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disableError, setDisableError] = useState('')
  const [disableLoading, setDisableLoading] = useState(false)

  useEffect(() => {
    if (!email) { setCheckingStatus(false); return }
    getMfaStatus(email)
      .then(data => setMfaEnabled(Boolean(data?.user?.mfaEnabled)))
      .catch(() => setMfaEnabled(false))
      .finally(() => setCheckingStatus(false))
  }, [email])

  const handleStart = async () => {
    setError(''); setInfo(''); setLoading(true)
    try {
      const data = await startMfaSetup(email)
      setQrCode(data.qrCode)
      setManualKey(data.manualKey)
      setStep('qr')
    } catch (err) {
      const detail = err?.response?.data?.detail
      // Si el backend dice que ya está activa (carrera entre pestañas,
      // datos desactualizados, etc.) reflejamos ese estado en vez de
      // solo mostrar el error suelto.
      if (err?.response?.status === 409) {
        setMfaEnabled(true)
      } else {
        setError(detail || 'No se pudo iniciar la configuración de MFA.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await confirmMfaSetup(email, code)
      setInfo('Autenticación en dos pasos activada correctamente.')
      setMfaEnabled(true)
      setStep('done')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Código inválido.')
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async (e) => {
    e.preventDefault()
    setDisableError(''); setDisableLoading(true)
    try {
      await disableMfa(email, disablePassword)
      setMfaEnabled(false)
      setShowDisableForm(false)
      setDisablePassword('')
      setStep('idle')
    } catch (err) {
      setDisableError(err?.response?.data?.detail || 'No se pudo desactivar el MFA.')
    } finally {
      setDisableLoading(false)
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <h2 style={{ marginTop: 0, color: '#1a1a2e' }}>Seguridad de la cuenta</h2>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: 24 }}>
        Cuenta: <strong>{email}</strong>
      </p>

      <div style={boxStyle}>
        {checkingStatus && (
          <p style={{ color: '#9ca3af', fontSize: '0.88rem', margin: 0 }}>Verificando estado de MFA...</p>
        )}

        {!checkingStatus && mfaEnabled && step !== 'qr' && (
          <>
            <div style={activeBadgeStyle}>
              <span style={{ fontSize: '1.2rem' }}>✅</span>
              <span>La verificación en dos pasos ya está activada para esta cuenta.</span>
            </div>

            {!showDisableForm && (
              <button
                onClick={() => { setShowDisableForm(true); setDisableError('') }}
                style={{
                  marginTop: 14, background: 'none', border: 'none', color: '#991b1b',
                  fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', padding: 0, textDecoration: 'underline',
                }}
              >
                Desactivar verificación en dos pasos
              </button>
            )}

            {showDisableForm && (
              <form onSubmit={handleDisable} style={{ marginTop: 16 }}>
                <p style={{ fontSize: '0.82rem', color: '#374151', marginTop: 0 }}>
                  Confirma tu contraseña para desactivar el MFA:
                </p>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={e => setDisablePassword(e.target.value)}
                  placeholder="Contraseña"
                  style={inputStyle}
                  autoFocus
                  required
                />
                {disableError && <div style={{ color: '#991b1b', fontSize: '0.82rem', marginBottom: 12 }}>{disableError}</div>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="submit"
                    disabled={disableLoading}
                    style={{
                      padding: '9px 16px', background: disableLoading ? '#9ca3af' : '#ef4444',
                      color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700,
                      fontSize: '0.85rem', cursor: disableLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {disableLoading ? 'Desactivando...' : 'Confirmar desactivación'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDisableForm(false); setDisablePassword(''); setDisableError('') }}
                    style={{
                      padding: '9px 16px', background: '#f3f4f6', border: '1px solid #e5e7eb',
                      borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', color: '#374151',
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {!checkingStatus && !mfaEnabled && step === 'idle' && (
          <>
            <p style={{ fontSize: '0.88rem', color: '#374151', marginTop: 0 }}>
              Activa la verificación en dos pasos (MFA) para proteger tu cuenta con
              un código adicional generado por Google Authenticator o Microsoft Authenticator.
            </p>
            {error && <div style={{ color: '#991b1b', fontSize: '0.82rem', marginBottom: 12 }}>{error}</div>}
            <button onClick={handleStart} disabled={loading} style={buttonStyle(loading)}>
              {loading ? 'Generando código QR...' : 'Activar verificación en dos pasos'}
            </button>
          </>
        )}

        {step === 'qr' && (
          <form onSubmit={handleConfirm}>
            <p style={{ fontSize: '0.88rem', color: '#374151', marginTop: 0 }}>
              Escanea este código QR con tu app de autenticación:
            </p>
            {qrCode && (
              <img src={qrCode} alt="Código QR de MFA" style={{ width: 200, height: 200, display: 'block', margin: '0 auto 14px' }} />
            )}
            <p style={{ fontSize: '0.78rem', color: '#6b7280' }}>
              ¿No puedes escanear? Ingresa esta clave manualmente:
              <br /><code>{manualKey}</code>
            </p>
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Código de 6 dígitos"
              style={inputStyle}
              autoFocus
            />
            {error && <div style={{ color: '#991b1b', fontSize: '0.82rem', marginBottom: 12 }}>{error}</div>}
            <button type="submit" disabled={loading} style={buttonStyle(loading)}>
              {loading ? 'Confirmando...' : 'Confirmar y activar'}
            </button>
          </form>
        )}

        {step === 'done' && info && (
          <div style={{ color: '#166534', fontSize: '0.88rem', marginTop: 14 }}>{info}</div>
        )}
      </div>
    </div>
  )
}
