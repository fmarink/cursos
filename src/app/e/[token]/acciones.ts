'use server'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { evaluaciones, participantes } from '@/db/schema'
import { auditar } from '@/lib/audit'
import { ipCliente } from '@/lib/auth'
import { corregirAutomatico, preguntasDePlantilla, resolverPlantillaEvaluacion } from '@/lib/plantillas'
import { normalizarRut, validarRut } from '@/lib/rut'
import { buscarSesionPorToken } from '@/lib/sesiones'

const Entrada = z.object({
  rut: z.string().trim().min(3),
  respuestas: z.record(z.string(), z.string()),
})

export type ResultadoEvaluacion =
  | { ok: true; nota: number; aprobado: boolean; pendiente: boolean; nombre: string }
  | { ok: false; error: string }

/**
 * Recibe una evaluación. El participante se identifica por RUT: ya firmó la
 * asistencia, así que no se le pide crear cuenta ni repetir sus datos.
 */
export async function enviarEvaluacion(
  token: string,
  datos: unknown,
): Promise<ResultadoEvaluacion> {
  const parsed = Entrada.safeParse(datos)
  if (!parsed.success) return { ok: false, error: 'Datos incompletos.' }
  const d = parsed.data

  const ctx = await buscarSesionPorToken(token, 'evaluacion')
  if (!ctx) return { ok: false, error: 'El código no corresponde a ningún curso activo.' }

  if (
    !ctx.sesion.evaluacionAbierta ||
    !(ctx.sesion.estado === 'ABIERTA' || ctx.sesion.estado === 'REABIERTA')
  ) {
    return { ok: false, error: 'La evaluación ya no está habilitada.' }
  }

  if (!validarRut(d.rut)) {
    return { ok: false, error: 'El RUT no es válido. Revise el dígito verificador.' }
  }
  const rut = normalizarRut(d.rut)!

  const [participante] = await db
    .select()
    .from(participantes)
    .where(and(eq(participantes.cursoId, ctx.curso.id), eq(participantes.rut, rut)))
    .limit(1)

  if (!participante) {
    return {
      ok: false,
      error:
        'No encontramos su registro de asistencia en este curso. Registre primero su asistencia o avise al relator.',
    }
  }

  const plantilla = await resolverPlantillaEvaluacion(
    ctx.sesion.plantillaEvaluacionId,
    ctx.curso.tipoCursoId,
    ctx.curso.clienteId,
  )
  if (!plantilla) return { ok: false, error: 'No hay una evaluación configurada para este curso.' }

  const listaPreguntas = await preguntasDePlantilla(plantilla.id)
  const resultado = corregirAutomatico(
    listaPreguntas.map((p) => ({
      id: p.id,
      tipo: p.tipo,
      respuestaCorrecta: p.respuestaCorrecta,
      puntaje: p.puntaje,
    })),
    d.respuestas,
    Number(plantilla.umbralAprobacion),
    plantilla.exigencia,
  )

  await db
    .insert(evaluaciones)
    .values({
      participanteId: participante.id,
      sesionId: ctx.sesion.id,
      plantillaId: plantilla.id,
      respuestas: d.respuestas,
      puntajes: resultado.puntajes,
      puntajeTotal: resultado.puntajeTotal,
      puntajeMaximo: resultado.puntajeMaximo,
      nota: resultado.nota.toFixed(1),
      aprobado: resultado.aprobado,
      requiereCorreccionManual: resultado.requiereCorreccionManual,
    })
    .onConflictDoUpdate({
      target: [evaluaciones.participanteId, evaluaciones.sesionId],
      set: {
        respuestas: d.respuestas,
        puntajes: resultado.puntajes,
        puntajeTotal: resultado.puntajeTotal,
        puntajeMaximo: resultado.puntajeMaximo,
        nota: resultado.nota.toFixed(1),
        aprobado: resultado.aprobado,
        requiereCorreccionManual: resultado.requiereCorreccionManual,
        completadaEn: new Date(),
      },
    })

  await auditar({
    entidad: 'evaluacion',
    entidadId: participante.id,
    accion: 'evaluacion_respondida',
    valorNuevo: {
      puntaje: resultado.puntajeTotal,
      maximo: resultado.puntajeMaximo,
      nota: resultado.nota,
    },
    actorAnonimo: rut,
    ip: await ipCliente(),
  })

  return {
    ok: true,
    nota: resultado.nota,
    aprobado: resultado.aprobado,
    pendiente: resultado.requiereCorreccionManual,
    nombre: participante.nombre,
  }
}
