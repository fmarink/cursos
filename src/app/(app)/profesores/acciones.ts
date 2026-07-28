'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { profesorMaterias, profesores, tiposCurso } from '@/db/schema'
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

// ---------------------------------------------------------------------------
// Carga por archivo
// ---------------------------------------------------------------------------

async function leerArchivo(formData: FormData) {
  const archivo = formData.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false as const, error: 'Seleccione un archivo.' }
  }
  if (archivo.size > 5_000_000) {
    return { ok: false as const, error: 'El archivo supera los 5 MB.' }
  }
  return { ok: true as const, buffer: Buffer.from(await archivo.arrayBuffer()), nombre: archivo.name }
}

export async function analizarArchivoRelatores(formData: FormData) {
  await requerirRol('ADMIN', 'OPERACIONES')
  const leido = await leerArchivo(formData)
  if (!leido.ok) return leido
  try {
    const { analizarRelatores } = await import('@/lib/cargas')
    return { ok: true as const, ...(await analizarRelatores(leido.buffer, leido.nombre)) }
  } catch {
    return {
      ok: false as const,
      error: 'No se pudo leer el archivo. Debe ser .xlsx o .csv, sin contraseña.',
    }
  }
}

const LoteRelatores = z.array(
  z.object({
    nombre: z.string().trim().min(3).max(120),
    rut: z.string().trim().default(''),
    telefono: z.string().trim().max(40).default(''),
    email: z.string().trim().max(120).default(''),
    direccion: z.string().trim().max(200).default(''),
    comuna: z.string().trim().max(80).default(''),
    materias: z.array(z.string().trim()).default([]),
    notas: z.string().trim().max(600).default(''),
  }),
).min(1, 'No hay relatores que cargar.').max(500, 'Demasiadas filas en un solo archivo.')

/**
 * Guarda el lote ya revisado.
 *
 * El relator se identifica por RUT, o por nombre si no trae RUT: cargar dos
 * veces el mismo archivo actualiza sus datos en vez de duplicarlo. Es la misma
 * regla del importador por consola, para que no haya dos comportamientos según
 * por dónde entró el archivo.
 */
export async function cargarRelatores(datos: unknown): Promise<{ ok: boolean; error?: string }> {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = LoteRelatores.safeParse(datos)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const lote = parsed.data

  const tipos = await db.select().from(tiposCurso)
  const porNombre = new Map(tipos.map((t) => [normalizarTexto(t.nombre), t.id]))

  // Los relatores ya cargados se leen una sola vez y se indexan en memoria. Con
  // una consulta por fila, un archivo de 300 relatores serían 300 lecturas de
  // la tabla completa.
  const existentes = await db.select().from(profesores)
  const porRut = new Map(existentes.filter((p) => p.rut).map((p) => [p.rut as string, p.id]))
  const porNombreProfesor = new Map(existentes.map((p) => [normalizarTexto(p.nombre), p.id]))

  let creados = 0
  let actualizados = 0

  for (const r of lote) {
    const rut = r.rut !== '' ? normalizarRut(r.rut) : null
    if (r.rut !== '' && (rut === null || !validarRut(rut))) {
      return { ok: false, error: `El RUT de «${r.nombre}» no es válido.` }
    }

    const valores = {
      nombre: r.nombre,
      rut,
      telefono: r.telefono || null,
      email: r.email || null,
      direccion: r.direccion || null,
      comuna: r.comuna || null,
      notas: r.notas || null,
    }

    const previo = rut ? porRut.get(rut) : porNombreProfesor.get(normalizarTexto(r.nombre))

    let id: string
    if (previo) {
      await db.update(profesores).set(valores).where(eq(profesores.id, previo))
      id = previo
      actualizados++
    } else {
      const [creado] = await db.insert(profesores).values(valores).returning({ id: profesores.id })
      id = creado.id
      creados++
      // El índice se mantiene al día dentro del propio lote: si el archivo trae
      // dos veces al mismo relator, la segunda vez actualiza, no duplica.
      if (rut) porRut.set(rut, id)
      porNombreProfesor.set(normalizarTexto(r.nombre), id)
    }

    // Las materias se reemplazan por las del archivo solo si el archivo trae
    // alguna: una columna vacía no debe borrar lo que ya estaba cargado.
    const ids = r.materias
      .map((m) => porNombre.get(normalizarTexto(m)))
      .filter((x): x is string => Boolean(x))
    if (ids.length > 0) {
      await db.delete(profesorMaterias).where(eq(profesorMaterias.profesorId, id))
      await db
        .insert(profesorMaterias)
        .values(ids.map((tipoCursoId) => ({ profesorId: id, tipoCursoId })))
    }
  }

  await auditar({
    entidad: 'profesor',
    entidadId: 'lote',
    accion: 'relatores_cargados_archivo',
    valorNuevo: { creados, actualizados },
    usuarioId: usuario.id,
  })

  revalidatePath('/profesores')
  return { ok: true }
}

function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
