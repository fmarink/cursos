import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  asistencias,
  bloquesContenido,
  evaluaciones,
  firmas,
  nominaItems,
  participantes,
  respuestasEncuesta,
} from '@/db/schema'

export type RegistroSesion = {
  participanteId: string
  asistenciaId: string | null
  nombre: string
  rut: string
  empresa: string | null
  cargo: string | null
  nivelEscolaridad: string | null
  origen: string
  estadoValidacion: string
  notaRevision: string | null
  anulado: boolean
  presente: boolean
  registradoEn: Date | null
  tieneFirma: boolean
  firmaPng: string | null
  hashFirma: string | null
  nota: string | null
  aprobado: boolean | null
}

/**
 * Registros de una jornada. Incluye a todos los participantes del curso,
 * incluso a los que no marcaron asistencia ese día, para que el profesor vea
 * de un vistazo quién falta.
 */
export async function registrosDeSesion(
  sesionId: string,
  cursoId: string,
  opciones: { conFirma?: boolean } = {},
): Promise<RegistroSesion[]> {
  const filas = await db
    .select({
      participanteId: participantes.id,
      asistenciaId: asistencias.id,
      nombre: participantes.nombre,
      rut: participantes.rut,
      empresa: participantes.empresa,
      cargo: participantes.cargo,
      nivelEscolaridad: participantes.nivelEscolaridad,
      origen: participantes.origen,
      estadoValidacion: participantes.estadoValidacion,
      notaRevision: participantes.notaRevision,
      anulado: participantes.anulado,
      presente: asistencias.presente,
      registradoEn: asistencias.registradoEn,
      firmaPng: opciones.conFirma ? firmas.imagenPng : sql<string | null>`null`,
      hashFirma: firmas.hash,
      firmaId: firmas.id,
      nota: evaluaciones.nota,
      aprobado: evaluaciones.aprobado,
    })
    .from(participantes)
    .leftJoin(
      asistencias,
      and(eq(asistencias.participanteId, participantes.id), eq(asistencias.sesionId, sesionId)),
    )
    .leftJoin(firmas, eq(firmas.asistenciaId, asistencias.id))
    .leftJoin(
      evaluaciones,
      and(
        eq(evaluaciones.participanteId, participantes.id),
        eq(evaluaciones.sesionId, sesionId),
      ),
    )
    .where(eq(participantes.cursoId, cursoId))
    .orderBy(asc(asistencias.registradoEn), asc(participantes.nombre))

  return filas.map((f) => ({
    participanteId: f.participanteId,
    asistenciaId: f.asistenciaId,
    nombre: f.nombre,
    rut: f.rut,
    empresa: f.empresa,
    cargo: f.cargo,
    nivelEscolaridad: f.nivelEscolaridad,
    origen: f.origen,
    estadoValidacion: f.estadoValidacion,
    notaRevision: f.notaRevision,
    anulado: f.anulado,
    presente: f.presente ?? false,
    registradoEn: f.registradoEn,
    tieneFirma: Boolean(f.firmaId),
    firmaPng: f.firmaPng ?? null,
    hashFirma: f.hashFirma,
    nota: f.nota,
    aprobado: f.aprobado,
  }))
}

export async function nominaDeCurso(cursoId: string) {
  return db.select().from(nominaItems).where(eq(nominaItems.cursoId, cursoId))
}

export async function contenidosDeSesion(sesionId: string) {
  return db
    .select()
    .from(bloquesContenido)
    .where(eq(bloquesContenido.sesionId, sesionId))
    .orderBy(asc(bloquesContenido.orden), asc(bloquesContenido.horaInicio))
}

export async function encuestasDeSesion(sesionId: string) {
  return db
    .select()
    .from(respuestasEncuesta)
    .where(eq(respuestasEncuesta.sesionId, sesionId))
}

/** Contadores para el encabezado del panel del profesor. */
export function resumir(registros: RegistroSesion[], nominaEsperada: number) {
  const vigentes = registros.filter((r) => !r.anulado)
  const presentes = vigentes.filter((r) => r.asistenciaId && r.presente)
  return {
    registrados: presentes.length,
    conFirma: presentes.filter((r) => r.tieneFirma).length,
    sinFirma: presentes.filter((r) => !r.tieneFirma).length,
    alertas: vigentes.filter((r) => r.estadoValidacion !== 'OK').length,
    esperados: nominaEsperada,
    faltantes: Math.max(0, nominaEsperada - presentes.length),
    evaluados: vigentes.filter((r) => r.nota !== null).length,
    aprobados: vigentes.filter((r) => r.aprobado === true).length,
  }
}
