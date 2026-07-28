import { and, asc, eq, isNull, or } from 'drizzle-orm'
import { db } from '@/db'
import {
  plantillasEncuesta,
  plantillasEvaluacion,
  preguntas,
  preguntasEncuesta,
} from '@/db/schema'
import { calcularNota } from './notas'

/**
 * Resuelve qué evaluación aplica a una sesión, en orden de especificidad:
 *   1. La plantilla fijada explícitamente en la sesión.
 *   2. La que coincide con el tipo de curso y el cliente.
 *   3. La que coincide solo con el tipo de curso.
 *   4. Cualquier plantilla activa genérica.
 */
export async function resolverPlantillaEvaluacion(
  sesionPlantillaId: string | null,
  tipoCursoId: string,
  clienteId: string,
) {
  if (sesionPlantillaId) {
    const [p] = await db
      .select()
      .from(plantillasEvaluacion)
      .where(eq(plantillasEvaluacion.id, sesionPlantillaId))
      .limit(1)
    if (p) return p
  }

  const candidatas = await db
    .select()
    .from(plantillasEvaluacion)
    .where(
      and(
        eq(plantillasEvaluacion.activa, true),
        or(
          eq(plantillasEvaluacion.tipoCursoId, tipoCursoId),
          isNull(plantillasEvaluacion.tipoCursoId),
        ),
      ),
    )

  return (
    candidatas.find((p) => p.tipoCursoId === tipoCursoId && p.clienteId === clienteId) ??
    candidatas.find((p) => p.tipoCursoId === tipoCursoId && p.clienteId === null) ??
    candidatas.find((p) => p.tipoCursoId === null) ??
    null
  )
}

export async function preguntasDePlantilla(plantillaId: string) {
  return db
    .select()
    .from(preguntas)
    .where(eq(preguntas.plantillaId, plantillaId))
    .orderBy(asc(preguntas.orden))
}

export async function resolverPlantillaEncuesta(sesionPlantillaId: string | null) {
  if (sesionPlantillaId) {
    const [p] = await db
      .select()
      .from(plantillasEncuesta)
      .where(eq(plantillasEncuesta.id, sesionPlantillaId))
      .limit(1)
    if (p) return p
  }
  const [p] = await db
    .select()
    .from(plantillasEncuesta)
    .where(eq(plantillasEncuesta.activa, true))
    .limit(1)
  return p ?? null
}

export async function preguntasDeEncuesta(plantillaId: string) {
  return db
    .select()
    .from(preguntasEncuesta)
    .where(eq(preguntasEncuesta.plantillaId, plantillaId))
    .orderBy(asc(preguntasEncuesta.orden))
}

export type PreguntaCorregible = {
  id: string
  tipo: 'SELECCION_MULTIPLE' | 'VERDADERO_FALSO' | 'RESPUESTA_BREVE'
  respuestaCorrecta: string | null
  puntaje: number
}

/**
 * Corrige automáticamente las preguntas cerradas.
 *
 * Las de respuesta breve quedan en cero y marcan la evaluación como
 * pendiente de corrección manual: el profesor asigna el puntaje después.
 */
export function corregirAutomatico(
  listaPreguntas: PreguntaCorregible[],
  respuestas: Record<string, string>,
  umbral: number,
  exigencia: number,
) {
  const puntajes: Record<string, number> = {}
  let obtenido = 0
  let maximo = 0
  let requiereManual = false

  for (const p of listaPreguntas) {
    maximo += p.puntaje
    const dada = (respuestas[p.id] ?? '').trim()

    if (p.tipo === 'RESPUESTA_BREVE') {
      // Se acepta coincidencia exacta insensible a mayúsculas y acentos.
      // Si no coincide, no se castiga: lo revisa el relator.
      if (p.respuestaCorrecta && normalizar(dada) === normalizar(p.respuestaCorrecta)) {
        puntajes[p.id] = p.puntaje
        obtenido += p.puntaje
      } else {
        puntajes[p.id] = 0
        requiereManual = true
      }
      continue
    }

    const correcto = (p.respuestaCorrecta ?? '').trim()
    if (correcto !== '' && dada === correcto) {
      puntajes[p.id] = p.puntaje
      obtenido += p.puntaje
    } else {
      puntajes[p.id] = 0
    }
  }

  const nota = calcularNota(obtenido, maximo, umbral, exigencia)
  return {
    puntajes,
    puntajeTotal: obtenido,
    puntajeMaximo: maximo,
    nota,
    aprobado: nota >= umbral,
    requiereCorreccionManual: requiereManual,
  }
}

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
