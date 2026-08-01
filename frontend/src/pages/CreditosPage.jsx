import { useEffect, useState } from 'react'
import { listPacks, getWallet, getWalletHistory, startCheckout } from '../api/billing'

const boxStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, maxWidth: 720, marginBottom: 24 }
const cardStyle = {
  border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 14,
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap',
}
const buttonStyle = (bg, disabled) => ({
  padding: '9px 16px', background: disabled ? '#9ca3af' : bg,
  color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700,
  fontSize: '0.85rem', cursor: disabled ? 'not-allowed' : 'pointer', marginLeft: 8,
})
const statusBadge = (status) => {
  const map = {
    APPROVED: { bg: '#dcfce7', color: '#166534', label: 'Aprobado' },
    PENDING: { bg: '#fef9c3', color: '#854d0e', label: 'Pendiente' },
    FAILED: { bg: '#fee2e2', color: '#991b1b', label: 'Fallido' },
  }
  const s = map[status] || map.PENDING
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>
      {s.label}
    </span>
  )
}

// Catálogo de paquetes de créditos + saldo + historial. 1 crédito = 1
// mensaje enviado en una campaña. El pago redirige a PayPal/PayPhone
// y el usuario vuelve a /billing/return, donde se confirma el pago.
export default function CreditosPage() {
  const [packs, setPacks] = useState([])
  const [balance, setBalance] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState(null)

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [packsRes, walletRes, historyRes] = await Promise.all([
        listPacks(), getWallet(), getWalletHistory(),
      ])
      setPacks(packsRes.packs || [])
      setBalance(walletRes.balance ?? 0)
      setHistory(historyRes.transactions || [])
    } catch (err) {
      setError(err?.response?.data?.error || 'No se pudo cargar la información de créditos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  const handleBuy = async (packId, provider) => {
    setError('')
    setPayingId(`${packId}-${provider}`)
    try {
      const result = await startCheckout(packId, provider)
      if (result.redirect_url) {
        window.location.href = result.redirect_url
      } else {
        setError('La pasarela no devolvió una URL de pago.')
        setPayingId(null)
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'No se pudo iniciar el pago.')
      setPayingId(null)
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <h2 style={{ marginTop: 0, color: '#1a1a2e' }}>Créditos</h2>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: 24 }}>
        1 crédito = 1 mensaje enviado en una campaña. Toda cuenta nueva recibe 10 créditos gratis para probar antes de comprar más.
      </p>

      <div style={{ ...boxStyle, marginBottom: 20 }}>
        <div style={{ fontSize: '0.82rem', color: '#6b7280', fontWeight: 600 }}>Saldo actual</div>
        <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1a1a2e' }}>
          {loading ? '...' : `${balance} créditos`}
        </div>
      </div>

      {error && <div style={{ color: '#991b1b', fontSize: '0.85rem', marginBottom: 16 }}>{error}</div>}

      <div style={boxStyle}>
        <h3 style={{ marginTop: 0, fontSize: '1rem', color: '#1a1a2e' }}>Paquetes disponibles</h3>
        {loading && <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Cargando...</p>}
        {!loading && packs.length === 0 && (
          <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
            Todavía no hay paquetes de créditos configurados. Un administrador debe crearlos.
          </p>
        )}
        {packs.map(pack => (
          <div key={pack.id} style={cardStyle}>
            <div>
              <div style={{ fontWeight: 700, color: '#1a1a2e' }}>{pack.name}</div>
              <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                {pack.credits} créditos · ${pack.price_usd}
              </div>
            </div>
            <div>
              <button
                style={buttonStyle('#0070ba', payingId === `${pack.id}-PAYPAL`)}
                disabled={payingId === `${pack.id}-PAYPAL`}
                onClick={() => handleBuy(pack.id, 'PAYPAL')}
              >
                {payingId === `${pack.id}-PAYPAL` ? 'Redirigiendo...' : 'Pagar con PayPal'}
              </button>
              <button
                style={buttonStyle('#00c1de', payingId === `${pack.id}-PAYPHONE`)}
                disabled={payingId === `${pack.id}-PAYPHONE`}
                onClick={() => handleBuy(pack.id, 'PAYPHONE')}
              >
                {payingId === `${pack.id}-PAYPHONE` ? 'Redirigiendo...' : 'Pagar con PayPhone'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={boxStyle}>
        <h3 style={{ marginTop: 0, fontSize: '1rem', color: '#1a1a2e' }}>Historial de compras</h3>
        {history.length === 0 && <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Aún no tienes compras.</p>}
        {history.map(t => (
          <div key={t.id} style={{ ...cardStyle, marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: '0.88rem' }}>
                {t.pack_name || 'Paquete'} · {t.provider} · {t.credits} créditos
              </div>
              <div style={{ color: '#9ca3af', fontSize: '0.78rem' }}>
                ${t.amount_usd} · {new Date(t.created_at).toLocaleString()}
              </div>
            </div>
            {statusBadge(t.status)}
          </div>
        ))}
      </div>
    </div>
  )
}
