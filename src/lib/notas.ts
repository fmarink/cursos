/**
 * Escala de notas chilena 1.0 – 7.0 con exigencia configurable.
 *
 * Bajo el porcentaje de exigencia la nota va de 1.0 al umbral de aprobación;
 * sobre él, del umbral al 7.0. Es el cálculo estándar usado en capacitación.
 */
export function calcularNota(
  puntajeObtenido: number,
  puntajeMaximo: number,
  umbralAprobacion = 4.0,
  exigencia = 60,
): number {
  if (puntajeMaximo <= 0) return 1.0
  const logro = Math.max(0, Math.min(1, puntajeObtenido / puntajeMaximo))
  const corte = exigencia / 100

  let nota: number
  if (logro < corte) {
    nota = 1 + ((umbralAprobacion - 1) * logro) / corte
  } else {
    nota = umbralAprobacion + ((7 - umbralAprobacion) * (logro - corte)) / (1 - corte)
  }
  return Math.round(nota * 10) / 10
}

export function formatearNota(nota: number | string | null | undefined): string {
  if (nota === null || nota === undefined) return '—'
  const n = typeof nota === 'string' ? Number(nota) : nota
  if (Number.isNaN(n)) return '—'
  return n.toFixed(1)
}
