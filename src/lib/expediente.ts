import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { adjuntos } from '@/db/schema'
import {
  contenidosDeSesion,
  encuestasDeSesion,
  registrosDeSesion,
  resumir,
} from '@/lib/registros'
import { preguntasDeEncuesta, resolverPlantillaEncuesta, resolverPlantillaEvaluacion } from '@/lib/plantillas'
import { nombreLugar, sesionConContexto } from '@/lib/sesiones'

export type DatosExpediente = Awaited<ReturnType<typeof armarExpediente>>

/**
 * Reúne todo lo que va en el expediente de una jornada. Es la única fuente de
 * verdad tanto para el PDF como para la exportación a Excel y para la pantalla
 * de revisión de operaciones.
 */
export async function armarExpediente(sesionId: string) {
  const ctx = await sesionConContexto(sesionId)
  if (!ctx) return null

  const [registros, contenidos, encuestas, archivos] = await Promise.all([
    // conFirma: el expediente necesita las imágenes de firma incrustadas.
    registrosDeSesion(sesionId, ctx.curso.id, { conFirma: true }),
    contenidosDeSesion(sesionId),
    encuestasDeSesion(sesionId),
    db.select().from(adjuntos).where(eq(adjuntos.sesionId, sesionId)),
  ])

  const vigentes = registros.filter((r) => !r.anulado && r.asistenciaId)
  const resumen = resumir(registros, ctx.curso.nominaEsperada)

  const plantillaEval = await resolverPlantillaEvaluacion(
    ctx.sesion.plantillaEvaluacionId,
    ctx.curso.tipoCursoId,
    ctx.curso.clienteId,
  )

  const plantillaEnc = await resolverPlantillaEncuesta(ctx.sesion.plantillaEncuestaId)
  const preguntasEnc = plantillaEnc ? await preguntasDeEncuesta(plantillaEnc.id) : []

  // Promedios por pregunta de la encuesta.
  const resumenEncuesta = preguntasEnc
    .filter((p) => p.tipo === 'ESCALA')
    .map((p) => {
      const valores = encuestas
        .map((e) => (e.respuestas as Record<string, unknown>)[p.id])
        .filter((v): v is number => typeof v === 'number')
      return {
        enunciado: p.enunciado,
        promedio: valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null,
        respuestas: valores.length,
      }
    })

  const comentarios = preguntasEnc
    .filter((p) => p.tipo === 'TEXTO')
    .flatMap((p) =>
      encuestas
        .map((e) => (e.respuestas as Record<string, unknown>)[p.id])
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0),
    )

  const alertas = registros
    .filter((r) => !r.anulado && r.estadoValidacion !== 'OK')
    .map((r) => ({
      participanteId: r.participanteId,
      nombre: r.nombre,
      rut: r.rut,
      estado: r.estadoValidacion,
      nota: r.notaRevision,
    }))

  const sinFirma = vigentes.filter((r) => !r.tieneFirma)

  return {
    ...ctx,
    lugarNombre: nombreLugar(ctx.curso, ctx.lugar),
    registros,
    vigentes,
    resumen,
    contenidos,
    encuestas,
    resumenEncuesta,
    comentarios,
    alertas,
    sinFirma,
    fotoGrupal: archivos.find((a) => a.tipo === 'FOTO_GRUPAL') ?? null,
    respaldos: archivos.filter((a) => a.tipo !== 'FOTO_GRUPAL'),
    plantillaEval,
    plantillaEnc,
    umbral: plantillaEval ? Number(plantillaEval.umbralAprobacion) : null,
  }
}

/** Bloqueadores que operaciones debe resolver antes de enviar al cliente. */
export function problemasBloqueantes(datos: NonNullable<DatosExpediente>) {
  const problemas: string[] = []
  if (datos.vigentes.length === 0) problemas.push('No hay participantes registrados en la jornada.')
  if (datos.sinFirma.length > 0)
    problemas.push(`${datos.sinFirma.length} participante(s) sin firma registrada.`)
  if (datos.contenidos.length === 0)
    problemas.push('No se registraron los contenidos impartidos.')
  return problemas
}
