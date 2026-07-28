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
