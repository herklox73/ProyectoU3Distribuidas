export default function LinkButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none', border: 'none', color: '#128c4a', fontWeight: 600,
        fontSize: '0.82rem', cursor: 'pointer', padding: 0, textDecoration: 'underline',
      }}
    >
      {children}
    </button>
  )
}
