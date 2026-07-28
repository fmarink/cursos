'use server'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { participantes, respuestasEncuesta } from '@/db/schema'
import { auditar } from '@/lib/audit'
import { normalizarRut, validarRut } from '@/lib/rut'
import { resolverPlantillaEncuesta } from '@/lib/plantillas'
import { buscarSesionPorToken } from '@/lib/sesiones'

const Entrada = z.object({
  rut: z.string().trim().optional().or(z.literal('')),
  respuestas: z.record(z.string(), z.union([z.string(), z.number()])),
})

export async function enviarEncuesta(
  token: string,
  datos: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = Entrada.safeParse(datos)
  if (!parsed.success) return { ok: false, error: 'Datos incompletos.' }
  const d = parsed.data

  const ctx = await buscarSesionPorToken(token, 'encuesta')
  if (!ctx) return { ok: false, error: 'El código no corresponde a ningún curso activo.' }

  if (
    !ctx.sesion.encuestaAbierta ||
    !(ctx.sesion.estado === 'ABIERTA' || ctx.sesion.estado === 'REABIERTA')
  ) {
    return { ok: false, error: 'La encuesta ya no está habilitada.' }
  }

  const plantilla = await resolverPlantillaEncuesta(ctx.sesion.plantillaEncuestaId)
  if (!plantilla) return { ok: false, error: 'No hay una encuesta configurada.' }

  // Solo se vincula al participante si la plantilla NO es anónima.
  let participanteId: string | null = null
  if (!plantilla.anonima && d.rut && validarRut(d.rut)) {
    const rut = normalizarRut(d.rut)!
    const [p] = await db
      .select({ id: participantes.id })
      .from(participantes)
      .where(and(eq(participantes.cursoId, ctx.curso.id), eq(participantes.rut, rut)))
      .limit(1)
    participanteId = p?.id ?? null
  }

  await db.insert(respuestasEncuesta).values({
    plantillaId: plantilla.id,
    sesionId: ctx.sesion.id,
    participanteId,
    respuestas: d.respuestas,
  })

  await auditar({
    entidad: 'encuesta',
    entidadId: ctx.sesion.id,
    accion: 'encuesta_respondida',
    valorNuevo: { anonima: plantilla.anonima },
  })

  return { ok: true }
}
