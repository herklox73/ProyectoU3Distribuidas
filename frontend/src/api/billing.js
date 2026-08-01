// Cliente API para créditos y pasarelas de pago (PayPal + PayPhone).
// Responsabilidad única: solo arma las peticiones HTTP.
import axios from './axios'

const BASE = '/api/billing'

export const listPacks = () =>
  axios.get(`${BASE}/packs/`).then(r => r.data)

export const getWallet = () =>
  axios.get(`${BASE}/wallet/`).then(r => r.data)

export const getWalletHistory = () =>
  axios.get(`${BASE}/wallet/history/`).then(r => r.data)

export const startCheckout = (packId, provider) =>
  axios.post(`${BASE}/checkout/start/`, { pack_id: packId, provider }).then(r => r.data)

export const confirmCheckout = (provider, providerReference, extra = {}) =>
  axios.post(`${BASE}/checkout/confirm/`, {
    provider, provider_reference: providerReference, extra,
  }).then(r => r.data)
