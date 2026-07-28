import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { cursos, profesorMaterias, tiposCurso } from '@/db/schema'
import { requerirRol } from '@/lib/auth'
import ListaTiposCurso from './ListaTiposCurso'

export const dynamic = 'force-dynamic'

export default async function PaginaTiposCurso() {
  await requerirRol('ADMIN', 'OPERACIONES')

  const lista = await db
    .select({
      tipo: tiposCurso,
      totalCursos: sql<number>`(select count(*)::int from ${cursos}
        where ${cursos.tipoCursoId} = ${tiposCurso.id})`,
      totalRelatores: sql<number>`(select count(*)::int from ${profesorMaterias}
        where ${profesorMaterias.tipoCursoId} = ${tiposCurso.id})`,
    })
    .from(tiposCurso)
    .orderBy(asc(tiposCurso.nombre))

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Tipos de curso</h1>
        <p className="mt-1 text-sm text-slate-500">
          El catálogo de lo que dicta Uppercap. Cada curso que se programa parte de uno de estos, y
          el código interno alimenta el código legible del curso.
        </p>
      </div>

      <ListaTiposCurso
        tipos={lista.map((f) => ({
          id: f.tipo.id,
          nombre: f.tipo.nombre,
          codigoInterno: f.tipo.codigoInterno ?? '',
          horasDefault: f.tipo.horasDefault,
          tieneComponentePractico: f.tipo.tieneComponentePractico,
          descripcion: f.tipo.descripcion ?? '',
          codigoSence: f.tipo.codigoSence ?? '',
          activo: f.tipo.activo,
          totalCursos: f.totalCursos,
          totalRelatores: f.totalRelatores,
        }))}
      />
    </div>
  )
}
