'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, count, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import {
  adjuntos,
  asistencias,
  bloquesContenido,
  bloquesPrograma,
  cursos,
  nominaItems,
  participantes,
  sesiones,
} from '@/db/schema'
import { auditar } from '@/lib/audit'
import { ipCliente, requerirSesion } from '@/lib/auth'
import { normalizarRut, validarRut } from '@/lib/rut'

type Resultado = { ok: true } | { ok: false; error: string }

async function contexto(sesionId: string) {
  const usuario = await requerirSesion()
  const [s] = await db.select().from(sesiones).where(eq(sesiones.id, sesionId)).limit(1)
  if (!s) throw new Error('Sesión no encontrada')
  // Un profesor solo opera sus propias sesiones.
  if (usuario.rol === 'PROFESOR' && s.profesorId !== usuario.profesorId) {
    throw new Error('Esta sesión no está asignada a usted')
  }
  return { usuario, sesion: s }
}

function refrescar(sesionId: string) {
  revalidatePath(`/sesiones/${sesionId}`)
  revalidatePath('/')
}

// ---------------------------------------------------------------------------
// Apertura y cierre de la sesión
// ---------------------------------------------------------------------------

export async function abrirSesion(sesionId: string): Promise<Resultado> {
  const { usuario, sesion } = await contexto(sesionId)
  if (sesion.estado === 'CERRADA') {
    return { ok: false, error: 'La sesión está cerrada. Use "Reabrir" para volver a habilitarla.' }
  }

  await db
    .update(sesiones)
    .set({ estado: 'ABIERTA', asistenciaAbierta: true })
    .where(eq(sesiones.id, sesionId))

  await db
    .update(cursos)
    .set({ estado: 'EN_CURSO', actualizadoEn: new Date() })
    .where(and(eq(cursos.id, sesion.cursoId), eq(cursos.estado, 'PROGRAMADO')))

  await auditar({
    entidad: 'sesion',
    entidadId: sesionId,
    accion: 'sesion_abierta',
    usuarioId: usuario.id,
    ip: await ipCliente(),
  })
  refrescar(sesionId)
  return { ok: true }
}

/** Habilita o deshabilita cada flujo por separado: asistencia, evaluación, encuesta. */
export async function alternarFlujo(
  sesionId: string,
  flujo: 'asistencia' | 'evaluacion' | 'encuesta',
  abierto: boolean,
): Promise<Resultado> {
  const { usuario, sesion } = await contexto(sesionId)
  if (sesion.estado === 'CERRADA') {
    return { ok: false, error: 'La sesión está cerrada.' }
  }

  const campo =
    flujo === 'asistencia'
      ? { asistenciaAbierta: abierto }
      : flujo === 'evaluacion'
        ? { evaluacionAbierta: abierto }
        : { encuestaAbierta: abierto }

  await db.update(sesiones).set(campo).where(eq(sesiones.id, sesionId))
  await auditar({
    entidad: 'sesion',
    entidadId: sesionId,
    accion: `${flujo}_${abierto ? 'habilitada' : 'deshabilitada'}`,
    usuarioId: usuario.id,
  })
  refrescar(sesionId)
  return { ok: true }
}

/**
 * Cierra la sesión: bloquea nuevos registros y marca a quien quedó sin firma.
 * A partir de aquí el expediente es generable.
 */
export async function cerrarSesionCurso(sesionId: string): Promise<Resultado> {
  const { usuario, sesion } = await contexto(sesionId)

  // Marca como SIN_FIRMA a los participantes que registraron asistencia sin firmar.
  await db.execute(sql`
    update participantes p
    set estado_validacion = 'SIN_FIRMA', nota_revision = 'Registró asistencia sin dejar firma.'
    from asistencias a
    where a.participante_id = p.id
      and a.sesion_id = ${sesionId}
      and p.estado_validacion = 'OK'
      and not exists (select 1 from firmas f where f.asistencia_id = a.id)
  `)

  await db
    .update(sesiones)
    .set({
      estado: 'CERRADA',
      cerradaEn: new Date(),
      asistenciaAbierta: false,
      evaluacionAbierta: false,
      encuestaAbierta: false,
    })
    .where(eq(sesiones.id, sesionId))

  // El curso pasa a CERRADO solo cuando todas sus jornadas están cerradas.
  const [{ abiertas }] = await db
    .select({ abiertas: count() })
    .from(sesiones)
    .where(and(eq(sesiones.cursoId, sesion.cursoId), sql`${sesiones.estado} <> 'CERRADA'`))

  if (abiertas === 0) {
    await db
      .update(cursos)
      .set({ estado: 'CERRADO', actualizadoEn: new Date() })
      .where(eq(cursos.id, sesion.cursoId))
  }

  await auditar({
    entidad: 'sesion',
    entidadId: sesionId,
    accion: 'sesion_cerrada',
    usuarioId: usuario.id,
    ip: await ipCliente(),
  })
  refrescar(sesionId)
  return { ok: true }
}

/** Reapertura explícita, siempre con motivo y siempre auditada. */
export async function reabrirSesion(sesionId: string, motivo: string): Promise<Resultado> {
  const { usuario, sesion } = await contexto(sesionId)
  if (!motivo || motivo.trim().length < 5) {
    return { ok: false, error: 'Indique el motivo de la reapertura (mínimo 5 caracteres).' }
  }

  await db
    .update(sesiones)
    .set({
      estado: 'REABIERTA',
      reabiertaEn: new Date(),
      motivoReapertura: motivo.trim(),
      asistenciaAbierta: true,
    })
    .where(eq(sesiones.id, sesionId))

  await db
    .update(cursos)
    .set({ estado: 'EN_CURSO', actualizadoEn: new Date() })
    .where(eq(cursos.id, sesion.cursoId))

  await auditar({
    entidad: 'sesion',
    entidadId: sesionId,
    accion: 'sesion_reabierta',
    valorAnterior: { estado: sesion.estado, cerradaEn: sesion.cerradaEn },
    valorNuevo: { motivo: motivo.trim() },
    usuarioId: usuario.id,
    ip: await ipCliente(),
  })
  refrescar(sesionId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Correcciones sobre los registros
// ---------------------------------------------------------------------------

const Correccion = z.object({
  nombre: z.string().trim().min(3).max(120),
  rut: z.string().trim().min(3),
  empresa: z.string().trim().max(120).optional().or(z.literal('')),
  cargo: z.string().trim().max(120).optional().or(z.literal('')),
  nivelEscolaridad: z.string().trim().max(60).optional().or(z.literal('')),
})

/**
 * Corrige los datos de un participante. Criterio de aceptación: la corrección
 * de un RUT mal ingresado queda auditada con valor anterior y autor.
 */
export async function corregirParticipante(
  sesionId: string,
  participanteId: string,
  datos: unknown,
): Promise<Resultado> {
  const { usuario } = await contexto(sesionId)
  const parsed = Correccion.safeParse(datos)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  if (!validarRut(d.rut)) {
    return { ok: false, error: 'El RUT corregido no es válido. Revise el dígito verificador.' }
  }
  const rut = normalizarRut(d.rut)!

  const [previo] = await db
    .select()
    .from(participantes)
    .where(eq(participantes.id, participanteId))
    .limit(1)
  if (!previo) return { ok: false, error: 'Participante no encontrado.' }

  // Si el RUT cambia, no debe chocar con otro participante del mismo curso.
  if (rut !== previo.rut) {
    const [choque] = await db
      .select({ id: participantes.id })
      .from(participantes)
      .where(and(eq(participantes.cursoId, previo.cursoId), eq(participantes.rut, rut)))
      .limit(1)
    if (choque) {
      return { ok: false, error: 'Ya existe otro participante con ese RUT en este curso.' }
    }
  }

  await db
    .update(participantes)
    .set({
      nombre: d.nombre,
      rut,
      empresa: d.empresa || null,
      cargo: d.cargo || null,
      nivelEscolaridad: d.nivelEscolaridad || null,
      estadoValidacion: previo.estadoValidacion === 'RUT_INVALIDO' ? 'OK' : previo.estadoValidacion,
      actualizadoEn: new Date(),
    })
    .where(eq(participantes.id, participanteId))

  await auditar({
    entidad: 'participante',
    entidadId: participanteId,
    accion: 'correccion_datos',
    valorAnterior: {
      nombre: previo.nombre,
      rut: previo.rut,
      empresa: previo.empresa,
      cargo: previo.cargo,
      nivelEscolaridad: previo.nivelEscolaridad,
    },
    valorNuevo: d.rut === previo.rut ? { ...d, rut } : { ...d, rut, rutAnterior: previo.rut },
    usuarioId: usuario.id,
    ip: await ipCliente(),
  })
  refrescar(sesionId)
  return { ok: true }
}

/** Marca o desmarca un registro como revisado por el profesor. */
export async function resolverAlerta(
  sesionId: string,
  participanteId: string,
  nuevoEstado: 'OK' | 'ANULADO',
  nota?: string,
): Promise<Resultado> {
  const { usuario } = await contexto(sesionId)
  const [previo] = await db
    .select()
    .from(participantes)
    .where(eq(participantes.id, participanteId))
    .limit(1)
  if (!previo) return { ok: false, error: 'Participante no encontrado.' }

  await db
    .update(participantes)
    .set({
      estadoValidacion: nuevoEstado,
      anulado: nuevoEstado === 'ANULADO',
      notaRevision: nota?.trim() || previo.notaRevision,
      actualizadoEn: new Date(),
    })
    .where(eq(participantes.id, participanteId))

  await auditar({
    entidad: 'participante',
    entidadId: participanteId,
    accion: nuevoEstado === 'ANULADO' ? 'registro_anulado' : 'alerta_resuelta',
    valorAnterior: { estadoValidacion: previo.estadoValidacion, anulado: previo.anulado },
    valorNuevo: { estadoValidacion: nuevoEstado, nota },
    usuarioId: usuario.id,
    ip: await ipCliente(),
  })
  refrescar(sesionId)
  return { ok: true }
}

/** Alta manual: alguien sin celular a quien el profesor inscribe directamente. */
export async function agregarManual(sesionId: string, datos: unknown): Promise<Resultado> {
  const { usuario, sesion } = await contexto(sesionId)
  const parsed = Correccion.safeParse(datos)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  if (!validarRut(d.rut)) {
    return { ok: false, error: 'El RUT no es válido. Revise el dígito verificador.' }
  }
  const rut = normalizarRut(d.rut)!

  let [p] = await db
    .select()
    .from(participantes)
    .where(and(eq(participantes.cursoId, sesion.cursoId), eq(participantes.rut, rut)))
    .limit(1)

  if (!p) {
    const [{ total }] = await db
      .select({ total: count() })
      .from(participantes)
      .where(and(eq(participantes.cursoId, sesion.cursoId), eq(participantes.anulado, false)))

    const [curso] = await db.select().from(cursos).where(eq(cursos.id, sesion.cursoId)).limit(1)
    const excede = curso.nominaEsperada > 0 && total >= curso.nominaEsperada

    ;[p] = await db
      .insert(participantes)
      .values({
        nombre: d.nombre,
        rut,
        empresa: d.empresa || null,
        cargo: d.cargo || null,
        nivelEscolaridad: d.nivelEscolaridad || null,
        origen: 'MANUAL',
        estadoValidacion: excede ? 'EXCEDE_NOMINA' : 'SIN_FIRMA',
        notaRevision: excede
          ? `Registro ${total + 1} de una nómina esperada de ${curso.nominaEsperada}.`
          : 'Alta manual del relator: aún sin firma.',
        cursoId: sesion.cursoId,
      })
      .returning()
  }

  await db
    .insert(asistencias)
    .values({
      participanteId: p.id,
      sesionId,
      origen: 'MANUAL',
      dispositivo: 'escritorio',
    })
    .onConflictDoNothing()

  await auditar({
    entidad: 'participante',
    entidadId: p.id,
    accion: 'alta_manual',
    valorNuevo: { nombre: d.nombre, rut, sesionId },
    usuarioId: usuario.id,
    ip: await ipCliente(),
  })
  refrescar(sesionId)
  return { ok: true }
}

/** Marca presente/ausente en la jornada sin borrar el registro. */
export async function alternarPresencia(
  sesionId: string,
  asistenciaId: string,
  presente: boolean,
): Promise<Resultado> {
  const { usuario } = await contexto(sesionId)
  await db.update(asistencias).set({ presente }).where(eq(asistencias.id, asistenciaId))
  await auditar({
    entidad: 'asistencia',
    entidadId: asistenciaId,
    accion: presente ? 'marcado_presente' : 'marcado_ausente',
    usuarioId: usuario.id,
  })
  refrescar(sesionId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Contenidos impartidos y foto grupal
// ---------------------------------------------------------------------------

const Bloque = z.object({
  tema: z.string().trim().min(3, 'Describa el tema').max(300),
  actividades: z.string().trim().max(600).optional().or(z.literal('')),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida'),
  horaFin: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida'),
  observaciones: z.string().trim().max(600).optional().or(z.literal('')),
})

export async function guardarBloqueContenido(
  sesionId: string,
  datos: unknown,
  bloqueId?: string,
): Promise<Resultado> {
  const { usuario } = await contexto(sesionId)
  const parsed = Bloque.safeParse(datos)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  if (d.horaFin <= d.horaInicio) {
    return { ok: false, error: 'La hora de término debe ser posterior a la de inicio.' }
  }

  if (bloqueId) {
    await db
      .update(bloquesContenido)
      .set({
        tema: d.tema,
        actividades: d.actividades || null,
        horaInicio: d.horaInicio,
        horaFin: d.horaFin,
        observaciones: d.observaciones || null,
      })
      .where(eq(bloquesContenido.id, bloqueId))
  } else {
    const [{ total }] = await db
      .select({ total: count() })
      .from(bloquesContenido)
      .where(eq(bloquesContenido.sesionId, sesionId))

    await db.insert(bloquesContenido).values({
      sesionId,
      orden: total,
      tema: d.tema,
      actividades: d.actividades || null,
      horaInicio: d.horaInicio,
      horaFin: d.horaFin,
      observaciones: d.observaciones || null,
    })
  }

  await auditar({
    entidad: 'bloque_contenido',
    entidadId: bloqueId ?? sesionId,
    accion: bloqueId ? 'contenido_editado' : 'contenido_agregado',
    valorNuevo: d,
    usuarioId: usuario.id,
  })
  refrescar(sesionId)
  return { ok: true }
}

export async function eliminarBloqueContenido(
  sesionId: string,
  bloqueId: string,
): Promise<Resultado> {
  const { usuario } = await contexto(sesionId)
  const [previo] = await db
    .select()
    .from(bloquesContenido)
    .where(eq(bloquesContenido.id, bloqueId))
    .limit(1)
  await db.delete(bloquesContenido).where(eq(bloquesContenido.id, bloqueId))
  await auditar({
    entidad: 'bloque_contenido',
    entidadId: bloqueId,
    accion: 'contenido_eliminado',
    valorAnterior: previo,
    usuarioId: usuario.id,
  })
  refrescar(sesionId)
  return { ok: true }
}

export async function guardarAdjunto(
  sesionId: string,
  tipo: 'FOTO_GRUPAL' | 'FOTO_SALA' | 'LIBRO_PAPEL' | 'OTRO',
  nombre: string,
  mime: string,
  datosBase64: string,
): Promise<Resultado> {
  const { usuario } = await contexto(sesionId)

  const bytes = Math.round((datosBase64.length * 3) / 4)
  if (bytes > 8 * 1024 * 1024) {
    return { ok: false, error: 'La imagen supera los 8 MB. Tome la foto en menor resolución.' }
  }

  // Solo una foto grupal por sesión: la nueva reemplaza a la anterior.
  if (tipo === 'FOTO_GRUPAL') {
    await db
      .delete(adjuntos)
      .where(and(eq(adjuntos.sesionId, sesionId), eq(adjuntos.tipo, 'FOTO_GRUPAL')))
  }

  await db.insert(adjuntos).values({ sesionId, tipo, nombre, mime, datos: datosBase64, bytes })
  await auditar({
    entidad: 'adjunto',
    entidadId: sesionId,
    accion: 'adjunto_cargado',
    valorNuevo: { tipo, nombre, bytes },
    usuarioId: usuario.id,
  })
  refrescar(sesionId)
  return { ok: true }
}

export async function eliminarAdjunto(sesionId: string, adjuntoId: string): Promise<Resultado> {
  const { usuario } = await contexto(sesionId)
  await db.delete(adjuntos).where(eq(adjuntos.id, adjuntoId))
  await auditar({
    entidad: 'adjunto',
    entidadId: adjuntoId,
    accion: 'adjunto_eliminado',
    usuarioId: usuario.id,
  })
  refrescar(sesionId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Conciliación con la lista del curso
// ---------------------------------------------------------------------------

/**
 * Empareja un registro con un alumno de la nómina enviada por el cliente.
 *
 * Es la operación que cierra el círculo cuando la persona no eligió su nombre
 * de la lista: el instructor mira el registro, reconoce de quién se trata y los
 * vincula. Queda auditado con autor y momento.
 */
export async function vincularConNomina(
  sesionId: string,
  participanteId: string,
  nominaItemId: string | null,
): Promise<Resultado> {
  const { usuario, sesion } = await contexto(sesionId)

  const [previo] = await db
    .select()
    .from(participantes)
    .where(eq(participantes.id, participanteId))
    .limit(1)
  if (!previo) return { ok: false, error: 'Registro no encontrado.' }

  if (nominaItemId) {
    // El alumno de la nómina debe pertenecer a este curso...
    const [alumno] = await db
      .select()
      .from(nominaItems)
      .where(and(eq(nominaItems.id, nominaItemId), eq(nominaItems.cursoId, sesion.cursoId)))
      .limit(1)
    if (!alumno) return { ok: false, error: 'Ese alumno no pertenece a este curso.' }

    // ...y no puede estar ya tomado por otro registro.
    const [ocupado] = await db
      .select({ id: participantes.id, nombre: participantes.nombre })
      .from(participantes)
      .where(
        and(
          eq(participantes.nominaItemId, nominaItemId),
          eq(participantes.anulado, false),
          ne(participantes.id, participanteId),
        ),
      )
      .limit(1)
    if (ocupado) {
      return {
        ok: false,
        error: `"${alumno.nombre}" ya está vinculado al registro de ${ocupado.nombre}. Desvincule ese primero.`,
      }
    }
  }

  await db
    .update(participantes)
    .set({
      nominaItemId,
      vinculadoPor: nominaItemId ? usuario.nombre : null,
      vinculadoEn: nominaItemId ? new Date() : null,
      // Vincularlo resuelve la alerta de "fuera de nómina".
      estadoValidacion:
        nominaItemId && previo.estadoValidacion === 'FUERA_DE_NOMINA'
          ? 'OK'
          : previo.estadoValidacion,
      notaRevision: nominaItemId && previo.estadoValidacion === 'FUERA_DE_NOMINA'
        ? null
        : previo.notaRevision,
      actualizadoEn: new Date(),
    })
    .where(eq(participantes.id, participanteId))

  await auditar({
    entidad: 'participante',
    entidadId: participanteId,
    accion: nominaItemId ? 'vinculado_a_nomina' : 'desvinculado_de_nomina',
    valorAnterior: { nominaItemId: previo.nominaItemId },
    valorNuevo: { nominaItemId },
    usuarioId: usuario.id,
    ip: await ipCliente(),
  })

  refrescar(sesionId)
  return { ok: true }
}

/**
 * Registra en la jornada a un alumno de la nómina que no vino a firmar.
 * Se crea el participante ya vinculado y marcado como pendiente de firma.
 */
export async function registrarDesdeNomina(
  sesionId: string,
  nominaItemId: string,
): Promise<Resultado> {
  const { usuario, sesion } = await contexto(sesionId)

  const [alumno] = await db
    .select()
    .from(nominaItems)
    .where(and(eq(nominaItems.id, nominaItemId), eq(nominaItems.cursoId, sesion.cursoId)))
    .limit(1)
  if (!alumno) return { ok: false, error: 'Ese alumno no pertenece a este curso.' }

  const rut = alumno.rut ? normalizarRut(alumno.rut) : null
  if (!rut || !validarRut(rut)) {
    return {
      ok: false,
      error:
        'La nómina no trae un RUT válido para esa persona. Agréguela con el botón de alta manual.',
    }
  }

  let [p] = await db
    .select()
    .from(participantes)
    .where(and(eq(participantes.cursoId, sesion.cursoId), eq(participantes.rut, rut)))
    .limit(1)

  if (!p) {
    ;[p] = await db
      .insert(participantes)
      .values({
        nombre: alumno.nombre,
        rut,
        empresa: alumno.empresa,
        cargo: alumno.cargo,
        origen: 'MANUAL',
        estadoValidacion: 'SIN_FIRMA',
        notaRevision: 'Alta desde la nómina por el relator: aún sin firma.',
        cursoId: sesion.cursoId,
        nominaItemId,
        vinculadoPor: usuario.nombre,
        vinculadoEn: new Date(),
      })
      .returning()
  } else if (!p.nominaItemId) {
    await db
      .update(participantes)
      .set({ nominaItemId, vinculadoPor: usuario.nombre, vinculadoEn: new Date() })
      .where(eq(participantes.id, p.id))
  }

  await db
    .insert(asistencias)
    .values({ participanteId: p.id, sesionId, origen: 'MANUAL', dispositivo: 'escritorio' })
    .onConflictDoNothing()

  await auditar({
    entidad: 'participante',
    entidadId: p.id,
    accion: 'alta_desde_nomina',
    valorNuevo: { nombre: alumno.nombre, rut, nominaItemId },
    usuarioId: usuario.id,
    ip: await ipCliente(),
  })

  refrescar(sesionId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Contenidos por archivo y programa del tipo de curso
// ---------------------------------------------------------------------------

export async function analizarArchivoContenidos(sesionId: string, formData: FormData) {
  await contexto(sesionId)
  const archivo = formData.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false as const, error: 'Seleccione un archivo.' }
  }
  if (archivo.size > 5_000_000) return { ok: false as const, error: 'El archivo supera los 5 MB.' }
  try {
    const { analizarContenidos } = await import('@/lib/cargas')
    const buffer = Buffer.from(await archivo.arrayBuffer())
    return { ok: true as const, ...(await analizarContenidos(buffer, archivo.name)) }
  } catch {
    return { ok: false as const, error: 'No se pudo leer el archivo. Debe ser .xlsx o .csv.' }
  }
}

const LoteContenidos = z
  .array(
    z.object({
      tema: z.string().trim().min(3).max(300),
      actividades: z.string().trim().max(600).default(''),
      horaInicio: z.string().trim().max(5).default(''),
      horaFin: z.string().trim().max(5).default(''),
      observaciones: z.string().trim().max(600).default(''),
    }),
  )
  .min(1, 'No hay bloques que cargar.')
  .max(200, 'Demasiadas filas en un solo archivo.')

export async function cargarContenidos(
  sesionId: string,
  datos: unknown,
  modo: 'AGREGAR' | 'REEMPLAZAR',
): Promise<Resultado> {
  const { usuario, sesion } = await contexto(sesionId)
  if (sesion.estado === 'CERRADA') {
    return { ok: false, error: 'La sesión está cerrada. Reábrala para modificar los contenidos.' }
  }
  const parsed = LoteContenidos.safeParse(datos)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const lote = parsed.data

  if (modo === 'REEMPLAZAR') {
    await db.delete(bloquesContenido).where(eq(bloquesContenido.sesionId, sesionId))
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(bloquesContenido)
    .where(eq(bloquesContenido.sesionId, sesionId))

  let orden = total
  await db.insert(bloquesContenido).values(
    lote.map((b) => ({
      sesionId,
      orden: orden++,
      tema: b.tema,
      actividades: b.actividades || null,
      horaInicio: b.horaInicio,
      horaFin: b.horaFin,
      observaciones: b.observaciones || null,
    })),
  )

  await auditar({
    entidad: 'bloque_contenido',
    entidadId: sesionId,
    accion: modo === 'REEMPLAZAR' ? 'contenidos_reemplazados_archivo' : 'contenidos_cargados_archivo',
    valorNuevo: { cantidad: lote.length },
    usuarioId: usuario.id,
  })
  refrescar(sesionId)
  return { ok: true }
}

/**
 * Copia el programa del tipo de curso a esta jornada.
 *
 * Es una copia, no una referencia: el relator ajusta los bloques de su jornada
 * sin tocar el programa estándar, y lo que queda en el expediente es lo que
 * realmente se dictó ese día.
 */
export async function aplicarPrograma(sesionId: string): Promise<Resultado> {
  const { usuario, sesion } = await contexto(sesionId)
  if (sesion.estado === 'CERRADA') {
    return { ok: false, error: 'La sesión está cerrada. Reábrala para modificar los contenidos.' }
  }

  const [fila] = await db
    .select({ tipoCursoId: cursos.tipoCursoId })
    .from(sesiones)
    .innerJoin(cursos, eq(sesiones.cursoId, cursos.id))
    .where(eq(sesiones.id, sesionId))
    .limit(1)
  if (!fila) return { ok: false, error: 'No se encontró el curso de esta jornada.' }

  const programa = await db
    .select()
    .from(bloquesPrograma)
    .where(eq(bloquesPrograma.tipoCursoId, fila.tipoCursoId))
    .orderBy(asc(bloquesPrograma.orden))

  if (programa.length === 0) {
    return {
      ok: false,
      error:
        'Este tipo de curso todavía no tiene programa cargado. Cárguelo en Tipos de curso → Programa.',
    }
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(bloquesContenido)
    .where(eq(bloquesContenido.sesionId, sesionId))

  let orden = total
  await db.insert(bloquesContenido).values(
    programa.map((b) => ({
      sesionId,
      orden: orden++,
      tema: b.tema,
      actividades: b.actividades,
      horaInicio: b.horaInicio ?? '',
      horaFin: b.horaFin ?? '',
      observaciones: b.observaciones,
    })),
  )

  await auditar({
    entidad: 'bloque_contenido',
    entidadId: sesionId,
    accion: 'programa_aplicado',
    valorNuevo: { cantidad: programa.length, tipoCursoId: fila.tipoCursoId },
    usuarioId: usuario.id,
  })
  refrescar(sesionId)
  return { ok: true }
}
