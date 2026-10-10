// 593987654321 -> +593 98 765 4321 (otros países: +<número>)
export function formatearTelefono(tel) {
  const t = String(tel || '').replace(/\D/g, '')
  const m = /^593(\d{2})(\d{3})(\d{4})$/.exec(t)
  return m ? `+593 ${m[1]} ${m[2]} ${m[3]}` : `+${t}`
}
