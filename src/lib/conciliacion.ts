import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { asistencias, nominaItems, participantes } from '@/db/schema'
import { normalizarRut } from './rut'

export type AlumnoNomina = {
  id: string
  nombre: string
  rut: string | null
  empresa: string | null
  cargo: string | null
  /** Ya hay un registro vinculado a este alumno. */
  tomado: boolean
}

/**
 * Lista del curso para mostrarle al participante cuando escanea el QR.
 *
 * Solo se expone el nombre y si ya está tomado. **No se envía el RUT al
 * navegador**: cualquiera con el QR vería la lista, y el RUT es un dato
 * personal que no hace falta para que alguien se reconozca en la lista.
 * El RUT se completa en el servidor al confirmar el registro.
 */
export async function listaDelCurso(cursoId: string): Promise<AlumnoNomina[]> {
  const filas = await db
    .select({
      id: nominaItems.id,
      nombre: nominaItems.nombre,
      rut: nominaItems.rut,
      empresa: nominaItems.empresa,
      cargo: nominaItems.cargo,
      tomadoPor: participantes.id,
    })
    .from(nominaItems)
    .leftJoin(
      participantes,
      and(eq(participantes.nominaItemId, nominaItems.id), eq(participantes.anulado, false)),
    )
    .where(eq(nominaItems.cursoId, cursoId))
    .orderBy(asc(nominaItems.nombre))

  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    rut: f.rut,
    empresa: f.empresa,
    cargo: f.cargo,
    tomado: f.tomadoPor !== null,
  }))
}

/** Versión segura para enviar al navegador del participante: sin RUT. */
export function paraElParticipante(lista: AlumnoNomina[]) {
  return lista.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    tomado: a.tomado,
    /** Indica si tendrá que escribir su RUT porque la nómina no lo trae. */
    pideRut: !a.rut,
  }))
}

export type FilaConciliacion = {
  nominaItemId: string | null
  participanteId: string | null
  nombreNomina: string | null
  rutNomina: string | null
  nombreRegistrado: string | null
  rutRegistrado: string | null
  empresa: string | null
  cargo: string | null
  registradoEn: Date | null
  tieneFirma: boolean
  origen: string | null
  estadoValidacion: string | null
  vinculadoPor: string | null
  /** presente = alumno de la nómina con registro; falta = sin registro;
   *  sobrante = registro sin alumno de la nómina asociado. */
  situacion: 'conciliado' | 'falta' | 'sin_conciliar'
}

/**
 * Estado de conciliación de una jornada: la nómina esperada frente a los
 * registros recibidos. Es la vista que usa el instructor para cerrar el círculo
 * entre "quién debía venir" y "quién efectivamente firmó".
 */
export async function conciliacionDeSesion(
  sesionId: string,
  cursoId: string,
): Promise<FilaConciliacion[]> {
  // 1. Alumnos de la nómina, con su registro vinculado si existe.
  const desdeNomina = await db
    .select({
      nominaItemId: nominaItems.id,
      nombreNomina: nominaItems.nombre,
      rutNomina: nominaItems.rut,
      empresaNomina: nominaItems.empresa,
      cargoNomina: nominaItems.cargo,
      participanteId: participantes.id,
      nombreRegistrado: participantes.nombre,
      rutRegistrado: participantes.rut,
      empresa: participantes.empresa,
      cargo: participantes.cargo,
      origen: participantes.origen,
      estadoValidacion: participantes.estadoValidacion,
      vinculadoPor: participantes.vinculadoPor,
      registradoEn: asistencias.registradoEn,
      asistenciaId: asistencias.id,
    })
    .from(nominaItems)
    .leftJoin(
      participantes,
      and(eq(participantes.nominaItemId, nominaItems.id), eq(participantes.anulado, false)),
    )
    .leftJoin(
      asistencias,
      and(eq(asistencias.participanteId, participantes.id), eq(asistencias.sesionId, sesionId)),
    )
    .where(eq(nominaItems.cursoId, cursoId))
    .orderBy(asc(nominaItems.nombre))

  // 2. Registros que no están vinculados a ningún alumno de la nómina.
  const sinConciliar = await db
    .select({
      participanteId: participantes.id,
      nombreRegistrado: participantes.nombre,
      rutRegistrado: participantes.rut,
      empresa: participantes.empresa,
      cargo: participantes.cargo,
      origen: participantes.origen,
      estadoValidacion: participantes.estadoValidacion,
      registradoEn: asistencias.registradoEn,
      asistenciaId: asistencias.id,
    })
    .from(participantes)
    .leftJoin(
      asistencias,
      and(eq(asistencias.participanteId, participantes.id), eq(asistencias.sesionId, sesionId)),
    )
    .where(
      and(
        eq(participantes.cursoId, cursoId),
        eq(participantes.anulado, false),
        isNull(participantes.nominaItemId),
      ),
    )
    .orderBy(asc(asistencias.registradoEn))

  // Firmas, en una sola consulta.
  const idsAsistencia = [
    ...desdeNomina.map((f) => f.asistenciaId),
    ...sinConciliar.map((f) => f.asistenciaId),
  ].filter(Boolean) as string[]

  const conFirma = new Set<string>()
  if (idsAsistencia.length > 0) {
    const { firmas } = await import('@/db/schema')
    const { inArray } = await import('drizzle-orm')
    const filas = await db
      .select({ asistenciaId: firmas.asistenciaId })
      .from(firmas)
      .where(inArray(firmas.asistenciaId, idsAsistencia))
    filas.forEach((f) => conFirma.add(f.asistenciaId))
  }

  const resultado: FilaConciliacion[] = desdeNomina.map((f) => ({
    nominaItemId: f.nominaItemId,
    participanteId: f.participanteId,
    nombreNomina: f.nombreNomina,
    rutNomina: f.rutNomina,
    nombreRegistrado: f.nombreRegistrado,
    rutRegistrado: f.rutRegistrado,
    empresa: f.empresa ?? f.empresaNomina,
    cargo: f.cargo ?? f.cargoNomina,
    registradoEn: f.registradoEn,
    tieneFirma: f.asistenciaId ? conFirma.has(f.asistenciaId) : false,
    origen: f.origen,
    estadoValidacion: f.estadoValidacion,
    vinculadoPor: f.vinculadoPor,
    situacion: f.participanteId && f.asistenciaId ? 'conciliado' : 'falta',
  }))

  resultado.push(
    ...sinConciliar.map(
      (f): FilaConciliacion => ({
        nominaItemId: null,
        participanteId: f.participanteId,
        nombreNomina: null,
        rutNomina: null,
        nombreRegistrado: f.nombreRegistrado,
        rutRegistrado: f.rutRegistrado,
        empresa: f.empresa,
        cargo: f.cargo,
        registradoEn: f.registradoEn,
        tieneFirma: f.asistenciaId ? conFirma.has(f.asistenciaId) : false,
        origen: f.origen,
        estadoValidacion: f.estadoValidacion,
        vinculadoPor: null,
        situacion: 'sin_conciliar',
      }),
    ),
  )

  return resultado
}

/** Alumnos de la nómina todavía libres, para el desplegable de emparejado. */
export async function alumnosLibres(cursoId: string) {
  const lista = await listaDelCurso(cursoId)
  return lista.filter((a) => !a.tomado)
}

/**
 * Busca en la nómina un alumno que calce con los datos escritos a mano.
 * Primero por RUT, que es inequívoco; si no, por nombre normalizado.
 * Devuelve null si no hay una coincidencia razonable — es preferible dejar el
 * registro sin conciliar que emparejarlo con la persona equivocada.
 */
export function sugerirCoincidencia(
  lista: AlumnoNomina[],
  datos: { nombre: string; rut: string },
): AlumnoNomina | null {
  const rut = normalizarRut(datos.rut)
  if (rut) {
    const porRut = lista.find((a) => a.rut && normalizarRut(a.rut) === rut && !a.tomado)
    if (porRut) return porRut
  }

  const objetivo = normalizarNombre(datos.nombre)
  const porNombre = lista.filter((a) => !a.tomado && normalizarNombre(a.nombre) === objetivo)
  if (porNombre.length === 1) return porNombre[0]

  // Coincidencia por conjunto de palabras: tolera el orden apellido/nombre.
  const palabras = new Set(objetivo.split(' ').filter((p) => p.length > 2))
  if (palabras.size >= 2) {
    const candidatos = lista.filter((a) => {
      if (a.tomado) return false
      const suyas = new Set(normalizarNombre(a.nombre).split(' ').filter((p) => p.length > 2))
      const comunes = [...palabras].filter((p) => suyas.has(p)).length
      return comunes >= 2 && comunes >= Math.min(palabras.size, suyas.size) - 1
    })
    if (candidatos.length === 1) return candidatos[0]
  }

  return null
}

function normalizarNombre(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
