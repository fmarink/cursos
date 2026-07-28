'use server'

import { revalidatePath } from 'next/cache'
import { count, eq, max } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import {
  plantillasEncuesta,
  plantillasEvaluacion,
  preguntas,
  preguntasEncuesta,
} from '@/db/schema'
import { auditar } from '@/lib/audit'
import { requerirRol } from '@/lib/auth'

type Resultado = { ok: true } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Plantillas de evaluación
// ---------------------------------------------------------------------------

const Plantilla = z.object({
  nombre: z.string().trim().min(3, 'Indique el nombre de la evaluación').max(150),
  tipoCursoId: z.string().optional().or(z.literal('')),
  clienteId: z.string().optional().or(z.literal('')),
  umbralAprobacion: z.coerce.number().min(1).max(7),
  exigencia: z.coerce.number().int().min(1).max(100),
})

export async function guardarPlantillaEvaluacion(datos: unknown, plantillaId?: string) {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = Plantilla.safeParse(datos)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }
  const d = parsed.data

  const valores = {
    nombre: d.nombre,
    tipoCursoId: d.tipoCursoId || null,
    clienteId: d.clienteId || null,
    umbralAprobacion: d.umbralAprobacion.toFixed(1),
    exigencia: d.exigencia,
  }

  let id = plantillaId
  if (id) {
    await db.update(plantillasEvaluacion).set(valores).where(eq(plantillasEvaluacion.id, id))
  } else {
    const [creada] = await db
      .insert(plantillasEvaluacion)
      .values(valores)
      .returning({ id: plantillasEvaluacion.id })
    id = creada.id
  }

  await auditar({
    entidad: 'plantilla_evaluacion',
    entidadId: id,
    accion: plantillaId ? 'plantilla_editada' : 'plantilla_creada',
    valorNuevo: valores,
    usuarioId: usuario.id,
  })

  revalidatePath('/plantillas')
  return { ok: true as const, id }
}

export async function alternarActivaPlantilla(plantillaId: string, activa: boolean) {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  await db
    .update(plantillasEvaluacion)
    .set({ activa })
    .where(eq(plantillasEvaluacion.id, plantillaId))
  await auditar({
    entidad: 'plantilla_evaluacion',
    entidadId: plantillaId,
    accion: activa ? 'plantilla_reactivada' : 'plantilla_desactivada',
    usuarioId: usuario.id,
  })
  revalidatePath('/plantillas')
  return { ok: true as const }
}

const Pregunta = z.object({
  enunciado: z.string().trim().min(5, 'Escriba el enunciado de la pregunta').max(500),
  tipo: z.enum(['SELECCION_MULTIPLE', 'VERDADERO_FALSO', 'RESPUESTA_BREVE']),
  opciones: z.array(z.string().trim()).default([]),
  respuestaCorrecta: z.string().optional().or(z.literal('')),
  puntaje: z.coerce.number().int().min(1).max(20),
})

export async function guardarPregunta(
  plantillaId: string,
  datos: unknown,
  preguntaId?: string,
): Promise<Resultado> {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = Pregunta.safeParse(datos)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  // Validaciones propias de cada tipo: una pregunta cerrada sin respuesta
  // correcta no se puede corregir sola, y sería una trampa silenciosa.
  if (d.tipo === 'SELECCION_MULTIPLE') {
    const limpias = d.opciones.filter((o) => o.trim().length > 0)
    if (limpias.length < 2) {
      return { ok: false, error: 'Una pregunta de selección múltiple necesita al menos 2 opciones.' }
    }
    // Ojo: Number('') es 0, no NaN. Sin este chequeo explícito, una pregunta
    // sin respuesta marcada se guardaría dando por correcta la opción (a),
    // y la evaluación se corregiría mal sin que nadie lo notara.
    const marcada = (d.respuestaCorrecta ?? '').trim()
    if (marcada === '') {
      return { ok: false, error: 'Marque cuál de las opciones es la correcta.' }
    }
    const indice = Number(marcada)
    if (!Number.isInteger(indice) || indice < 0 || indice >= limpias.length) {
      return { ok: false, error: 'La opción marcada como correcta ya no existe. Vuelva a marcarla.' }
    }
  }
  if (d.tipo === 'VERDADERO_FALSO' && d.respuestaCorrecta !== 'true' && d.respuestaCorrecta !== 'false') {
    return { ok: false, error: 'Indique si la afirmación es verdadera o falsa.' }
  }

  const opciones =
    d.tipo === 'SELECCION_MULTIPLE' ? d.opciones.filter((o) => o.trim().length > 0) : null

  if (preguntaId) {
    await db
      .update(preguntas)
      .set({
        enunciado: d.enunciado,
        tipo: d.tipo,
        opciones,
        respuestaCorrecta: d.respuestaCorrecta || null,
        puntaje: d.puntaje,
      })
      .where(eq(preguntas.id, preguntaId))
  } else {
    const [{ ultimo }] = await db
      .select({ ultimo: max(preguntas.orden) })
      .from(preguntas)
      .where(eq(preguntas.plantillaId, plantillaId))

    await db.insert(preguntas).values({
      plantillaId,
      orden: (ultimo ?? 0) + 1,
      enunciado: d.enunciado,
      tipo: d.tipo,
      opciones,
      respuestaCorrecta: d.respuestaCorrecta || null,
      puntaje: d.puntaje,
    })
  }

  await auditar({
    entidad: 'pregunta',
    entidadId: preguntaId ?? plantillaId,
    accion: preguntaId ? 'pregunta_editada' : 'pregunta_agregada',
    valorNuevo: { enunciado: d.enunciado, tipo: d.tipo, puntaje: d.puntaje },
    usuarioId: usuario.id,
  })

  revalidatePath('/plantillas')
  return { ok: true }
}

export async function eliminarPregunta(preguntaId: string): Promise<Resultado> {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const [previa] = await db.select().from(preguntas).where(eq(preguntas.id, preguntaId)).limit(1)
  await db.delete(preguntas).where(eq(preguntas.id, preguntaId))
  await auditar({
    entidad: 'pregunta',
    entidadId: preguntaId,
    accion: 'pregunta_eliminada',
    valorAnterior: previa,
    usuarioId: usuario.id,
  })
  revalidatePath('/plantillas')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Plantillas de encuesta
// ---------------------------------------------------------------------------

const PlantillaEnc = z.object({
  nombre: z.string().trim().min(3, 'Indique el nombre de la encuesta').max(150),
  escalaMin: z.coerce.number().int().min(0).max(5),
  escalaMax: z.coerce.number().int().min(2).max(10),
  anonima: z.boolean().default(true),
})

export async function guardarPlantillaEncuesta(datos: unknown, plantillaId?: string) {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = PlantillaEnc.safeParse(datos)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }
  const d = parsed.data

  if (d.escalaMax <= d.escalaMin) {
    return { ok: false as const, error: 'El máximo de la escala debe ser mayor que el mínimo.' }
  }

  const valores = {
    nombre: d.nombre,
    escalaMin: d.escalaMin,
    escalaMax: d.escalaMax,
    anonima: d.anonima,
  }

  let id = plantillaId
  if (id) {
    await db.update(plantillasEncuesta).set(valores).where(eq(plantillasEncuesta.id, id))
  } else {
    const [creada] = await db
      .insert(plantillasEncuesta)
      .values(valores)
      .returning({ id: plantillasEncuesta.id })
    id = creada.id
  }

  await auditar({
    entidad: 'plantilla_encuesta',
    entidadId: id,
    accion: plantillaId ? 'encuesta_editada' : 'encuesta_creada',
    valorNuevo: valores,
    usuarioId: usuario.id,
  })

  revalidatePath('/plantillas')
  return { ok: true as const, id }
}

export async function alternarActivaEncuesta(plantillaId: string, activa: boolean) {
  await requerirRol('ADMIN', 'OPERACIONES')
  await db.update(plantillasEncuesta).set({ activa }).where(eq(plantillasEncuesta.id, plantillaId))
  revalidatePath('/plantillas')
  return { ok: true as const }
}

const PreguntaEnc = z.object({
  enunciado: z.string().trim().min(5, 'Escriba el enunciado').max(500),
  tipo: z.enum(['ESCALA', 'TEXTO', 'SI_NO']),
})

export async function guardarPreguntaEncuesta(
  plantillaId: string,
  datos: unknown,
  preguntaId?: string,
): Promise<Resultado> {
  await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = PreguntaEnc.safeParse(datos)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  if (preguntaId) {
    await db
      .update(preguntasEncuesta)
      .set({ enunciado: d.enunciado, tipo: d.tipo })
      .where(eq(preguntasEncuesta.id, preguntaId))
  } else {
    const [{ ultimo }] = await db
      .select({ ultimo: max(preguntasEncuesta.orden) })
      .from(preguntasEncuesta)
      .where(eq(preguntasEncuesta.plantillaId, plantillaId))

    await db.insert(preguntasEncuesta).values({
      plantillaId,
      orden: (ultimo ?? 0) + 1,
      enunciado: d.enunciado,
      tipo: d.tipo,
    })
  }

  revalidatePath('/plantillas')
  return { ok: true }
}

export async function eliminarPreguntaEncuesta(preguntaId: string): Promise<Resultado> {
  await requerirRol('ADMIN', 'OPERACIONES')
  await db.delete(preguntasEncuesta).where(eq(preguntasEncuesta.id, preguntaId))
  revalidatePath('/plantillas')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Carga desde archivo
// ---------------------------------------------------------------------------

/**
 * Lee el archivo y devuelve lo que encontró SIN guardar nada. La pantalla
 * muestra ese resultado y recién entonces el usuario confirma. Es el mismo
 * criterio del importador de relatores: primero se mira, después se guarda.
 */
export async function analizarArchivoEvaluacion(formData: FormData) {
  await requerirRol('ADMIN', 'OPERACIONES')
  const archivo = formData.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false as const, error: 'Seleccione un archivo.' }
  }
  if (archivo.size > 2_000_000) {
    return { ok: false as const, error: 'El archivo supera los 2 MB. Revise que sea la plantilla.' }
  }
  try {
    const buffer = Buffer.from(await archivo.arrayBuffer())
    const { analizarEvaluacion } = await import('@/lib/plantillas-archivo')
    const analisis = await analizarEvaluacion(buffer, archivo.name)
    return { ok: true as const, ...analisis }
  } catch {
    return {
      ok: false as const,
      error: 'No se pudo leer el archivo. Debe ser .xlsx o .csv, sin contraseña.',
    }
  }
}

export async function analizarArchivoEncuesta(formData: FormData) {
  await requerirRol('ADMIN', 'OPERACIONES')
  const archivo = formData.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false as const, error: 'Seleccione un archivo.' }
  }
  if (archivo.size > 2_000_000) {
    return { ok: false as const, error: 'El archivo supera los 2 MB. Revise que sea la plantilla.' }
  }
  try {
    const buffer = Buffer.from(await archivo.arrayBuffer())
    const { analizarEncuesta } = await import('@/lib/plantillas-archivo')
    const analisis = await analizarEncuesta(buffer, archivo.name)
    return { ok: true as const, ...analisis }
  } catch {
    return {
      ok: false as const,
      error: 'No se pudo leer el archivo. Debe ser .xlsx o .csv, sin contraseña.',
    }
  }
}

const LotePreguntas = z.object({
  modo: z.enum(['AGREGAR', 'REEMPLAZAR']),
  preguntas: z
    .array(
      z.object({
        enunciado: z.string().trim().min(5).max(500),
        tipo: z.enum(['SELECCION_MULTIPLE', 'VERDADERO_FALSO', 'RESPUESTA_BREVE']),
        opciones: z.array(z.string().trim()).default([]),
        respuestaCorrecta: z.string().default(''),
        puntaje: z.coerce.number().int().min(1).max(20),
      }),
    )
    .min(1, 'No hay preguntas que cargar.')
    .max(200, 'Demasiadas preguntas en un solo archivo.'),
})

/**
 * Guarda el lote ya revisado. Vuelve a validar cada pregunta acá: lo que llega
 * viene del navegador y no se da por bueno solo porque el análisis lo aprobó.
 */
export async function cargarPreguntasEvaluacion(
  plantillaId: string,
  datos: unknown,
): Promise<Resultado> {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = LotePreguntas.safeParse(datos)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { modo, preguntas: lote } = parsed.data

  const [plantilla] = await db
    .select()
    .from(plantillasEvaluacion)
    .where(eq(plantillasEvaluacion.id, plantillaId))
    .limit(1)
  if (!plantilla) return { ok: false, error: 'La evaluación ya no existe.' }

  for (const [i, p] of lote.entries()) {
    if (p.tipo === 'SELECCION_MULTIPLE') {
      const limpias = p.opciones.filter((o) => o.trim().length > 0)
      if (limpias.length < 2) {
        return { ok: false, error: `Pregunta ${i + 1}: necesita al menos 2 opciones.` }
      }
      const indice = Number(p.respuestaCorrecta)
      if (
        p.respuestaCorrecta.trim() === '' ||
        !Number.isInteger(indice) ||
        indice < 0 ||
        indice >= limpias.length
      ) {
        return { ok: false, error: `Pregunta ${i + 1}: la respuesta correcta no es válida.` }
      }
    }
    if (p.tipo === 'VERDADERO_FALSO' && p.respuestaCorrecta !== 'true' && p.respuestaCorrecta !== 'false') {
      return { ok: false, error: `Pregunta ${i + 1}: indique si es verdadera o falsa.` }
    }
  }

  if (modo === 'REEMPLAZAR') {
    await db.delete(preguntas).where(eq(preguntas.plantillaId, plantillaId))
  }

  const [{ ultimo }] = await db
    .select({ ultimo: max(preguntas.orden) })
    .from(preguntas)
    .where(eq(preguntas.plantillaId, plantillaId))

  let orden = ultimo ?? 0
  await db.insert(preguntas).values(
    lote.map((p) => ({
      plantillaId,
      orden: ++orden,
      enunciado: p.enunciado,
      tipo: p.tipo,
      opciones: p.tipo === 'SELECCION_MULTIPLE' ? p.opciones.filter((o) => o.trim() !== '') : null,
      respuestaCorrecta: p.respuestaCorrecta || null,
      puntaje: p.puntaje,
    })),
  )

  await auditar({
    entidad: 'plantilla_evaluacion',
    entidadId: plantillaId,
    accion: modo === 'REEMPLAZAR' ? 'preguntas_reemplazadas_archivo' : 'preguntas_cargadas_archivo',
    valorNuevo: { cantidad: lote.length, modo },
    usuarioId: usuario.id,
  })

  revalidatePath('/plantillas')
  return { ok: true }
}

const LotePreguntasEnc = z.object({
  modo: z.enum(['AGREGAR', 'REEMPLAZAR']),
  preguntas: z
    .array(
      z.object({
        enunciado: z.string().trim().min(5).max(500),
        tipo: z.enum(['ESCALA', 'TEXTO', 'SI_NO']),
      }),
    )
    .min(1, 'No hay preguntas que cargar.')
    .max(200, 'Demasiadas preguntas en un solo archivo.'),
})

export async function cargarPreguntasEncuesta(
  plantillaId: string,
  datos: unknown,
): Promise<Resultado> {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = LotePreguntasEnc.safeParse(datos)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { modo, preguntas: lote } = parsed.data

  const [plantilla] = await db
    .select()
    .from(plantillasEncuesta)
    .where(eq(plantillasEncuesta.id, plantillaId))
    .limit(1)
  if (!plantilla) return { ok: false, error: 'La encuesta ya no existe.' }

  if (modo === 'REEMPLAZAR') {
    await db.delete(preguntasEncuesta).where(eq(preguntasEncuesta.plantillaId, plantillaId))
  }

  const [{ ultimo }] = await db
    .select({ ultimo: max(preguntasEncuesta.orden) })
    .from(preguntasEncuesta)
    .where(eq(preguntasEncuesta.plantillaId, plantillaId))

  let orden = ultimo ?? 0
  await db.insert(preguntasEncuesta).values(
    lote.map((p) => ({ plantillaId, orden: ++orden, enunciado: p.enunciado, tipo: p.tipo })),
  )

  await auditar({
    entidad: 'plantilla_encuesta',
    entidadId: plantillaId,
    accion: modo === 'REEMPLAZAR' ? 'preguntas_reemplazadas_archivo' : 'preguntas_cargadas_archivo',
    valorNuevo: { cantidad: lote.length, modo },
    usuarioId: usuario.id,
  })

  revalidatePath('/plantillas')
  return { ok: true }
}

/**
 * Crea la encuesta de satisfacción estándar, con las preguntas habituales de
 * una capacitación. Ahorra escribirlas a mano y después se editan.
 */
export async function crearEncuestaEstandar(): Promise<Resultado> {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')

  const [{ total }] = await db.select({ total: count() }).from(plantillasEncuesta)
  if (total > 0) {
    return { ok: false, error: 'Ya existe al menos una encuesta. Cree una nueva a mano si la necesita.' }
  }

  const [plantilla] = await db
    .insert(plantillasEncuesta)
    .values({ nombre: 'Encuesta de satisfacción', escalaMin: 1, escalaMax: 7, anonima: true })
    .returning()

  await db.insert(preguntasEncuesta).values([
    { plantillaId: plantilla.id, orden: 1, enunciado: 'El relator dominaba los contenidos del curso.', tipo: 'ESCALA' },
    { plantillaId: plantilla.id, orden: 2, enunciado: 'Los contenidos son aplicables a mi trabajo diario.', tipo: 'ESCALA' },
    { plantillaId: plantilla.id, orden: 3, enunciado: 'El material entregado fue claro y suficiente.', tipo: 'ESCALA' },
    { plantillaId: plantilla.id, orden: 4, enunciado: 'Las condiciones de la sala fueron adecuadas.', tipo: 'ESCALA' },
    { plantillaId: plantilla.id, orden: 5, enunciado: 'Recomendaría este curso a un compañero de trabajo.', tipo: 'ESCALA' },
    { plantillaId: plantilla.id, orden: 6, enunciado: '¿Qué mejoraría de este curso?', tipo: 'TEXTO' },
  ])

  await auditar({
    entidad: 'plantilla_encuesta',
    entidadId: plantilla.id,
    accion: 'encuesta_estandar_creada',
    usuarioId: usuario.id,
  })

  revalidatePath('/plantillas')
  return { ok: true }
}
