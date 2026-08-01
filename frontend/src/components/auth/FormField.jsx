export default function FormField({ label, type = 'text', value, onChange, required = true, placeholder, autoFocus }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb',
          borderRadius: 8, fontSize: '0.9rem', outline: 'none',
          boxSizing: 'border-box', transition: 'border-color 0.2s',
        }}
        onFocus={e => { e.target.style.borderColor = '#25d366' }}
        onBlur={e => { e.target.style.borderColor = '#e5e7eb' }}
      />
    </div>
  )
}
