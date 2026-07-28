'use server'

import { revalidatePath } from 'next/cache'
import { count, eq, max } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { bloquesPrograma, cursos, tiposCurso } from '@/db/schema'
import { auditar } from '@/lib/audit'
import { requerirRol } from '@/lib/auth'

const TipoCurso = z.object({
  nombre: z.string().trim().min(3, 'Indique el nombre del curso').max(150),
  codigoInterno: z.string().trim().max(20).optional().or(z.literal('')),
  horasDefault: z.coerce.number().int().min(1, 'Mínimo 1 hora').max(200),
  tieneComponentePractico: z.boolean().default(false),
  descripcion: z.string().trim().max(600).optional().or(z.literal('')),
  codigoSence: z.string().trim().max(40).optional().or(z.literal('')),
})

export async function guardarTipoCurso(datos: unknown, tipoCursoId?: string) {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = TipoCurso.safeParse(datos)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }
  const d = parsed.data

  // El código interno alimenta el código legible de cada curso (ALTURA-20260727-1),
  // así que no puede repetirse.
  const codigo = d.codigoInterno ? d.codigoInterno.toUpperCase() : null
  if (codigo) {
    const [choque] = await db
      .select({ id: tiposCurso.id })
      .from(tiposCurso)
      .where(eq(tiposCurso.codigoInterno, codigo))
      .limit(1)
    if (choque && choque.id !== tipoCursoId) {
      return { ok: false as const, error: `El código "${codigo}" ya está en uso por otro tipo de curso.` }
    }
  }

  const valores = {
    nombre: d.nombre,
    codigoInterno: codigo,
    horasDefault: d.horasDefault,
    tieneComponentePractico: d.tieneComponentePractico,
    descripcion: d.descripcion || null,
    codigoSence: d.codigoSence || null,
  }

  let id = tipoCursoId
  if (id) {
    await db.update(tiposCurso).set(valores).where(eq(tiposCurso.id, id))
  } else {
    const [creado] = await db.insert(tiposCurso).values(valores).returning({ id: tiposCurso.id })
    id = creado.id
  }

  await auditar({
    entidad: 'tipo_curso',
    entidadId: id,
    accion: tipoCursoId ? 'tipo_curso_editado' : 'tipo_curso_creado',
    valorNuevo: valores,
    usuarioId: usuario.id,
  })

  revalidatePath('/tipos-curso')
  revalidatePath('/cursos/nuevo')
  return { ok: true as const }
}

/** Baja lógica: los cursos ya dictados conservan su tipo. */
export async function alternarActivoTipoCurso(tipoCursoId: string, activo: boolean) {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')

  if (!activo) {
    const [{ total }] = await db
      .select({ total: count() })
      .from(cursos)
      .where(eq(cursos.tipoCursoId, tipoCursoId))
    if (total > 0) {
      // No se bloquea: se desactiva igual, pero el usuario sabe qué implica.
      await db.update(tiposCurso).set({ activo }).where(eq(tiposCurso.id, tipoCursoId))
      await auditar({
        entidad: 'tipo_curso',
        entidadId: tipoCursoId,
        accion: 'tipo_curso_desactivado',
        valorNuevo: { cursosExistentes: total },
        usuarioId: usuario.id,
      })
      revalidatePath('/tipos-curso')
      return {
        ok: true as const,
        aviso: `Desactivado. Los ${total} curso(s) ya creados con este tipo no se ven afectados.`,
      }
    }
  }

  await db.update(tiposCurso).set({ activo }).where(eq(tiposCurso.id, tipoCursoId))
  await auditar({
    entidad: 'tipo_curso',
    entidadId: tipoCursoId,
    accion: activo ? 'tipo_curso_reactivado' : 'tipo_curso_desactivado',
    usuarioId: usuario.id,
  })
  revalidatePath('/tipos-curso')
  return { ok: true as const }
}

// ---------------------------------------------------------------------------
// Programa de contenidos del tipo de curso
// ---------------------------------------------------------------------------

export async function analizarArchivoPrograma(formData: FormData) {
  await requerirRol('ADMIN', 'OPERACIONES')
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

const LoteBloques = z
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

export async function cargarPrograma(
  tipoCursoId: string,
  datos: unknown,
  modo: 'AGREGAR' | 'REEMPLAZAR',
): Promise<{ ok: boolean; error?: string }> {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = LoteBloques.safeParse(datos)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const lote = parsed.data

  const [tipo] = await db.select().from(tiposCurso).where(eq(tiposCurso.id, tipoCursoId)).limit(1)
  if (!tipo) return { ok: false, error: 'El tipo de curso ya no existe.' }

  if (modo === 'REEMPLAZAR') {
    await db.delete(bloquesPrograma).where(eq(bloquesPrograma.tipoCursoId, tipoCursoId))
  }

  const [{ ultimo }] = await db
    .select({ ultimo: max(bloquesPrograma.orden) })
    .from(bloquesPrograma)
    .where(eq(bloquesPrograma.tipoCursoId, tipoCursoId))

  let orden = ultimo ?? 0
  await db.insert(bloquesPrograma).values(
    lote.map((b) => ({
      tipoCursoId,
      orden: ++orden,
      tema: b.tema,
      actividades: b.actividades || null,
      horaInicio: b.horaInicio || null,
      horaFin: b.horaFin || null,
      observaciones: b.observaciones || null,
    })),
  )

  await auditar({
    entidad: 'tipo_curso',
    entidadId: tipoCursoId,
    accion: modo === 'REEMPLAZAR' ? 'programa_reemplazado_archivo' : 'programa_cargado_archivo',
    valorNuevo: { cantidad: lote.length },
    usuarioId: usuario.id,
  })

  revalidatePath('/tipos-curso')
  return { ok: true }
}

export async function vaciarPrograma(tipoCursoId: string): Promise<{ ok: boolean; error?: string }> {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  await db.delete(bloquesPrograma).where(eq(bloquesPrograma.tipoCursoId, tipoCursoId))
  await auditar({
    entidad: 'tipo_curso',
    entidadId: tipoCursoId,
    accion: 'programa_vaciado',
    usuarioId: usuario.id,
  })
  revalidatePath('/tipos-curso')
  return { ok: true }
}
