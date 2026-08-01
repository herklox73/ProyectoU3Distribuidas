import { useEffect, useState } from 'react'
import { confirmCheckout } from '../api/billing'

const boxStyle = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 32,
  maxWidth: 480, margin: '80px auto', textAlign: 'center',
}
const buttonStyle = {
  padding: '10px 20px', background: '#25d366', color: '#fff', border: 'none',
  borderRadius: 8, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', marginTop: 16,
}

// Página a la que PayPal/PayPhone redirigen después del pago
// (return_url configurado en checkout_service.py / paypal_gateway.py).
// PayPal agrega ?token=<orderId>&PayerID=... ; PayPhone (Payment
// Links) debe tener configurada esta misma URL como redirección en su
// panel, y agrega ?id=<transactionId>&clientTransactionId=...
export default function PaymentReturnPage({ onGoToDashboard }) {
  const [status, setStatus] = useState('confirming') // confirming | approved | failed | error
  const [message, setMessage] = useState('Confirmando tu pago, un momento...')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const provider = (params.get('provider') || '').toUpperCase()
    const cancelled = params.get('cancelled')

    if (cancelled === '1') {
      setStatus('failed')
      setMessage('Cancelaste el pago. No se realizó ningún cargo.')
      return
    }

    let providerReference = ''
    let extra = {}

    if (provider === 'PAYPAL') {
      providerReference = params.get('token') || ''
    } else if (provider === 'PAYPHONE') {
      providerReference = params.get('clientTransactionId') || ''
      extra = { id: params.get('id') }
    }

    if (!provider || !providerReference) {
      setStatus('error')
      setMessage('No se pudo leer la información del pago desde la URL de retorno.')
      return
    }

    confirmCheckout(provider, providerReference, extra)
      .then(result => {
        if (result.approved) {
          setStatus('approved')
          setMessage(`¡Pago aprobado! Se acreditaron ${result.credits} créditos a tu cuenta.`)
        } else {
          setStatus('failed')
          setMessage('El pago no se completó. Si el cargo se realizó, contacta a soporte.')
        }
      })
      .catch(err => {
        setStatus('error')
        setMessage(err?.response?.data?.error || 'No se pudo confirmar el pago.')
      })
  }, [])

  const colors = {
    confirming: '#374151', approved: '#166534', failed: '#991b1b', error: '#991b1b',
  }

  return (
    <div style={boxStyle}>
      <h2 style={{ marginTop: 0, color: '#1a1a2e' }}>Estado del pago</h2>
      <p style={{ color: colors[status], fontWeight: 600 }}>{message}</p>
      <button style={buttonStyle} onClick={onGoToDashboard}>Ir al panel</button>
    </div>
  )
}
