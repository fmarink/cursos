/**
 * Utilidades de RUT chileno.
 *
 * Formato canónico usado en base de datos: sin puntos, con guion, DV en
 * mayúscula. Ej: "12345678-9", "7654321-K".
 */

/** Deja solo dígitos y K, en mayúscula. */
export function limpiarRut(valor: string): string {
  return (valor ?? '').toString().replace(/[^0-9kK]/g, '').toUpperCase()
}

/** Calcula el dígito verificador con módulo 11. */
export function calcularDv(cuerpo: string): string {
  let suma = 0
  let multiplicador = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1
  }
  const resto = 11 - (suma % 11)
  if (resto === 11) return '0'
  if (resto === 10) return 'K'
  return String(resto)
}

/**
 * Normaliza a "12345678-9". Devuelve null si el valor no tiene forma de RUT.
 * No valida el dígito verificador — para eso está `validarRut`.
 */
export function normalizarRut(valor: string): string | null {
  const limpio = limpiarRut(valor)
  if (limpio.length < 2) return null
  const cuerpo = limpio.slice(0, -1)
  const dv = limpio.slice(-1)
  if (!/^\d+$/.test(cuerpo)) return null
  // Un RUT chileno válido va aproximadamente de 1.000.000 a 99.999.999
  if (cuerpo.length < 7 || cuerpo.length > 8) return null
  return `${cuerpo}-${dv}`
}

/** Valida estructura y dígito verificador (módulo 11). */
export function validarRut(valor: string): boolean {
  const normalizado = normalizarRut(valor)
  if (!normalizado) return false
  const [cuerpo, dv] = normalizado.split('-')
  return calcularDv(cuerpo) === dv
}

/** Formatea para mostrar: "12.345.678-9". */
export function formatearRut(valor: string): string {
  const normalizado = normalizarRut(valor)
  if (!normalizado) return valor
  const [cuerpo, dv] = normalizado.split('-')
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${conPuntos}-${dv}`
}

/**
 * Formateo progresivo mientras el usuario escribe, sin pelear con el cursor.
 * Aplica puntos y guion solo cuando ya hay cuerpo suficiente.
 */
export function formatearMientrasEscribe(valor: string): string {
  const limpio = limpiarRut(valor)
  if (limpio.length === 0) return ''
  if (limpio.length === 1) return limpio
  const cuerpo = limpio.slice(0, -1)
  const dv = limpio.slice(-1)
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${conPuntos}-${dv}`
}
