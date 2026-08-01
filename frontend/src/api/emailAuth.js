// Cliente API para el módulo de verificación de correo / MFA / recuperación.
// Responsabilidad única: solo arma las peticiones HTTP. Ninguna
// pantalla debe construir URLs a mano; todas pasan por aquí.
import axios from './axios'

const BASE = '/api/email-auth'

// ── Registro y verificación de cuenta ────────────────────────────────
export const registerAccount = (name, email, password) =>
  axios.post(`${BASE}/auth/register/`, { name, email, password }).then(r => r.data)

export const verifyAccount = (email, code) =>
  axios.post(`${BASE}/auth/verify/`, { email, code }).then(r => r.data)

export const resendVerificationCode = (email) =>
  axios.post(`${BASE}/auth/resend/`, { email }).then(r => r.data)

export const getAccountStatus = (email) =>
  axios.get(`${BASE}/auth/status/${encodeURIComponent(email)}/`).then(r => r.data)

// ── Login con MFA ──────────────────────────────────────────────────────
export const loginStep1 = (email, password) =>
  axios.post(`${BASE}/auth/login-step1/`, { email, password }).then(r => r.data)

export const loginStep2 = (email, code) =>
  axios.post(`${BASE}/auth/login-step2/`, { email, code }).then(r => r.data)

// Segundo factor específico para el login con Google (ver google_callback).
export const googleMfaVerify = (email, code) =>
  axios.post(`${BASE}/auth/google-mfa-verify/`, { email, code }).then(r => r.data)

// ── Configuración de MFA ─────────────────────────────────────────────
export const startMfaSetup = (email) =>
  axios.post(`${BASE}/mfa/setup/`, { email }).then(r => r.data)

export const confirmMfaSetup = (email, code) =>
  axios.post(`${BASE}/mfa/confirm/`, { email, code }).then(r => r.data)

export const getMfaStatus = (email) =>
  axios.get(`${BASE}/mfa/status/${encodeURIComponent(email)}/`).then(r => r.data)

export const disableMfa = (email, password) =>
  axios.post(`${BASE}/mfa/disable/`, { email, password }).then(r => r.data)

// ── Recuperación de contraseña ───────────────────────────────────────
export const requestAccountRecovery = (email) =>
  axios.post(`${BASE}/auth/recover/`, { email }).then(r => r.data)

export const validateRecoveryToken = (email, token) =>
  axios.get(`${BASE}/auth/validate-token/`, { params: { email, token } }).then(r => r.data)

export const resetPassword = (email, token, newPassword) =>
  axios.post(`${BASE}/auth/reset-password/`, { email, token, newPassword }).then(r => r.data)

// ── Notificaciones ───────────────────────────────────────────────────
export const sendCustomNotification = ({ to, subject, title, message, signature }) =>
  axios.post(`${BASE}/notifications/send/`, { to, subject, title, message, signature }).then(r => r.data)

export const sendAttachmentNotification = ({ to, subject, title, message, signature, file }) => {
  const form = new FormData()
  form.append('to', to)
  form.append('subject', subject)
  form.append('title', title)
  form.append('message', message)
  form.append('signature', signature || '')
  form.append('file', file)
  return axios.post(`${BASE}/notifications/attachment/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

// ── Cola de correos (admin) ──────────────────────────────────────────
export const listQueueTasks = () =>
  axios.get(`${BASE}/queue/tasks/`).then(r => r.data)

export const pauseQueue = () =>
  axios.post(`${BASE}/queue/pause/`).then(r => r.data)

export const resumeQueue = () =>
  axios.post(`${BASE}/queue/resume/`).then(r => r.data)
