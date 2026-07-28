'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { cursos, nominaItems, sesiones, tiposCurso } from '@/db/schema'
import { auditar } from '@/lib/audit'
import { requerirRol } from '@/lib/auth'
import { createToken } from '@/lib/ids'
import { parsearNomina } from '@/lib/nomina'

const Curso = z.object({
  nombreActividad: z.string().trim().min(3, 'Indique el nombre de la actividad').max(200),
  clienteId: z.string().min(1, 'Seleccione un cliente'),
  tipoCursoId: z.string().min(1, 'Seleccione un tipo de curso'),
  lugarId: z.string().optional().or(z.literal('')),
  lugarLibre: z.string().trim().max(200).optional().or(z.literal('')),
  modalidad: z.enum(['PRESENCIAL_TEORICO', 'PRESENCIAL_PRACTICO', 'PRESENCIAL_MIXTO']),
  horas: z.coerce.number().int().min(1).max(200),
  nominaEsperada: z.coerce.number().int().min(0).max(500),
  jornadas: z
    .array(
      z.object({
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
        horaInicio: z.string().regex(/^\d{2}:\d{2}$/),
        horaFin: z.string().regex(/^\d{2}:\d{2}$/),
        profesorId: z.string().optional().or(z.literal('')),
      }),
    )
    .min(1, 'Agregue al menos una jornada'),
  nominaTexto: z.string().optional().or(z.literal('')),
  observaciones: z.string().trim().max(1000).optional().or(z.literal('')),
})

export async function crearCurso(datos: unknown) {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = Curso.safeParse(datos)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message }
  }
  const d = parsed.data

  if (!d.lugarId && !d.lugarLibre) {
    return { ok: false as const, error: 'Indique el lugar de ejecución.' }
  }

  const fechas = d.jornadas.map((j) => j.fecha).sort()
  const codigo = await generarCodigo(d.tipoCursoId, fechas[0])

  const [curso] = await db
    .insert(cursos)
    .values({
      codigo,
      nombreActividad: d.nombreActividad,
      clienteId: d.clienteId,
      tipoCursoId: d.tipoCursoId,
      lugarId: d.lugarId || null,
      lugarLibre: d.lugarLibre || null,
      modalidad: d.modalidad,
      horas: d.horas,
      nominaEsperada: d.nominaEsperada,
      fechaInicio: fechas[0],
      fechaTermino: fechas[fechas.length - 1],
      observaciones: d.observaciones || null,
    })
    .returning()

  for (const j of d.jornadas) {
    await db.insert(sesiones).values({
      cursoId: curso.id,
      fecha: j.fecha,
      horaInicio: j.horaInicio,
      horaFin: j.horaFin,
      profesorId: j.profesorId || null,
      tokenAsistencia: createToken(),
      tokenEvaluacion: createToken(),
      tokenEncuesta: createToken(),
    })
  }

  const nomina = parsearNomina(d.nominaTexto ?? '')
  if (nomina.length > 0) {
    await db.insert(nominaItems).values(nomina.map((n) => ({ ...n, cursoId: curso.id })))
  }

  await auditar({
    entidad: 'curso',
    entidadId: curso.id,
    accion: 'curso_creado',
    valorNuevo: { codigo, jornadas: d.jornadas.length, nomina: nomina.length },
    usuarioId: usuario.id,
  })

  revalidatePath('/cursos')
  revalidatePath('/')
  redirect(`/cursos/${curso.id}`)
}

/** Código legible: TIPO-AAAAMMDD-N */
async function generarCodigo(tipoCursoId: string, fecha: string) {
  const [tipo] = await db.select().from(tiposCurso).where(eq(tiposCurso.id, tipoCursoId)).limit(1)
  const prefijo = (tipo?.codigoInterno ?? tipo?.nombre ?? 'CURSO')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
  const base = `${prefijo}-${fecha.replace(/-/g, '')}`

  const existentes = await db.select({ codigo: cursos.codigo }).from(cursos)
  const usados = new Set(existentes.map((c) => c.codigo))
  let n = 1
  while (usados.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export async function cargarNomina(cursoId: string, texto: string) {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const filas = parsearNomina(texto)
  if (filas.length === 0) return { ok: false as const, error: 'No se detectaron filas válidas.' }

  await db.delete(nominaItems).where(eq(nominaItems.cursoId, cursoId))
  await db.insert(nominaItems).values(filas.map((f) => ({ ...f, cursoId })))
  await db
    .update(cursos)
    .set({ nominaEsperada: filas.length, actualizadoEn: new Date() })
    .where(eq(cursos.id, cursoId))

  await auditar({
    entidad: 'curso',
    entidadId: cursoId,
    accion: 'nomina_cargada',
    valorNuevo: { filas: filas.length },
    usuarioId: usuario.id,
  })

  revalidatePath(`/cursos/${cursoId}`)
  return { ok: true as const, filas: filas.length }
}

export async function asignarProfesor(sesionId: string, profesorId: string, cursoId: string) {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  await db
    .update(sesiones)
    .set({ profesorId: profesorId || null })
    .where(eq(sesiones.id, sesionId))
  await auditar({
    entidad: 'sesion',
    entidadId: sesionId,
    accion: 'profesor_asignado',
    valorNuevo: { profesorId },
    usuarioId: usuario.id,
  })
  revalidatePath(`/cursos/${cursoId}`)
  return { ok: true as const }
}

export async function asignarPlantillas(
  sesionId: string,
  cursoId: string,
  plantillaEvaluacionId: string,
  plantillaEncuestaId: string,
) {
  await requerirRol('ADMIN', 'OPERACIONES')
  await db
    .update(sesiones)
    .set({
      plantillaEvaluacionId: plantillaEvaluacionId || null,
      plantillaEncuestaId: plantillaEncuestaId || null,
    })
    .where(eq(sesiones.id, sesionId))
  revalidatePath(`/cursos/${cursoId}`)
  return { ok: true as const }
}
