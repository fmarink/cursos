'use server'

import { revalidatePath } from 'next/cache'
import { count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { cursos, tiposCurso } from '@/db/schema'
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
