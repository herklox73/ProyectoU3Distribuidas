import { useEffect, useState, useCallback } from 'react'
import { listQueueTasks, pauseQueue, resumeQueue } from '../api/emailAuth'

const STATUS_COLORS = {
  PENDING: '#f59e0b',
  PROCESSING: '#3b82f6',
  SENT: '#10b981',
  FAILED: '#ef4444',
}

// Panel de la cola interna de correos (solo administradores). Muestra
// el estado PENDING -> PROCESSING -> SENT/FAILED de cada tarea y
// permite pausar/reanudar el worker (equivalente a /api/queue/* de la
// práctica de Node).
export default function ColaCorreosPage() {
  const [tasks, setTasks] = useState([])
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    listQueueTasks()
      .then(data => { setTasks(data.tasks || []); setPaused(!!data.paused); setError('') })
      .catch(err => setError(err?.response?.data?.detail || 'No se pudo cargar la cola (requiere una cuenta de staff).'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 4000)
    return () => clearInterval(interval)
  }, [load])

  const toggleQueue = async () => {
    try {
      if (paused) await resumeQueue()
      else await pauseQueue()
      load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo cambiar el estado de la cola.')
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, color: '#1a1a2e' }}>Cola de correos</h2>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '4px 0 0' }}>
            Estado: <strong style={{ color: paused ? '#ef4444' : '#10b981' }}>{paused ? 'Pausada' : 'Activa'}</strong>
          </p>
        </div>
        <button
          onClick={toggleQueue}
          style={{
            padding: '9px 16px', borderRadius: 8, border: 'none', fontWeight: 700,
            fontSize: '0.85rem', cursor: 'pointer', color: '#fff',
            background: paused ? '#25d366' : '#ef4444',
          }}
        >
          {paused ? 'Reanudar' : 'Pausar'}
        </button>
      </div>

      {error && <div style={{ color: '#991b1b', fontSize: '0.85rem', marginBottom: 16 }}>{error}</div>}
      {loading && <p style={{ color: '#888' }}>Cargando...</p>}

      {!loading && !error && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px' }}>Tipo</th>
                <th style={{ padding: '10px 14px' }}>Destinatario</th>
                <th style={{ padding: '10px 14px' }}>Estado</th>
                <th style={{ padding: '10px 14px' }}>Intentos</th>
                <th style={{ padding: '10px 14px' }}>Creado</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#9ca3af' }}>No hay tareas en la cola.</td></tr>
              )}
              {tasks.map(task => (
                <tr key={task.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 14px' }}>{task.type}</td>
                  <td style={{ padding: '10px 14px' }}>{task.to}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ color: STATUS_COLORS[task.status] || '#374151', fontWeight: 700 }}>
                      {task.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>{task.attempts}</td>
                  <td style={{ padding: '10px 14px' }}>{new Date(task.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
