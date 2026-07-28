/**
 * Carga de evaluaciones y encuestas desde archivo.
 *
 * Genera las plantillas descargables en Excel y lee lo que el usuario devuelve,
 * en .xlsx o .csv. El criterio es el mismo que en el importador de relatores:
 * tolerar variantes de escritura y acentos, y reportar cada problema con su
 * número de fila en vez de fallar en silencio o a medias.
 */
import ExcelJS from 'exceljs'

export type TipoPregunta = 'SELECCION_MULTIPLE' | 'VERDADERO_FALSO' | 'RESPUESTA_BREVE'
export type TipoPreguntaEncuesta = 'ESCALA' | 'TEXTO' | 'SI_NO'

export type PreguntaLeida = {
  fila: number
  enunciado: string
  tipo: TipoPregunta
  opciones: string[]
  respuestaCorrecta: string
  puntaje: number
}

export type PreguntaEncuestaLeida = {
  fila: number
  enunciado: string
  tipo: TipoPreguntaEncuesta
}

export type Problema = { fila: number; mensaje: string }

export type Analisis<T> = {
  preguntas: T[]
  problemas: Problema[]
}

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

function normalizar(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function valorCelda(celda: ExcelJS.CellValue): string {
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

const TIPOS_EVALUACION: [TipoPregunta, string[]][] = [
  ['SELECCION_MULTIPLE', ['seleccion multiple', 'multiple', 'alternativas', 'sm', 'opcion multiple']],
  ['VERDADERO_FALSO', ['verdadero o falso', 'verdadero falso', 'verdadero/falso', 'v/f', 'vf', 'verdadero']],
  ['RESPUESTA_BREVE', ['respuesta breve', 'breve', 'abierta', 'desarrollo', 'texto']],
]

const TIPOS_ENCUESTA: [TipoPreguntaEncuesta, string[]][] = [
  ['ESCALA', ['escala', 'escala numerica', 'numerica', 'nota', 'puntuacion']],
  ['SI_NO', ['si o no', 'si/no', 'sino', 'si no', 'binaria']],
  ['TEXTO', ['texto', 'texto libre', 'comentario', 'abierta', 'libre']],
]

function reconocerTipo<T>(valor: string, tabla: [T, string[]][], porDefecto: T): T | null {
  const n = normalizar(valor)
  if (n === '') return porDefecto
  for (const [tipo, alias] of tabla) {
    if (alias.some((a) => n === a || n.includes(a))) return tipo
  }
  return null
}

/** Acepta "A", "a)", "1", "b" o el texto literal de la opción. */
function resolverCorrecta(valor: string, opciones: string[]): number | null {
  const n = normalizar(valor).replace(/[).\-\s]/g, '')
  if (n === '') return null

  if (/^[a-f]$/.test(n)) {
    const i = n.charCodeAt(0) - 97
    return i < opciones.length ? i : null
  }
  if (/^\d+$/.test(n)) {
    const i = Number(n) - 1
    return i >= 0 && i < opciones.length ? i : null
  }
  const porTexto = opciones.findIndex((o) => normalizar(o) === n)
  return porTexto >= 0 ? porTexto : null
}

function resolverVerdaderoFalso(valor: string): 'true' | 'false' | null {
  const n = normalizar(valor)
  if (['verdadero', 'v', 'si', 'true', 'verdad', '1'].includes(n)) return 'true'
  if (['falso', 'f', 'no', 'false', '0'].includes(n)) return 'false'
  return null
}

// ---------------------------------------------------------------------------
// Lectura de archivos
// ---------------------------------------------------------------------------

/** Convierte cualquier archivo soportado en una matriz de celdas de texto. */
async function leerFilas(buffer: Buffer, nombreArchivo: string): Promise<string[][]> {
  const esCsv = /\.(csv|txt)$/i.test(nombreArchivo)

  if (esCsv) {
    return parsearCsv(buffer.toString('utf8'))
  }

  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(buffer as unknown as ArrayBuffer)

  // La hoja de preguntas, o la primera que tenga datos.
  const hoja =
    libro.worksheets.find((h) => normalizar(h.name).includes('pregunta')) ?? libro.worksheets[0]
  if (!hoja) return []

  // Las filas se dejan en su posición real de la planilla. Si se compactaran,
  // el "fila 12" que se le informa al usuario no sería la fila 12 que ve en
  // Excel, y buscar el error se volvería adivinanza.
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

/** CSV con comillas, y separador detectado entre coma, punto y coma o tabulación. */
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
      if (fila.some((x) => x !== '')) filas.push(fila)
      fila = []
      campo = ''
    } else {
      campo += c
    }
  }
  fila.push(campo.trim())
  if (fila.some((x) => x !== '')) filas.push(fila)

  return filas
}

/** ¿La primera fila son encabezados y no datos? */
function esEncabezado(fila: string[]): boolean {
  const texto = normalizar(fila.join(' '))
  return (
    texto.includes('enunciado') ||
    texto.includes('pregunta') ||
    (texto.includes('tipo') && texto.includes('opcion'))
  )
}

// ---------------------------------------------------------------------------
// Análisis de evaluaciones
// ---------------------------------------------------------------------------

export async function analizarEvaluacion(
  buffer: Buffer,
  nombreArchivo: string,
): Promise<Analisis<PreguntaLeida>> {
  const filas = await leerFilas(buffer, nombreArchivo)
  const preguntas: PreguntaLeida[] = []
  const problemas: Problema[] = []

  if (filas.length === 0) {
    return { preguntas, problemas: [{ fila: 0, mensaje: 'El archivo está vacío.' }] }
  }

  const desde = esEncabezado(filas[0] ?? []) ? 1 : 0

  for (let i = desde; i < filas.length; i++) {
    const numeroFila = i + 1
    const f = filas[i] ?? []

    const enunciado = (f[0] ?? '').trim()
    if (enunciado === '') continue // fila en blanco: se ignora sin ruido

    if (enunciado.length < 5) {
      problemas.push({ fila: numeroFila, mensaje: 'El enunciado es demasiado corto.' })
      continue
    }

    const tipo = reconocerTipo<TipoPregunta>(f[1] ?? '', TIPOS_EVALUACION, 'SELECCION_MULTIPLE')
    if (!tipo) {
      problemas.push({
        fila: numeroFila,
        mensaje: `Tipo "${f[1]}" no reconocido. Use: Selección múltiple, Verdadero o falso, o Respuesta breve.`,
      })
      continue
    }

    // Columnas 2 a 7: hasta seis opciones.
    const opciones = f.slice(2, 8).map((o) => (o ?? '').trim()).filter((o) => o !== '')
    const correctaCruda = (f[8] ?? '').trim()
    const puntajeCrudo = (f[9] ?? '').trim()

    const puntaje = puntajeCrudo === '' ? 1 : Number(puntajeCrudo.replace(',', '.'))
    if (!Number.isFinite(puntaje) || puntaje < 1 || puntaje > 20) {
      problemas.push({
        fila: numeroFila,
        mensaje: `Puntaje "${puntajeCrudo}" inválido. Use un número entre 1 y 20.`,
      })
      continue
    }

    let respuestaCorrecta = ''

    if (tipo === 'SELECCION_MULTIPLE') {
      if (opciones.length < 2) {
        problemas.push({
          fila: numeroFila,
          mensaje: 'Una pregunta de selección múltiple necesita al menos 2 opciones.',
        })
        continue
      }
      const indice = resolverCorrecta(correctaCruda, opciones)
      if (indice === null) {
        problemas.push({
          fila: numeroFila,
          mensaje:
            correctaCruda === ''
              ? 'Falta indicar la respuesta correcta (A, B, C…).'
              : `Respuesta correcta "${correctaCruda}" no corresponde a ninguna opción.`,
        })
        continue
      }
      respuestaCorrecta = String(indice)
    } else if (tipo === 'VERDADERO_FALSO') {
      const vf = resolverVerdaderoFalso(correctaCruda)
      if (vf === null) {
        problemas.push({
          fila: numeroFila,
          mensaje:
            correctaCruda === ''
              ? 'Falta indicar si la afirmación es verdadera o falsa.'
              : `Respuesta "${correctaCruda}" no reconocida. Use Verdadero o Falso.`,
        })
        continue
      }
      respuestaCorrecta = vf
    }

    preguntas.push({
      fila: numeroFila,
      enunciado,
      tipo,
      opciones: tipo === 'SELECCION_MULTIPLE' ? opciones : [],
      respuestaCorrecta,
      puntaje: Math.round(puntaje),
    })
  }

  if (preguntas.length === 0 && problemas.length === 0) {
    problemas.push({ fila: 0, mensaje: 'No se encontró ninguna pregunta en el archivo.' })
  }

  return { preguntas, problemas }
}

// ---------------------------------------------------------------------------
// Análisis de encuestas
// ---------------------------------------------------------------------------

export async function analizarEncuesta(
  buffer: Buffer,
  nombreArchivo: string,
): Promise<Analisis<PreguntaEncuestaLeida>> {
  const filas = await leerFilas(buffer, nombreArchivo)
  const preguntas: PreguntaEncuestaLeida[] = []
  const problemas: Problema[] = []

  if (filas.length === 0) {
    return { preguntas, problemas: [{ fila: 0, mensaje: 'El archivo está vacío.' }] }
  }

  const desde = esEncabezado(filas[0] ?? []) ? 1 : 0

  for (let i = desde; i < filas.length; i++) {
    const numeroFila = i + 1
    const f = filas[i] ?? []
    const enunciado = (f[0] ?? '').trim()
    if (enunciado === '') continue

    if (enunciado.length < 5) {
      problemas.push({ fila: numeroFila, mensaje: 'El enunciado es demasiado corto.' })
      continue
    }

    const tipo = reconocerTipo<TipoPreguntaEncuesta>(f[1] ?? '', TIPOS_ENCUESTA, 'ESCALA')
    if (!tipo) {
      problemas.push({
        fila: numeroFila,
        mensaje: `Tipo "${f[1]}" no reconocido. Use: Escala, Sí o no, o Texto libre.`,
      })
      continue
    }

    preguntas.push({ fila: numeroFila, enunciado, tipo })
  }

  if (preguntas.length === 0 && problemas.length === 0) {
    problemas.push({ fila: 0, mensaje: 'No se encontró ninguna pregunta en el archivo.' })
  }

  return { preguntas, problemas }
}

// ---------------------------------------------------------------------------
// Generación de las plantillas descargables
// ---------------------------------------------------------------------------

const AZUL = 'FF1F47D8'
const GRIS = 'FFE2E8F0'

export async function generarPlantillaEvaluacion(): Promise<Buffer> {
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Uppercap'

  // --- Hoja de preguntas ---
  const hoja = libro.addWorksheet('Preguntas')
  hoja.columns = [
    { header: 'Enunciado', key: 'enunciado', width: 60 },
    { header: 'Tipo', key: 'tipo', width: 22 },
    { header: 'Opción A', key: 'a', width: 28 },
    { header: 'Opción B', key: 'b', width: 28 },
    { header: 'Opción C', key: 'c', width: 28 },
    { header: 'Opción D', key: 'd', width: 28 },
    { header: 'Opción E', key: 'e', width: 28 },
    { header: 'Opción F', key: 'f', width: 28 },
    { header: 'Respuesta correcta', key: 'correcta', width: 20 },
    { header: 'Puntaje', key: 'puntaje', width: 10 },
  ]

  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  hoja.getRow(1).height = 22
  hoja.views = [{ state: 'frozen', ySplit: 1 }]

  const ejemplos = [
    {
      enunciado: '¿A partir de qué altura es obligatorio el uso de arnés de seguridad?',
      tipo: 'Selección múltiple',
      a: '1,8 metros',
      b: '3 metros',
      c: '5 metros',
      d: 'No es obligatorio',
      correcta: 'A',
      puntaje: 2,
    },
    {
      enunciado: 'El arnés debe inspeccionarse visualmente antes de cada uso.',
      tipo: 'Verdadero o falso',
      correcta: 'Verdadero',
      puntaje: 2,
    },
    {
      enunciado: 'Describa el procedimiento ante una caída con detención por arnés.',
      tipo: 'Respuesta breve',
      puntaje: 4,
    },
  ]
  ejemplos.forEach((e) => hoja.addRow(e))

  // Los ejemplos van en gris cursiva: se ven claramente como algo a reemplazar.
  for (let i = 2; i <= 4; i++) {
    hoja.getRow(i).font = { italic: true, color: { argb: 'FF94A3B8' } }
  }

  hoja.getColumn('tipo').eachCell({ includeEmpty: false }, (celda, fila) => {
    if (fila === 1) return
    celda.dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"Selección múltiple,Verdadero o falso,Respuesta breve"'],
    }
  })

  // --- Hoja de instrucciones ---
  const guia = libro.addWorksheet('Instrucciones')
  guia.columns = [{ width: 100 }]
  const lineas: [string, boolean][] = [
    ['Cómo llenar esta plantilla', true],
    ['', false],
    ['1. Escriba una pregunta por fila en la hoja "Preguntas".', false],
    ['2. Borre las tres filas de ejemplo en gris antes de cargar el archivo.', false],
    ['3. Guarde el archivo y cárguelo desde Plantillas → Cargar desde archivo.', false],
    ['', false],
    ['Columna "Tipo"', true],
    ['   Selección múltiple — llene las opciones A en adelante e indique la correcta.', false],
    ['   Verdadero o falso — deje las opciones vacías y escriba Verdadero o Falso.', false],
    ['   Respuesta breve — deje opciones y respuesta vacías; la corrige el relator.', false],
    ['', false],
    ['Columna "Respuesta correcta"', true],
    ['   Para selección múltiple: la letra de la opción (A, B, C…).', false],
    ['   También se acepta el número (1, 2, 3…) o el texto exacto de la opción.', false],
    ['   Para verdadero o falso: Verdadero o Falso.', false],
    ['   Para respuesta breve: déjela vacía.', false],
    ['', false],
    ['Columna "Puntaje"', true],
    ['   Un número entre 1 y 20. Si la deja vacía se asume 1.', false],
    ['   La nota se calcula sobre el total de puntos, con la exigencia configurada.', false],
    ['', false],
    ['Antes de guardar se revisa el archivo completo y se le muestra', false],
    ['qué se detectó y qué filas tienen problemas, con su número de fila.', false],
    ['Nada se guarda hasta que usted confirme.', false],
  ]
  lineas.forEach(([texto, negrita]) => {
    const fila = guia.addRow([texto])
    if (negrita) fila.font = { bold: true }
  })

  return Buffer.from(await libro.xlsx.writeBuffer())
}

export async function generarPlantillaEncuesta(): Promise<Buffer> {
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Uppercap'

  const hoja = libro.addWorksheet('Preguntas')
  hoja.columns = [
    { header: 'Enunciado', key: 'enunciado', width: 70 },
    { header: 'Tipo', key: 'tipo', width: 22 },
  ]
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  hoja.getRow(1).height = 22
  hoja.views = [{ state: 'frozen', ySplit: 1 }]

  const ejemplos = [
    ['El relator dominaba los contenidos del curso.', 'Escala'],
    ['Los contenidos son aplicables a mi trabajo diario.', 'Escala'],
    ['El material entregado fue claro y suficiente.', 'Escala'],
    ['Las condiciones de la sala fueron adecuadas.', 'Escala'],
    ['Recomendaría este curso a un compañero de trabajo.', 'Escala'],
    ['¿Qué mejoraría de este curso?', 'Texto libre'],
  ]
  ejemplos.forEach((e) => hoja.addRow(e))
  for (let i = 2; i <= ejemplos.length + 1; i++) {
    hoja.getRow(i).font = { italic: true, color: { argb: 'FF94A3B8' } }
  }

  hoja.getColumn('tipo').eachCell({ includeEmpty: false }, (celda, fila) => {
    if (fila === 1) return
    celda.dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"Escala,Sí o no,Texto libre"'],
    }
  })

  const guia = libro.addWorksheet('Instrucciones')
  guia.columns = [{ width: 100 }]
  const lineas: [string, boolean][] = [
    ['Cómo llenar esta plantilla', true],
    ['', false],
    ['1. Escriba una pregunta por fila en la hoja "Preguntas".', false],
    ['2. Las filas de ejemplo son la encuesta habitual de Uppercap:', false],
    ['   déjelas si le sirven, edítelas o bórrelas.', false],
    ['3. Cárguela desde Plantillas → Cargar desde archivo.', false],
    ['', false],
    ['Columna "Tipo"', true],
    ['   Escala — el participante elige un número (1 a 7 por defecto).', false],
    ['   Sí o no — respuesta binaria.', false],
    ['   Texto libre — comentario abierto, opcional para el participante.', false],
    ['', false],
    ['El rango de la escala se configura al crear la encuesta, no aquí.', false],
    ['Las preguntas de escala son las que promedian en el expediente.', false],
  ]
  lineas.forEach(([texto, negrita]) => {
    const fila = guia.addRow([texto])
    if (negrita) fila.font = { bold: true }
  })

  // Franja gris bajo el encabezado de la hoja de instrucciones, por prolijidad.
  guia.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }

  return Buffer.from(await libro.xlsx.writeBuffer())
}
