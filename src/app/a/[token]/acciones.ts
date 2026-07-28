'use server'

import { createHash } from 'node:crypto'
import { and, count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { asistencias, firmas, nominaItems, participantes } from '@/db/schema'
import { auditar } from '@/lib/audit'
import { ipCliente, userAgentCliente } from '@/lib/auth'
import { normalizarRut, validarRut } from '@/lib/rut'
import { aceptaRegistros, buscarSesionPorToken } from '@/lib/sesiones'

const Entrada = z.object({
  nombre: z.string().trim().min(3, 'Ingrese su nombre completo').max(120),
  rut: z.string().trim().min(3, 'Ingrese su RUT'),
  empresa: z.string().trim().max(120).optional().or(z.literal('')),
  cargo: z.string().trim().max(120).optional().or(z.literal('')),
  nivelEscolaridad: z.string().trim().max(60).optional().or(z.literal('')),
  firmaPng: z.string().min(100, 'Falta la firma'),
  firmaTrazos: z.string().optional(),
  esTablet: z.boolean().optional(),
})

export type ResultadoRegistro =
  | { ok: true; nombre: string; hora: string; yaEstaba: boolean }
  | { ok: false; error: string; campo?: string }

/**
 * Registra la asistencia de un participante.
 *
 * Principio de diseño: el registro es abierto y nunca se bloquea por
 * conciliación. Un RUT repetido o alguien fuera de nómina se acepta y se marca
 * para que el profesor lo revise. Solo se rechaza lo que impide construir el
 * expediente: RUT inválido, falta de firma o sesión cerrada.
 */
export async function registrarAsistencia(
  token: string,
  datos: unknown,
): Promise<ResultadoRegistro> {
  const parsed = Entrada.safeParse(datos)
  if (!parsed.success) {
    const primero = parsed.error.issues[0]
    return { ok: false, error: primero.message, campo: String(primero.path[0] ?? '') }
  }
  const d = parsed.data

  const ctx = await buscarSesionPorToken(token, 'asistencia')
  if (!ctx) return { ok: false, error: 'El código QR no corresponde a ningún curso activo.' }

  if (!aceptaRegistros(ctx.sesion.estado, ctx.sesion.asistenciaAbierta)) {
    return {
      ok: false,
      error:
        ctx.sesion.estado === 'CERRADA'
          ? 'Esta sesión ya fue cerrada por el relator. Solicite que la reabra si necesita registrarse.'
          : 'El registro de asistencia todavía no está habilitado. Espere la indicación del relator.',
    }
  }

  // --- Validación de RUT (criterio de aceptación: DV inválido se rechaza) ---
  if (!validarRut(d.rut)) {
    return { ok: false, error: 'El RUT no es válido. Revise el dígito verificador.', campo: 'rut' }
  }
  const rut = normalizarRut(d.rut)!

  const ip = await ipCliente()
  const ua = await userAgentCliente()
  const origen = d.esTablet ? 'TABLET' : 'QR'

  // --- Participante: crear o reutilizar dentro del curso ---
  const [existente] = await db
    .select()
    .from(participantes)
    .where(and(eq(participantes.cursoId, ctx.curso.id), eq(participantes.rut, rut)))
    .limit(1)

  let participanteId: string
  let yaEstaba = false

  if (existente) {
    participanteId = existente.id
    // Completa antecedentes si venían vacíos, sin pisar lo ya cargado.
    await db
      .update(participantes)
      .set({
        nombre: existente.nombre || d.nombre,
        empresa: existente.empresa || d.empresa || null,
        cargo: existente.cargo || d.cargo || null,
        nivelEscolaridad: existente.nivelEscolaridad || d.nivelEscolaridad || null,
        actualizadoEn: new Date(),
      })
      .where(eq(participantes.id, existente.id))
  } else {
    // ¿Está en la nómina que envió el cliente?
    const nomina = await db
      .select({ rut: nominaItems.rut })
      .from(nominaItems)
      .where(eq(nominaItems.cursoId, ctx.curso.id))

    const rutsNomina = new Set(
      nomina.map((n) => (n.rut ? normalizarRut(n.rut) : null)).filter(Boolean) as string[],
    )

    const [{ total }] = await db
      .select({ total: count() })
      .from(participantes)
      .where(and(eq(participantes.cursoId, ctx.curso.id), eq(participantes.anulado, false)))

    // Se acepta igual; solo se marca para revisión posterior.
    let estadoValidacion: 'OK' | 'EXCEDE_NOMINA' | 'FUERA_DE_NOMINA' = 'OK'
    let notaRevision: string | null = null

    if (ctx.curso.nominaEsperada > 0 && total >= ctx.curso.nominaEsperada) {
      estadoValidacion = 'EXCEDE_NOMINA'
      notaRevision = `Registro ${total + 1} de una nómina esperada de ${ctx.curso.nominaEsperada}.`
    } else if (rutsNomina.size > 0 && !rutsNomina.has(rut)) {
      estadoValidacion = 'FUERA_DE_NOMINA'
      notaRevision = 'El RUT no aparece en la nómina enviada por el cliente.'
    }

    const [creado] = await db
      .insert(participantes)
      .values({
        nombre: d.nombre,
        rut,
        empresa: d.empresa || null,
        cargo: d.cargo || null,
        nivelEscolaridad: d.nivelEscolaridad || null,
        origen,
        estadoValidacion,
        notaRevision,
        cursoId: ctx.curso.id,
      })
      .returning({ id: participantes.id })

    participanteId = creado.id

    await auditar({
      entidad: 'participante',
      entidadId: participanteId,
      accion: 'registro_participante',
      valorNuevo: { nombre: d.nombre, rut, origen, estadoValidacion },
      actorAnonimo: rut,
      ip,
    })
  }

  // --- Asistencia de la jornada ---
  const [asistenciaPrevia] = await db
    .select()
    .from(asistencias)
    .where(
      and(eq(asistencias.participanteId, participanteId), eq(asistencias.sesionId, ctx.sesion.id)),
    )
    .limit(1)

  let asistenciaId: string

  if (asistenciaPrevia) {
    // Segundo registro del mismo RUT en la misma jornada: se acepta,
    // se actualiza la firma y se marca para revisión del profesor.
    yaEstaba = true
    asistenciaId = asistenciaPrevia.id
    await db
      .update(participantes)
      .set({
        estadoValidacion: 'DUPLICADO_SOSPECHOSO',
        notaRevision: 'Se registró más de una vez en la misma jornada.',
        actualizadoEn: new Date(),
      })
      .where(eq(participantes.id, participanteId))
  } else {
    const [creada] = await db
      .insert(asistencias)
      .values({
        participanteId,
        sesionId: ctx.sesion.id,
        origen,
        ip,
        userAgent: ua,
        dispositivo: d.esTablet ? 'tablet' : detectarDispositivo(ua),
      })
      .returning({ id: asistencias.id })
    asistenciaId = creada.id
  }

  // --- Firma electrónica simple (Ley 19.799) ---
  const firmadoEn = new Date()
  const hash = createHash('sha256')
    .update(`${rut}|${d.nombre}|${ctx.sesion.id}|${firmadoEn.toISOString()}|${d.firmaPng}`)
    .digest('hex')

  let trazos: unknown = null
  if (d.firmaTrazos) {
    try {
      trazos = JSON.parse(d.firmaTrazos)
    } catch {
      trazos = null
    }
  }

  await db
    .insert(firmas)
    .values({
      imagenPng: d.firmaPng,
      trazosJson: trazos as never,
      hash,
      ip,
      userAgent: ua,
      firmadoEn,
      asistenciaId,
    })
    .onConflictDoUpdate({
      target: firmas.asistenciaId,
      set: { imagenPng: d.firmaPng, trazosJson: trazos as never, hash, firmadoEn, ip, userAgent: ua },
    })

  await auditar({
    entidad: 'asistencia',
    entidadId: asistenciaId,
    accion: yaEstaba ? 'firma_actualizada' : 'asistencia_registrada',
    valorNuevo: { rut, sesionId: ctx.sesion.id, origen, hashFirma: hash },
    actorAnonimo: rut,
    ip,
  })

  return {
    ok: true,
    nombre: d.nombre,
    hora: firmadoEn.toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Santiago',
    }),
    yaEstaba,
  }
}

function detectarDispositivo(ua: string | null): string {
  if (!ua) return 'desconocido'
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet'
  if (/Mobile|iPhone|Android/i.test(ua)) return 'movil'
  return 'escritorio'
}
