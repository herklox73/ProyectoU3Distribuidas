export default function PrimaryButton({ children, loading, disabled, type = 'submit', onClick }) {
  const isDisabled = disabled || loading
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      style={{
        width: '100%', padding: '11px', background: isDisabled ? '#9ca3af' : '#25d366',
        color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700,
        fontSize: '0.9rem', cursor: isDisabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s',
      }}
    >
      {children}
    </button>
  )
}
