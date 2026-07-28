import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { clientes, cursos, lugares, profesores, sesiones, tiposCurso } from '@/db/schema'

export type SesionPublica = Awaited<ReturnType<typeof buscarSesionPorToken>>

/**
 * Resuelve un token opaco de QR a su sesión, junto con el contexto necesario
 * para renderizar la pantalla del participante.
 *
 * `proposito` determina cuál de los tres tokens se busca. Un token de
 * asistencia no sirve para entrar a la evaluación.
 */
export async function buscarSesionPorToken(
  token: string,
  proposito: 'asistencia' | 'evaluacion' | 'encuesta',
) {
  const columna =
    proposito === 'asistencia'
      ? sesiones.tokenAsistencia
      : proposito === 'evaluacion'
        ? sesiones.tokenEvaluacion
        : sesiones.tokenEncuesta

  const [fila] = await db
    .select({
      sesion: sesiones,
      curso: cursos,
      cliente: clientes,
      tipoCurso: tiposCurso,
      lugar: lugares,
      profesor: profesores,
    })
    .from(sesiones)
    .innerJoin(cursos, eq(sesiones.cursoId, cursos.id))
    .innerJoin(clientes, eq(cursos.clienteId, clientes.id))
    .innerJoin(tiposCurso, eq(cursos.tipoCursoId, tiposCurso.id))
    .leftJoin(lugares, eq(cursos.lugarId, lugares.id))
    .leftJoin(profesores, eq(sesiones.profesorId, profesores.id))
    .where(eq(columna, token))
    .limit(1)

  return fila ?? null
}

/** Nombre del lugar considerando catálogo y campo libre. */
export function nombreLugar(curso: { lugarLibre: string | null }, lugar: { nombre: string } | null) {
  return lugar?.nombre ?? curso.lugarLibre ?? 'Por definir'
}

export async function sesionesDeCurso(cursoId: string) {
  return db
    .select()
    .from(sesiones)
    .where(eq(sesiones.cursoId, cursoId))
    .orderBy(sesiones.fecha, sesiones.horaInicio)
}

export async function sesionConContexto(sesionId: string) {
  const [fila] = await db
    .select({
      sesion: sesiones,
      curso: cursos,
      cliente: clientes,
      tipoCurso: tiposCurso,
      lugar: lugares,
      profesor: profesores,
    })
    .from(sesiones)
    .innerJoin(cursos, eq(sesiones.cursoId, cursos.id))
    .innerJoin(clientes, eq(cursos.clienteId, clientes.id))
    .innerJoin(tiposCurso, eq(cursos.tipoCursoId, tiposCurso.id))
    .leftJoin(lugares, eq(cursos.lugarId, lugares.id))
    .leftJoin(profesores, eq(sesiones.profesorId, profesores.id))
    .where(eq(sesiones.id, sesionId))
    .limit(1)
  return fila ?? null
}

/** Solo se registra en sesiones abiertas o reabiertas. */
export function aceptaRegistros(estado: string, abierta: boolean) {
  return abierta && (estado === 'ABIERTA' || estado === 'REABIERTA')
}


export { NIVELES_ESCOLARIDAD } from './constantes'
