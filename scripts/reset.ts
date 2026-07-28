/**
 * Vacía todas las tablas de datos, conservando el esquema.
 * Útil para volver a un estado limpio antes de un nuevo seed.
 *
 *   npm run db:reset && npm run db:seed
 */
import 'dotenv/config'
import { Pool } from 'pg'

const TABLAS = [
  'audit_log',
  'expedientes',
  'adjuntos',
  'bloques_contenido',
  'respuestas_encuesta',
  'evaluaciones',
  'firmas',
  'asistencias',
  'participantes',
  'nomina_items',
  'sesiones',
  'cursos',
  'preguntas',
  'plantillas_evaluacion',
  'preguntas_encuesta',
  'plantillas_encuesta',
  'profesor_materias',
  'usuarios',
  'profesores',
  'lugares',
  'tipos_curso',
  'clientes',
]

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  await pool.query(`TRUNCATE ${TABLAS.join(', ')} RESTART IDENTITY CASCADE`)
  console.log(`Vaciadas ${TABLAS.length} tablas.`)
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
