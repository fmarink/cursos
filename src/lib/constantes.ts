/**
 * Constantes compartidas entre servidor y cliente.
 * Este módulo no debe importar nada del acceso a datos: lo consumen
 * componentes de cliente.
 */

export const NIVELES_ESCOLARIDAD = [
  'Básica incompleta',
  'Básica completa',
  'Media incompleta',
  'Media completa',
  'Técnico nivel medio',
  'Técnico superior',
  'Universitaria incompleta',
  'Universitaria completa',
  'Postgrado',
] as const

export const ETIQUETA_MODALIDAD: Record<string, string> = {
  PRESENCIAL_TEORICO: 'Presencial (Teórico)',
  PRESENCIAL_PRACTICO: 'Presencial (Práctico)',
  PRESENCIAL_MIXTO: 'Presencial (Teórico y Práctico)',
}

export const ETIQUETA_TIPO_LUGAR: Record<string, string> = {
  FAENA: 'Faena',
  HOTEL: 'Hotel',
  OFICINA: 'Oficina',
  OTRO: 'Otro',
}
