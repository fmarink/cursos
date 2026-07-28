import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { clientes, lugares, profesores, tiposCurso } from '@/db/schema'
import { requerirRol } from '@/lib/auth'
import FormularioCurso from './FormularioCurso'

export const dynamic = 'force-dynamic'

export default async function NuevoCurso() {
  await requerirRol('ADMIN', 'OPERACIONES')

  const [listaClientes, listaTipos, listaLugares, listaProfesores] = await Promise.all([
    db.select().from(clientes).where(eq(clientes.activo, true)).orderBy(asc(clientes.razonSocial)),
    db.select().from(tiposCurso).where(eq(tiposCurso.activo, true)).orderBy(asc(tiposCurso.nombre)),
    db.select().from(lugares).where(eq(lugares.activo, true)).orderBy(asc(lugares.nombre)),
    db.select().from(profesores).where(eq(profesores.activo, true)).orderBy(asc(profesores.nombre)),
  ])

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Nuevo curso</h1>
      <p className="mt-1 text-sm text-slate-500">
        Un curso puede tener varias jornadas: los de 16 horas se parten habitualmente en dos días,
        cada uno con su propio código QR.
      </p>

      <div className="mt-6">
        <FormularioCurso
          clientes={listaClientes.map((c) => ({ id: c.id, nombre: c.razonSocial }))}
          tipos={listaTipos.map((t) => ({
            id: t.id,
            nombre: t.nombre,
            horas: t.horasDefault,
            practico: t.tieneComponentePractico,
          }))}
          lugares={listaLugares.map((l) => ({
            id: l.id,
            nombre: l.nombre,
            clienteId: l.clienteId,
          }))}
          profesores={listaProfesores.map((p) => ({ id: p.id, nombre: p.nombre }))}
        />
      </div>
    </div>
  )
}
