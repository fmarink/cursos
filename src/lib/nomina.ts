import { normalizarRut } from './rut'

export type FilaNomina = {
  nombre: string
  rut: string | null
  empresa: string | null
  cargo: string | null
}

/**
 * Interpreta la nómina que el cliente envía por correo, pegada tal cual desde
 * Excel o desde el cuerpo del mensaje.
 *
 * Detecta el separador por línea (tabulación, punto y coma o coma), reconoce
 * la columna del RUT esté donde esté, y descarta la fila de encabezados. Es
 * deliberadamente tolerante: la nómina sirve para conciliar, no para bloquear
 * registros, así que una fila mal formada no debe hacer fallar la carga.
 */
export function parsearNomina(texto: string): FilaNomina[] {
  return texto
    .split('\n')
    .map((linea) => linea.trim())
    .filter((l) => l.length > 0)
    .map((linea) => {
      const sep = linea.includes('\t') ? '\t' : linea.includes(';') ? ';' : ','
      const partes = linea
        .split(sep)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)

      const rutCrudo = partes.find((p) => /^[\d.]{7,10}-?[\dkK]$/.test(p)) ?? null
      const resto = partes.filter((p) => p !== rutCrudo)

      return {
        nombre: resto[0] ?? linea,
        rut: rutCrudo ? normalizarRut(rutCrudo) : null,
        empresa: resto[1] ?? null,
        cargo: resto[2] ?? null,
      }
    })
    .filter((f) => f.nombre.length > 2 && !/^(nombre|rut|apellido|n°|nro)/i.test(f.nombre))
}
