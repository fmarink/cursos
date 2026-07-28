import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { profesorMaterias, profesores, tiposCurso } from '@/db/schema'
import { requerirRol } from '@/lib/auth'
import { formatearRut } from '@/lib/rut'
import ListaProfesores from './ListaProfesores'

export const dynamic = 'force-dynamic'

export default async function PaginaProfesores() {
  await requerirRol('ADMIN', 'OPERACIONES')

  const [lista, materias, tipos] = await Promise.all([
    db.select().from(profesores).orderBy(asc(profesores.nombre)),
    db
      .select({
        profesorId: profesorMaterias.profesorId,
        tipoCursoId: profesorMaterias.tipoCursoId,
        nombre: tiposCurso.nombre,
      })
      .from(profesorMaterias)
      .innerJoin(tiposCurso, eq(profesorMaterias.tipoCursoId, tiposCurso.id)),
    db.select().from(tiposCurso).where(eq(tiposCurso.activo, true)).orderBy(asc(tiposCurso.nombre)),
  ])

  const porProfesor = new Map<string, { id: string; nombre: string }[]>()
  for (const m of materias) {
    const actual = porProfesor.get(m.profesorId) ?? []
    actual.push({ id: m.tipoCursoId, nombre: m.nombre })
    porProfesor.set(m.profesorId, actual)
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Profesores y relatores</h1>
        <p className="mt-1 text-sm text-slate-500">
          Base migrada desde el Excel actual. Filtre por materia al asignar un curso.
        </p>
      </div>

      <ListaProfesores
        profesores={lista.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          rut: p.rut ? formatearRut(p.rut) : '',
          telefono: p.telefono ?? '',
          email: p.email ?? '',
          direccion: p.direccion ?? '',
          comuna: p.comuna ?? '',
          activo: p.activo,
          materias: porProfesor.get(p.id) ?? [],
        }))}
        tipos={tipos.map((t) => ({ id: t.id, nombre: t.nombre }))}
      />
    </div>
  )
}
