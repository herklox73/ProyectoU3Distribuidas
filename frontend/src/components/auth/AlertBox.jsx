export default function AlertBox({ type = 'error', children }) {
  if (!children) return null
  const palette = type === 'success'
    ? { bg: '#dcfce7', color: '#166534' }
    : { bg: '#fee2e2', color: '#991b1b' }
  return (
    <div style={{
      background: palette.bg, color: palette.color, padding: '10px 14px',
      borderRadius: 8, fontSize: '0.82rem', marginBottom: 16, lineHeight: 1.5,
    }}>
      {children}
    </div>
  )
}
