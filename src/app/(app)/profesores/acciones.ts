'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { profesorMaterias, profesores } from '@/db/schema'
import { auditar } from '@/lib/audit'
import { requerirRol } from '@/lib/auth'
import { normalizarRut, validarRut } from '@/lib/rut'

const Profesor = z.object({
  nombre: z.string().trim().min(3, 'Indique el nombre').max(120),
  rut: z.string().trim().optional().or(z.literal('')),
  telefono: z.string().trim().max(40).optional().or(z.literal('')),
  email: z.string().trim().max(120).optional().or(z.literal('')),
  direccion: z.string().trim().max(200).optional().or(z.literal('')),
  comuna: z.string().trim().max(80).optional().or(z.literal('')),
  materias: z.array(z.string()).default([]),
})

export async function guardarProfesor(datos: unknown, profesorId?: string) {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = Profesor.safeParse(datos)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }
  const d = parsed.data

  let rut: string | null = null
  if (d.rut && d.rut.trim() !== '') {
    if (!validarRut(d.rut)) return { ok: false as const, error: 'El RUT del relator no es válido.' }
    rut = normalizarRut(d.rut)
  }

  if (d.email && d.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
    return { ok: false as const, error: 'El correo no tiene un formato válido.' }
  }

  const valores = {
    nombre: d.nombre,
    rut,
    telefono: d.telefono || null,
    email: d.email || null,
    direccion: d.direccion || null,
    comuna: d.comuna || null,
  }

  let id = profesorId
  if (id) {
    await db.update(profesores).set(valores).where(eq(profesores.id, id))
  } else {
    const [creado] = await db.insert(profesores).values(valores).returning({ id: profesores.id })
    id = creado.id
  }

  // Reemplaza las materias por el conjunto enviado.
  await db.delete(profesorMaterias).where(eq(profesorMaterias.profesorId, id))
  if (d.materias.length > 0) {
    await db
      .insert(profesorMaterias)
      .values(d.materias.map((tipoCursoId) => ({ profesorId: id!, tipoCursoId })))
  }

  await auditar({
    entidad: 'profesor',
    entidadId: id,
    accion: profesorId ? 'profesor_editado' : 'profesor_creado',
    valorNuevo: { ...valores, materias: d.materias.length },
    usuarioId: usuario.id,
  })

  revalidatePath('/profesores')
  return { ok: true as const }
}

/** Baja lógica: nada se elimina físicamente. */
export async function alternarActivoProfesor(profesorId: string, activo: boolean) {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  await db.update(profesores).set({ activo }).where(eq(profesores.id, profesorId))
  await auditar({
    entidad: 'profesor',
    entidadId: profesorId,
    accion: activo ? 'profesor_reactivado' : 'profesor_desactivado',
    usuarioId: usuario.id,
  })
  revalidatePath('/profesores')
  return { ok: true as const }
}
