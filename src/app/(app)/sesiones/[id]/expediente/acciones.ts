'use server'

import { revalidatePath } from 'next/cache'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { cursos, evaluaciones, expedientes, sesiones } from '@/db/schema'
import { auditar } from '@/lib/audit'
import { ipCliente, requerirRol } from '@/lib/auth'
import { enviarCorreo, plantillaCorreoExpediente } from '@/lib/correo'
import { armarExpediente } from '@/lib/expediente'
import { calcularNota } from '@/lib/notas'
import { formatearFecha } from '@/components/ui'

type Resultado = { ok: true; mensaje?: string } | { ok: false; error: string }

/** Marca el expediente como revisado y validado por operaciones. */
export async function validarExpediente(sesionId: string): Promise<Resultado> {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')

  const [ultimo] = await db
    .select()
    .from(expedientes)
    .where(eq(expedientes.sesionId, sesionId))
    .orderBy(desc(expedientes.version))
    .limit(1)

  if (!ultimo) {
    return { ok: false, error: 'Genere primero el PDF del expediente.' }
  }

  await db
    .update(expedientes)
    .set({ validadoEn: new Date(), validadoPor: usuario.nombre })
    .where(eq(expedientes.id, ultimo.id))

  const [s] = await db.select().from(sesiones).where(eq(sesiones.id, sesionId)).limit(1)
  await db
    .update(cursos)
    .set({ estado: 'EXPEDIENTE_VALIDADO', actualizadoEn: new Date() })
    .where(eq(cursos.id, s.cursoId))

  await auditar({
    entidad: 'expediente',
    entidadId: ultimo.id,
    accion: 'expediente_validado',
    usuarioId: usuario.id,
    ip: await ipCliente(),
  })

  revalidatePath(`/sesiones/${sesionId}/expediente`)
  revalidatePath('/')
  return { ok: true }
}

const Envio = z.object({
  para: z.string().trim().min(5),
  cc: z.string().trim().optional().or(z.literal('')),
  asunto: z.string().trim().min(5).max(200),
})

/** Envía el expediente al representante del cliente y deja registro de auditoría. */
export async function enviarExpediente(sesionId: string, datos: unknown): Promise<Resultado> {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = Envio.safeParse(datos)
  if (!parsed.success) return { ok: false, error: 'Complete el destinatario y el asunto.' }

  const destinatarios = separarCorreos(parsed.data.para)
  if (destinatarios.length === 0) {
    return { ok: false, error: 'Ingrese al menos un correo de destino válido.' }
  }
  const copias = separarCorreos(parsed.data.cc ?? '')

  const [ultimo] = await db
    .select()
    .from(expedientes)
    .where(eq(expedientes.sesionId, sesionId))
    .orderBy(desc(expedientes.version))
    .limit(1)

  if (!ultimo?.pdfBase64) {
    return { ok: false, error: 'Genere primero el PDF del expediente.' }
  }

  const d = await armarExpediente(sesionId)
  if (!d) return { ok: false, error: 'Sesión no encontrada.' }

  const html = plantillaCorreoExpediente({
    cliente: d.cliente.razonSocial,
    curso: d.curso.nombreActividad,
    fecha: formatearFecha(d.sesion.fecha, true),
    lugar: d.lugarNombre,
    relator: d.profesor?.nombre ?? 'No asignado',
    participantes: d.vigentes.length,
    aprobados: d.resumen.evaluados > 0 ? d.resumen.aprobados : null,
  })

  const envio = await enviarCorreo({
    para: destinatarios,
    cc: copias.length ? copias : undefined,
    asunto: parsed.data.asunto,
    html,
    adjuntos: [
      {
        nombre: `Expediente-${d.curso.codigo}.pdf`,
        contenidoBase64: ultimo.pdfBase64,
        mime: 'application/pdf',
      },
    ],
  })

  if (!envio.ok) {
    await auditar({
      entidad: 'expediente',
      entidadId: ultimo.id,
      accion: 'envio_fallido',
      valorNuevo: { para: destinatarios, error: envio.error },
      usuarioId: usuario.id,
    })
    return { ok: false, error: `No se pudo enviar: ${envio.error}` }
  }

  await db
    .update(expedientes)
    .set({
      enviadoA: destinatarios.join(', '),
      enviadoCc: copias.join(', ') || null,
      enviadoEn: new Date(),
      enviadoPor: usuario.nombre,
      asuntoEnvio: parsed.data.asunto,
    })
    .where(eq(expedientes.id, ultimo.id))

  await db
    .update(cursos)
    .set({ estado: 'ENVIADO_AL_CLIENTE', actualizadoEn: new Date() })
    .where(eq(cursos.id, d.curso.id))

  await auditar({
    entidad: 'expediente',
    entidadId: ultimo.id,
    accion: 'expediente_enviado',
    valorNuevo: {
      para: destinatarios,
      cc: copias,
      asunto: parsed.data.asunto,
      proveedor: envio.proveedor,
      idProveedor: envio.id,
    },
    usuarioId: usuario.id,
    ip: await ipCliente(),
  })

  revalidatePath(`/sesiones/${sesionId}/expediente`)
  revalidatePath('/')
  return {
    ok: true,
    mensaje:
      envio.proveedor === 'consola'
        ? 'Envío registrado en modo simulación (CORREO_PROVEEDOR no configurado). El expediente quedó marcado como enviado.'
        : 'Expediente enviado al cliente.',
  }
}

/**
 * Corrección manual del puntaje de una pregunta abierta.
 * Recalcula la nota y el resultado con la exigencia de la plantilla.
 */
export async function corregirPuntajes(
  sesionId: string,
  evaluacionId: string,
  puntajes: Record<string, number>,
): Promise<Resultado> {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES', 'PROFESOR')

  const [ev] = await db.select().from(evaluaciones).where(eq(evaluaciones.id, evaluacionId)).limit(1)
  if (!ev) return { ok: false, error: 'Evaluación no encontrada.' }

  const { plantillasEvaluacion } = await import('@/db/schema')
  const [plantilla] = await db
    .select()
    .from(plantillasEvaluacion)
    .where(eq(plantillasEvaluacion.id, ev.plantillaId))
    .limit(1)

  const total = Object.values(puntajes).reduce((a, b) => a + b, 0)
  const umbral = Number(plantilla.umbralAprobacion)
  const nota = calcularNota(total, ev.puntajeMaximo, umbral, plantilla.exigencia)

  await db
    .update(evaluaciones)
    .set({
      puntajes,
      puntajeTotal: total,
      nota: nota.toFixed(1),
      aprobado: nota >= umbral,
      requiereCorreccionManual: false,
      corregidaPor: usuario.nombre,
      corregidaEn: new Date(),
    })
    .where(eq(evaluaciones.id, evaluacionId))

  await auditar({
    entidad: 'evaluacion',
    entidadId: evaluacionId,
    accion: 'correccion_manual',
    valorAnterior: { puntajeTotal: ev.puntajeTotal, nota: ev.nota },
    valorNuevo: { puntajeTotal: total, nota },
    usuarioId: usuario.id,
  })

  revalidatePath(`/sesiones/${sesionId}/expediente`)
  return { ok: true }
}

function separarCorreos(valor: string): string[] {
  return valor
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
}
