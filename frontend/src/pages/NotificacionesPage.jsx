import { useState } from 'react'
import { sendCustomNotification, sendAttachmentNotification } from '../api/emailAuth'

const inputStyle = {
  width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb',
  borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', marginBottom: 14,
}
const labelStyle = { fontSize: '0.82rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }
const boxStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, maxWidth: 560, marginBottom: 24 }
const buttonStyle = (disabled) => ({
  padding: '10px 18px', background: disabled ? '#9ca3af' : '#25d366',
  color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700,
  fontSize: '0.88rem', cursor: disabled ? 'not-allowed' : 'pointer',
})

// Envío de correos personalizados (con o sin adjunto) a cualquier
// destinatario, usando la misma cuenta de Gmail. Equivalente a los
// endpoints /api/notifications/send y /api/notifications/attachment
// de la práctica.
export default function NotificacionesPage() {
  const [form, setForm] = useState({ to: '', subject: '', title: '', message: '', signature: '' })
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSend = async (e) => {
    e.preventDefault()
    setError(''); setInfo(''); setLoading(true)
    try {
      const result = file
        ? await sendAttachmentNotification({ ...form, file })
        : await sendCustomNotification(form)
      setInfo(result.message || 'Correo encolado correctamente.')
      setForm({ to: '', subject: '', title: '', message: '', signature: '' })
      setFile(null)
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo encolar el correo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <h2 style={{ marginTop: 0, color: '#1a1a2e' }}>Notificaciones por correo</h2>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: 24 }}>
        Envía un correo personalizado (con adjunto opcional: PDF, DOCX, PNG, JPG o XLSX).
      </p>

      <form onSubmit={handleSend} style={boxStyle}>
        <label style={labelStyle}>Destinatario</label>
        <input style={inputStyle} type="email" value={form.to} onChange={update('to')} required />

        <label style={labelStyle}>Asunto</label>
        <input style={inputStyle} value={form.subject} onChange={update('subject')} required />

        <label style={labelStyle}>Título</label>
        <input style={inputStyle} value={form.title} onChange={update('title')} required />

        <label style={labelStyle}>Mensaje</label>
        <textarea
          style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
          value={form.message}
          onChange={update('message')}
          required
        />

        <label style={labelStyle}>Firma (opcional)</label>
        <input style={inputStyle} value={form.signature} onChange={update('signature')} placeholder="MassSend" />

        <label style={labelStyle}>Adjunto (opcional)</label>
        <input
          style={{ marginBottom: 14 }}
          type="file"
          accept=".pdf,.docx,.png,.jpg,.jpeg,.xlsx"
          onChange={e => setFile(e.target.files?.[0] || null)}
        />

        {error && <div style={{ color: '#991b1b', fontSize: '0.82rem', marginBottom: 12 }}>{error}</div>}
        {info && <div style={{ color: '#166534', fontSize: '0.82rem', marginBottom: 12 }}>{info}</div>}

        <button type="submit" disabled={loading} style={buttonStyle(loading)}>
          {loading ? 'Enviando...' : 'Encolar correo'}
        </button>
      </form>
    </div>
  )
}
