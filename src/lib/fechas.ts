/**
 * Fechas del día en curso, en horario de Chile.
 *
 * `new Date().toISOString().slice(0, 10)` devuelve la fecha en UTC, no la del
 * país. Chile va de UTC-3 a UTC-4, así que desde las 20:00 o 21:00 hora local
 * el UTC ya es el día siguiente. Un curso que termina a las 21:00 desaparecería
 * de «Hoy en sala» en plena jornada, y la fecha propuesta al crear un curso
 * saltaría al día siguiente. De ahí que la fecha de hoy se calcule siempre en
 * la zona horaria del país y no en la del servidor ni en UTC.
 */

const ZONA = 'America/Santiago'

/** La fecha de hoy en Chile, como `AAAA-MM-DD`. */
export function hoyEnChile(referencia: Date = new Date()): string {
  // en-CA formatea como AAAA-MM-DD, que es exactamente lo que guarda la base.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(referencia)
}

/** `AAAA-MM-DD` desplazado en días respecto de hoy en Chile. */
export function fechaEnChile(diasDesdeHoy: number, referencia: Date = new Date()): string {
  const base = new Date(referencia.getTime() + diasDesdeHoy * 86_400_000)
  return hoyEnChile(base)
}
