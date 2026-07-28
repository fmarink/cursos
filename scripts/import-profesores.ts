/**
 * Importador de la base de profesores desde el Excel actual de Uppercap.
 *
 *   npm run import:profesores -- ruta/al/archivo.xlsx
 *   npm run import:profesores -- archivo.xlsx --hoja "Relatores" --dry-run
 *
 * El mapeo de columnas es por nombre de encabezado y tolera variantes de
 * escritura, acentos y mayúsculas. Si el Excel real trae columnas que no están
 * contempladas, aparecen en el reporte final como "columnas no mapeadas" para
 * decidir qué hacer con ellas — ver README.
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../src/db/schema'
import { normalizarRut, validarRut } from '../src/lib/rut'

const { profesorMaterias, profesores, tiposCurso } = schema

/** Sinónimos aceptados por campo. Se comparan normalizados. */
const MAPEO: Record<string, string[]> = {
  nombre: ['nombre', 'nombre completo', 'relator', 'profesor', 'nombres y apellidos', 'nombres'],
  rut: ['rut', 'r.u.t', 'run', 'rut relator', 'cedula'],
  telefono: ['telefono', 'fono', 'celular', 'movil', 'contacto', 'telefono contacto'],
  email: ['email', 'correo', 'mail', 'correo electronico', 'e-mail'],
  direccion: ['direccion', 'domicilio', 'direccion particular'],
  comuna: ['comuna', 'ciudad', 'localidad'],
  materias: [
    'materias',
    'materia',
    'cursos',
    'cursos que imparte',
    'especialidad',
    'especialidades',
    'areas',
    'area',
    'temas',
  ],
  notas: ['notas', 'observaciones', 'comentarios'],
}

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
  if (typeof celda === 'object') {
    if ('text' in celda) return String(celda.text ?? '').trim()
    if ('result' in celda) return String(celda.result ?? '').trim()
    if ('richText' in celda) {
      return (celda.richText as { text: string }[]).map((r) => r.text).join('').trim()
    }
    if (celda instanceof Date) return celda.toISOString()
  }
  return String(celda).trim()
}

async function main() {
  const args = process.argv.slice(2)
  const ruta = args.find((a) => !a.startsWith('--'))
  const dryRun = args.includes('--dry-run')
  const hojaPedida = args[args.indexOf('--hoja') + 1]

  if (!ruta) {
    console.error(`
Uso: npm run import:profesores -- <archivo.xlsx> [--hoja "Nombre"] [--dry-run]

  --hoja      Nombre de la hoja a leer. Por defecto, la primera.
  --dry-run   Muestra lo que haría sin escribir en la base de datos.
`)
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool, { schema })

  const libro = new ExcelJS.Workbook()
  await libro.xlsx.readFile(ruta)

  const hoja = hojaPedida ? libro.getWorksheet(hojaPedida) : libro.worksheets[0]
  if (!hoja) {
    console.error(`No se encontró la hoja${hojaPedida ? ` "${hojaPedida}"` : ''}.`)
    console.error('Hojas disponibles:', libro.worksheets.map((h) => h.name).join(', '))
    process.exit(1)
  }

  console.log(`\nLeyendo "${hoja.name}" de ${ruta}`)

  // --- Encabezados ---
  const encabezados: string[] = []
  hoja.getRow(1).eachCell({ includeEmpty: true }, (celda, col) => {
    encabezados[col] = normalizar(valorCelda(celda.value))
  })

  const columnas: Record<string, number> = {}
  const noMapeadas: string[] = []

  encabezados.forEach((titulo, col) => {
    if (!titulo) return
    const campo = Object.entries(MAPEO).find(([, sinonimos]) =>
      sinonimos.some((s) => titulo === s || titulo.includes(s)),
    )?.[0]
    if (campo && !columnas[campo]) columnas[campo] = col
    else if (!campo) noMapeadas.push(titulo)
  })

  if (!columnas.nombre) {
    console.error('\nNo se encontró una columna de nombre. Encabezados detectados:')
    console.error(encabezados.filter(Boolean).join(' | '))
    process.exit(1)
  }

  console.log('\nMapeo de columnas:')
  for (const [campo, col] of Object.entries(columnas)) {
    console.log(`  ${campo.padEnd(10)} → columna ${col} ("${encabezados[col]}")`)
  }
  if (noMapeadas.length > 0) {
    console.log('\nColumnas no mapeadas (se ignoran):')
    noMapeadas.forEach((c) => console.log(`  - ${c}`))
  }

  // --- Catálogo de materias existente ---
  const tipos = await db.select().from(tiposCurso)
  const porNombre = new Map(tipos.map((t) => [normalizar(t.nombre), t]))

  // --- Filas ---
  let creados = 0
  let actualizados = 0
  let omitidos = 0
  const advertencias: string[] = []

  for (let i = 2; i <= hoja.rowCount; i++) {
    const fila = hoja.getRow(i)
    const leer = (campo: string) =>
      columnas[campo] ? valorCelda(fila.getCell(columnas[campo]).value) : ''

    const nombre = leer('nombre')
    if (!nombre || nombre.length < 3) {
      omitidos++
      continue
    }

    const rutCrudo = leer('rut')
    let rut: string | null = null
    if (rutCrudo) {
      if (validarRut(rutCrudo)) {
        rut = normalizarRut(rutCrudo)
      } else {
        advertencias.push(`Fila ${i} (${nombre}): RUT "${rutCrudo}" inválido, se importa sin RUT.`)
      }
    }

    const emailCrudo = leer('email')
    const email =
      emailCrudo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCrudo) ? emailCrudo : null
    if (emailCrudo && !email) {
      advertencias.push(`Fila ${i} (${nombre}): correo "${emailCrudo}" con formato inválido.`)
    }

    const valores = {
      nombre,
      rut,
      telefono: leer('telefono') || null,
      email,
      direccion: leer('direccion') || null,
      comuna: leer('comuna') || null,
      notas: leer('notas') || null,
    }

    if (dryRun) {
      console.log(`  [simulado] ${nombre}${rut ? ` (${rut})` : ''}`)
      creados++
      continue
    }

    // Se identifica por RUT si lo hay; si no, por nombre exacto.
    const [existente] = rut
      ? await db.select().from(profesores).where(eq(profesores.rut, rut)).limit(1)
      : await db.select().from(profesores).where(eq(profesores.nombre, nombre)).limit(1)

    let profesorId: string
    if (existente) {
      await db.update(profesores).set(valores).where(eq(profesores.id, existente.id))
      profesorId = existente.id
      actualizados++
    } else {
      const [creado] = await db.insert(profesores).values(valores).returning({ id: profesores.id })
      profesorId = creado.id
      creados++
    }

    // --- Materias ---
    const materiasCrudas = leer('materias')
    if (materiasCrudas) {
      const nombres = materiasCrudas
        .split(/[,;/|]/)
        .map((s) => s.trim())
        .filter(Boolean)

      for (const nombreMateria of nombres) {
        let tipo = porNombre.get(normalizar(nombreMateria))
        if (!tipo) {
          // Crea el tipo de curso si el Excel menciona una materia que no existe.
          const [nuevo] = await db
            .insert(tiposCurso)
            .values({ nombre: nombreMateria, horasDefault: 8 })
            .returning()
          tipo = nuevo
          porNombre.set(normalizar(nombreMateria), nuevo)
          advertencias.push(`Se creó el tipo de curso "${nombreMateria}" (venía en el Excel).`)
        }
        await db
          .insert(profesorMaterias)
          .values({ profesorId, tipoCursoId: tipo.id })
          .onConflictDoNothing()
      }
    }
  }

  console.log('\n--- Resumen ---')
  console.log(`  Creados:      ${creados}`)
  console.log(`  Actualizados: ${actualizados}`)
  console.log(`  Omitidos:     ${omitidos} (filas sin nombre)`)

  if (advertencias.length > 0) {
    console.log(`\nAdvertencias (${advertencias.length}):`)
    advertencias.forEach((a) => console.log(`  - ${a}`))
  }
  if (dryRun) console.log('\nModo simulación: no se escribió nada en la base de datos.')

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
