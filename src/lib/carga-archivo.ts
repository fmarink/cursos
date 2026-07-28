/**
 * Motor común de las cargas por archivo.
 *
 * Todas las cargas de la plataforma —relatores, clientes, lugares, contenidos,
 * evaluaciones y encuestas— comparten el mismo trato con el archivo:
 *
 *   1. Se lee .xlsx o .csv indistintamente.
 *   2. Las columnas se reconocen por el texto del encabezado, tolerando
 *      acentos, mayúsculas y variantes de escritura, para que sirva tanto la
 *      plantilla que entregamos como el Excel que el cliente ya tenía.
 *   3. Cada problema se reporta con el número de fila REAL de la planilla, no
 *      con un índice interno: el usuario tiene que poder abrir el archivo e ir
 *      directo a la fila.
 *   4. Nada se guarda hasta que la persona vea lo que se entendió y confirme.
 *
 * Lo que cambia entre una carga y otra es solo el mapeo de columnas y la
 * validación de cada fila. Eso vive en el módulo de cada entidad.
 */
import ExcelJS from 'exceljs'

export type Problema = { fila: number; mensaje: string }

export type Analisis<T> = {
  filas: T[]
  problemas: Problema[]
  /** Encabezados presentes en el archivo que no corresponden a ningún campo. */
  columnasIgnoradas: string[]
}

/** Minúsculas, sin acentos y con los espacios colapsados. */
export function normalizar(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function valorCelda(celda: ExcelJS.CellValue): string {
  if (celda === null || celda === undefined) return ''
  if (celda instanceof Date) return celda.toISOString()
  if (typeof celda === 'object') {
    if ('text' in celda) return String(celda.text ?? '').trim()
    if ('result' in celda) return String(celda.result ?? '').trim()
    if ('richText' in celda) {
      return (celda.richText as { text: string }[]).map((r) => r.text).join('').trim()
    }
    if ('hyperlink' in celda) return String((celda as { text?: string }).text ?? '').trim()
  }
  return String(celda).trim()
}

/** CSV con comillas y separador detectado entre coma, punto y coma o tabulación. */
export function parsearCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const primera = limpio.split('\n')[0] ?? ''
  const sep = primera.includes('\t') ? '\t' : primera.includes(';') ? ';' : ','

  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let enComillas = false

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]
    if (enComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"'
          i++
        } else enComillas = false
      } else campo += c
    } else if (c === '"') {
      enComillas = true
    } else if (c === sep) {
      fila.push(campo.trim())
      campo = ''
    } else if (c === '\n') {
      fila.push(campo.trim())
      filas.push(fila)
      fila = []
      campo = ''
    } else {
      campo += c
    }
  }
  fila.push(campo.trim())
  filas.push(fila)

  // Las filas vacías se conservan para no desplazar la numeración: la fila 7
  // del archivo tiene que seguir siendo la fila 7 en los mensajes de error.
  return filas
}

/**
 * Convierte el archivo en una matriz de texto respetando la posición real de
 * cada fila. Los huecos quedan como filas vacías, no se compactan.
 */
export async function leerMatriz(
  buffer: Buffer,
  nombreArchivo: string,
  hojaPreferida?: string,
): Promise<string[][]> {
  if (/\.(csv|txt)$/i.test(nombreArchivo)) return parsearCsv(buffer.toString('utf8'))

  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(buffer as unknown as ArrayBuffer)

  const buscada = hojaPreferida ? normalizar(hojaPreferida) : null
  const hoja =
    (buscada ? libro.worksheets.find((h) => normalizar(h.name).includes(buscada)) : null) ??
    libro.worksheets[0]
  if (!hoja) return []

  const filas: string[][] = []
  hoja.eachRow({ includeEmpty: false }, (fila, numero) => {
    const celdas: string[] = []
    fila.eachCell({ includeEmpty: true }, (celda, col) => {
      celdas[col - 1] = valorCelda(celda.value)
    })
    while (filas.length < numero - 1) filas.push([])
    filas[numero - 1] = celdas
  })
  return filas
}

/** Sinónimos aceptados por campo, ya normalizados al comparar. */
export type Mapeo = Record<string, string[]>

export type Columnas = {
  /** Campo → índice de columna, para los campos encontrados. */
  indices: Record<string, number>
  /** Encabezados del archivo que no corresponden a ningún campo conocido. */
  ignoradas: string[]
  /** Fila (base 1) donde estaban los encabezados, o 0 si no hay. */
  filaEncabezado: number
}

/**
 * Ubica los encabezados y los asocia a los campos.
 *
 * Busca la fila de encabezados en las primeras cinco filas: los Excel reales
 * suelen traer un título o una fila en blanco antes de la tabla.
 */
export function mapearColumnas(matriz: string[][], mapeo: Mapeo): Columnas {
  const campos = Object.entries(mapeo).map(([campo, alias]) => ({
    campo,
    alias: alias.map(normalizar),
  }))

  let mejor: Columnas = { indices: {}, ignoradas: [], filaEncabezado: 0 }
  let mejorPuntaje = 0

  for (let f = 0; f < Math.min(matriz.length, 5); f++) {
    const fila = matriz[f] ?? []
    const indices: Record<string, number> = {}
    const ignoradas: string[] = []

    fila.forEach((celda, i) => {
      const n = normalizar(celda)
      if (n === '') return
      const hallado = campos.find(
        ({ campo, alias }) => indices[campo] === undefined && alias.includes(n),
      )
      if (hallado) indices[hallado.campo] = i
      else ignoradas.push(String(celda).trim())
    })

    const puntaje = Object.keys(indices).length
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje
      mejor = { indices, ignoradas, filaEncabezado: f + 1 }
    }
  }

  // Sin encabezados reconocibles se asume el orden de la plantilla y los datos
  // empiezan en la primera fila.
  if (mejorPuntaje === 0) {
    const indices: Record<string, number> = {}
    Object.keys(mapeo).forEach((campo, i) => (indices[campo] = i))
    return { indices, ignoradas: [], filaEncabezado: 0 }
  }

  return mejor
}

/** Una fila del archivo con acceso por nombre de campo. */
export type Registro = {
  fila: number
  campo: (nombre: string) => string
  vacia: boolean
}

/**
 * Recorre las filas de datos y entrega cada una con acceso por campo. Las filas
 * completamente vacías se saltan sin generar ruido: en un Excel real siempre
 * sobran filas al final.
 */
export function* recorrer(matriz: string[][], columnas: Columnas): Generator<Registro> {
  for (let i = columnas.filaEncabezado; i < matriz.length; i++) {
    const celdas = matriz[i] ?? []
    const campo = (nombre: string) => {
      const idx = columnas.indices[nombre]
      return idx === undefined ? '' : (celdas[idx] ?? '').trim()
    }
    yield {
      fila: i + 1,
      campo,
      vacia: celdas.every((c) => (c ?? '').trim() === ''),
    }
  }
}

// ---------------------------------------------------------------------------
// Generación de las plantillas descargables
// ---------------------------------------------------------------------------

const AZUL = 'FF1F47D8'
const GRIS = 'FFE2E8F0'

export type ColumnaPlantilla = {
  titulo: string
  ancho?: number
  /** Lista desplegable en Excel, para que no se escriban valores inventados. */
  opciones?: string[]
}

export type DefinicionPlantilla = {
  hoja: string
  columnas: ColumnaPlantilla[]
  /** Filas de ejemplo, en gris cursiva, para reemplazar. */
  ejemplos: string[][]
  /** Cada línea de la hoja de instrucciones; `true` = título. */
  instrucciones: [string, boolean][]
}

export async function generarPlantilla(def: DefinicionPlantilla): Promise<Buffer> {
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Uppercap'

  const hoja = libro.addWorksheet(def.hoja)
  hoja.columns = def.columnas.map((c) => ({ header: c.titulo, width: c.ancho ?? 26 }))
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  hoja.getRow(1).height = 22
  hoja.views = [{ state: 'frozen', ySplit: 1 }]

  def.ejemplos.forEach((e) => hoja.addRow(e))
  for (let i = 2; i <= def.ejemplos.length + 1; i++) {
    hoja.getRow(i).font = { italic: true, color: { argb: 'FF94A3B8' } }
  }

  // Las listas desplegables se dejan hasta la fila 200: cubre de sobra
  // cualquier carga real y evita que se escriban valores que no existen.
  def.columnas.forEach((c, i) => {
    if (!c.opciones?.length) return
    for (let f = 2; f <= 200; f++) {
      hoja.getCell(f, i + 1).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${c.opciones.join(',')}"`],
      }
    }
  })

  const guia = libro.addWorksheet('Instrucciones')
  guia.columns = [{ width: 100 }]
  def.instrucciones.forEach(([texto, negrita]) => {
    const fila = guia.addRow([texto])
    if (negrita) fila.font = { bold: true }
  })
  guia.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }

  return Buffer.from(await libro.xlsx.writeBuffer())
}

/** Pie común de todas las hojas de instrucciones. */
export const PIE_INSTRUCCIONES: [string, boolean][] = [
  ['', false],
  ['Antes de guardar', true],
  ['   Se revisa el archivo completo y se le muestra qué se detectó y qué filas', false],
  ['   tienen problemas, con su número de fila. Nada se guarda hasta que confirme.', false],
  ['   Las filas con problemas no se cargan; el resto sí.', false],
  ['', false],
  ['   También se acepta un archivo .csv con coma, punto y coma o tabulación.', false],
  ['   Las columnas se reconocen por su encabezado, así que puede reordenarlas.', false],
]
