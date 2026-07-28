'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { clientes, lugares } from '@/db/schema'
import { auditar } from '@/lib/audit'
import { requerirRol } from '@/lib/auth'
import { normalizarRut, validarRut } from '@/lib/rut'

const Cliente = z.object({
  razonSocial: z.string().trim().min(3, 'Indique la razón social').max(200),
  rut: z.string().trim().optional().or(z.literal('')),
  contactoNombre: z.string().trim().max(120).optional().or(z.literal('')),
  contactoEmail: z.string().trim().max(120).optional().or(z.literal('')),
  contactoTelefono: z.string().trim().max(40).optional().or(z.literal('')),
})

export async function guardarCliente(datos: unknown, clienteId?: string) {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = Cliente.safeParse(datos)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }
  const d = parsed.data

  let rut: string | null = null
  if (d.rut && d.rut.trim() !== '') {
    if (!validarRut(d.rut)) return { ok: false as const, error: 'El RUT del cliente no es válido.' }
    rut = normalizarRut(d.rut)
  }

  if (d.contactoEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.contactoEmail)) {
    return { ok: false as const, error: 'El correo de contacto no es válido.' }
  }

  const valores = {
    razonSocial: d.razonSocial,
    rut,
    contactoNombre: d.contactoNombre || null,
    contactoEmail: d.contactoEmail || null,
    contactoTelefono: d.contactoTelefono || null,
  }

  let id = clienteId
  if (id) {
    await db.update(clientes).set(valores).where(eq(clientes.id, id))
  } else {
    const [creado] = await db.insert(clientes).values(valores).returning({ id: clientes.id })
    id = creado.id
  }

  await auditar({
    entidad: 'cliente',
    entidadId: id,
    accion: clienteId ? 'cliente_editado' : 'cliente_creado',
    valorNuevo: valores,
    usuarioId: usuario.id,
  })

  revalidatePath('/clientes')
  return { ok: true as const }
}

const Lugar = z.object({
  nombre: z.string().trim().min(2, 'Indique el nombre del lugar').max(150),
  tipo: z.enum(['FAENA', 'HOTEL', 'OFICINA', 'OTRO']),
  direccion: z.string().trim().max(200).optional().or(z.literal('')),
  comuna: z.string().trim().max(80).optional().or(z.literal('')),
  clienteId: z.string().optional().or(z.literal('')),
})

export async function guardarLugar(datos: unknown) {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = Lugar.safeParse(datos)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }
  const d = parsed.data

  const [creado] = await db
    .insert(lugares)
    .values({
      nombre: d.nombre,
      tipo: d.tipo,
      direccion: d.direccion || null,
      comuna: d.comuna || null,
      clienteId: d.clienteId || null,
    })
    .returning({ id: lugares.id })

  await auditar({
    entidad: 'lugar',
    entidadId: creado.id,
    accion: 'lugar_creado',
    valorNuevo: d,
    usuarioId: usuario.id,
  })

  revalidatePath('/clientes')
  return { ok: true as const }
}

export async function desactivarLugar(lugarId: string) {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  await db.update(lugares).set({ activo: false }).where(eq(lugares.id, lugarId))
  await auditar({
    entidad: 'lugar',
    entidadId: lugarId,
    accion: 'lugar_desactivado',
    usuarioId: usuario.id,
  })
  revalidatePath('/clientes')
  return { ok: true as const }
}

// ---------------------------------------------------------------------------
// Carga por archivo
// ---------------------------------------------------------------------------

function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function leerArchivo(formData: FormData) {
  const archivo = formData.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false as const, error: 'Seleccione un archivo.' }
  }
  if (archivo.size > 5_000_000) return { ok: false as const, error: 'El archivo supera los 5 MB.' }
  return { ok: true as const, buffer: Buffer.from(await archivo.arrayBuffer()), nombre: archivo.name }
}

export async function analizarArchivoClientes(formData: FormData) {
  await requerirRol('ADMIN', 'OPERACIONES')
  const leido = await leerArchivo(formData)
  if (!leido.ok) return leido
  try {
    const { analizarClientes } = await import('@/lib/cargas')
    return { ok: true as const, ...(await analizarClientes(leido.buffer, leido.nombre)) }
  } catch {
    return { ok: false as const, error: 'No se pudo leer el archivo. Debe ser .xlsx o .csv.' }
  }
}

export async function analizarArchivoLugares(formData: FormData) {
  await requerirRol('ADMIN', 'OPERACIONES')
  const leido = await leerArchivo(formData)
  if (!leido.ok) return leido
  try {
    const { analizarLugares } = await import('@/lib/cargas')
    return { ok: true as const, ...(await analizarLugares(leido.buffer, leido.nombre)) }
  } catch {
    return { ok: false as const, error: 'No se pudo leer el archivo. Debe ser .xlsx o .csv.' }
  }
}

const LoteClientes = z
  .array(
    z.object({
      razonSocial: z.string().trim().min(3).max(200),
      rut: z.string().trim().default(''),
      contactoNombre: z.string().trim().max(120).default(''),
      contactoEmail: z.string().trim().max(120).default(''),
      contactoTelefono: z.string().trim().max(40).default(''),
    }),
  )
  .min(1, 'No hay clientes que cargar.')
  .max(500, 'Demasiadas filas en un solo archivo.')

/** El cliente se identifica por su razón social: recargar actualiza, no duplica. */
export async function cargarClientes(datos: unknown): Promise<{ ok: boolean; error?: string }> {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = LoteClientes.safeParse(datos)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const lote = parsed.data

  const existentes = await db.select().from(clientes)
  const porRazon = new Map(existentes.map((c) => [normalizarTexto(c.razonSocial), c.id]))

  let creados = 0
  let actualizados = 0

  for (const c of lote) {
    let rut: string | null = null
    if (c.rut !== '') {
      const norm = normalizarRut(c.rut)
      if (norm === null || !validarRut(norm)) {
        return { ok: false, error: `El RUT de «${c.razonSocial}» no es válido.` }
      }
      rut = norm
    }

    const valores = {
      razonSocial: c.razonSocial,
      rut,
      contactoNombre: c.contactoNombre || null,
      contactoEmail: c.contactoEmail || null,
      contactoTelefono: c.contactoTelefono || null,
    }

    const clave = normalizarTexto(c.razonSocial)
    const previo = porRazon.get(clave)
    if (previo) {
      await db.update(clientes).set(valores).where(eq(clientes.id, previo))
      actualizados++
    } else {
      const [creado] = await db.insert(clientes).values(valores).returning({ id: clientes.id })
      porRazon.set(clave, creado.id)
      creados++
    }
  }

  await auditar({
    entidad: 'cliente',
    entidadId: 'lote',
    accion: 'clientes_cargados_archivo',
    valorNuevo: { creados, actualizados },
    usuarioId: usuario.id,
  })

  revalidatePath('/clientes')
  revalidatePath('/cursos/nuevo')
  return { ok: true }
}

const LoteLugares = z
  .array(
    z.object({
      nombre: z.string().trim().min(3).max(200),
      tipo: z.enum(['FAENA', 'HOTEL', 'OFICINA', 'OTRO']),
      direccion: z.string().trim().max(200).default(''),
      comuna: z.string().trim().max(80).default(''),
      cliente: z.string().trim().max(200).default(''),
    }),
  )
  .min(1, 'No hay lugares que cargar.')
  .max(500, 'Demasiadas filas en un solo archivo.')

/**
 * El lugar se identifica por nombre + cliente. Un cliente que no exista todavía
 * detiene la carga con un mensaje claro en vez de crearlo por su cuenta: crear
 * clientes a partir de una celda mal escrita en la planilla de lugares es
 * exactamente cómo se llena la base de duplicados.
 */
export async function cargarLugares(datos: unknown): Promise<{ ok: boolean; error?: string }> {
  const usuario = await requerirRol('ADMIN', 'OPERACIONES')
  const parsed = LoteLugares.safeParse(datos)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const lote = parsed.data

  const listaClientes = await db.select().from(clientes)
  const porRazon = new Map(listaClientes.map((c) => [normalizarTexto(c.razonSocial), c.id]))

  const desconocidos = [
    ...new Set(
      lote
        .filter((l) => l.cliente !== '' && !porRazon.has(normalizarTexto(l.cliente)))
        .map((l) => l.cliente),
    ),
  ]
  if (desconocidos.length > 0) {
    return {
      ok: false,
      error: `Estos clientes no existen todavía: ${desconocidos.join(', ')}. Cárguelos primero, o deje la columna Cliente vacía.`,
    }
  }

  const existentes = await db.select().from(lugares)
  const clave = (nombre: string, clienteId: string | null) =>
    `${normalizarTexto(nombre)}|${clienteId ?? ''}`
  const porClave = new Map(existentes.map((l) => [clave(l.nombre, l.clienteId), l.id]))

  let creados = 0
  let actualizados = 0

  for (const l of lote) {
    const clienteId = l.cliente !== '' ? (porRazon.get(normalizarTexto(l.cliente)) ?? null) : null
    const valores = {
      nombre: l.nombre,
      tipo: l.tipo,
      direccion: l.direccion || null,
      comuna: l.comuna || null,
      clienteId,
      activo: true,
    }
    const k = clave(l.nombre, clienteId)
    const previo = porClave.get(k)
    if (previo) {
      await db.update(lugares).set(valores).where(eq(lugares.id, previo))
      actualizados++
    } else {
      const [creado] = await db.insert(lugares).values(valores).returning({ id: lugares.id })
      porClave.set(k, creado.id)
      creados++
    }
  }

  await auditar({
    entidad: 'lugar',
    entidadId: 'lote',
    accion: 'lugares_cargados_archivo',
    valorNuevo: { creados, actualizados },
    usuarioId: usuario.id,
  })

  revalidatePath('/clientes')
  revalidatePath('/cursos/nuevo')
  return { ok: true }
}
