// Navegación SPA: todas las páginas quedan montadas (ocultas) para no perder
// lo que estabas haciendo, así que cada página necesita saber cuándo vuelve
// a mostrarse para pedir sus datos frescos sin recargar el navegador.
import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react'

const PaginaActivaContext = createContext(null)

export function PaginaActivaProvider({ pagina, children }) {
  return <PaginaActivaContext.Provider value={pagina}>{children}</PaginaActivaContext.Provider>
}

/**
 * Llama a `recargar` cada vez que la página `id`:
 *   - vuelve a mostrarse desde el menú (no en el primer montaje: ahí ya cargó), o
 *   - está visible y el navegador recupera el foco (vuelves de otra pestaña).
 */
export function useAlMostrar(id, recargar) {
  const activa = useContext(PaginaActivaContext)
  const fn = useRef(recargar)
  useLayoutEffect(() => { fn.current = recargar })   // siempre la versión más reciente
  const anterior = useRef(activa)

  useEffect(() => {
    const antes = anterior.current
    anterior.current = activa
    if (activa === id && antes !== id && antes !== null) fn.current()
  }, [activa, id])

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible' && anterior.current === id) fn.current()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [id])
}
