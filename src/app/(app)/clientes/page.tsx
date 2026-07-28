import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { clientes, cursos, lugares } from '@/db/schema'
import { requerirRol } from '@/lib/auth'
import { formatearRut } from '@/lib/rut'
import GestionClientes from './GestionClientes'

export const dynamic = 'force-dynamic'

export default async function PaginaClientes() {
  await requerirRol('ADMIN', 'OPERACIONES')

  const [lista, listaLugares] = await Promise.all([
    db
      .select({
        cliente: clientes,
        totalCursos: sql<number>`(select count(*)::int from ${cursos}
          where ${cursos.clienteId} = ${clientes.id})`,
      })
      .from(clientes)
      .orderBy(asc(clientes.razonSocial)),
    db.select().from(lugares).where(eq(lugares.activo, true)).orderBy(asc(lugares.nombre)),
  ])

  const porCliente = new Map<string, { id: string; nombre: string; tipo: string }[]>()
  for (const l of listaLugares) {
    const clave = l.clienteId ?? '__generales__'
    const actual = porCliente.get(clave) ?? []
    actual.push({ id: l.id, nombre: l.nombre, tipo: l.tipo })
    porCliente.set(clave, actual)
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Clientes y lugares</h1>
        <p className="mt-1 text-sm text-slate-500">
          Empresas mandantes y sus faenas, hoteles u oficinas donde se dictan los cursos.
        </p>
      </div>

      <GestionClientes
        clientes={lista.map((f) => ({
          id: f.cliente.id,
          razonSocial: f.cliente.razonSocial,
          rut: f.cliente.rut ? formatearRut(f.cliente.rut) : '',
          contactoNombre: f.cliente.contactoNombre ?? '',
          contactoEmail: f.cliente.contactoEmail ?? '',
          contactoTelefono: f.cliente.contactoTelefono ?? '',
          activo: f.cliente.activo,
          totalCursos: f.totalCursos,
          lugares: porCliente.get(f.cliente.id) ?? [],
        }))}
        lugaresGenerales={porCliente.get('__generales__') ?? []}
      />
    </div>
  )
}
