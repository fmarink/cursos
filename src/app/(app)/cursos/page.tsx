import Link from 'next/link'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { clientes, cursos, participantes, sesiones, tiposCurso } from '@/db/schema'
import { sesionActual } from '@/lib/auth'
import { BotonPrimario, Estado, TituloSeccion, Vacio, formatearFecha } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function PaginaCursos() {
  const usuario = (await sesionActual())!
  const esGestion = usuario.rol !== 'PROFESOR'

  const filas = await db
    .select({
      curso: cursos,
      cliente: clientes,
      tipoCurso: tiposCurso,
      jornadas: sql<number>`(select count(*)::int from ${sesiones} where ${sesiones.cursoId} = ${cursos.id})`,
      inscritos: sql<number>`(select count(*)::int from ${participantes}
        where ${participantes.cursoId} = ${cursos.id} and ${participantes.anulado} = false)`,
    })
    .from(cursos)
    .innerJoin(clientes, eq(cursos.clienteId, clientes.id))
    .innerJoin(tiposCurso, eq(cursos.tipoCursoId, tiposCurso.id))
    .orderBy(desc(cursos.fechaInicio))

  return (
    <div>
      <TituloSeccion
        accion={esGestion ? <BotonPrimario href="/cursos/nuevo">Nuevo curso</BotonPrimario> : undefined}
      >
        Cursos
      </TituloSeccion>

      {filas.length === 0 ? (
        <Vacio>
          No hay cursos registrados.
          {esGestion && (
            <>
              {' '}
              <Link href="/cursos/nuevo" className="font-semibold text-marca-600 underline">
                Cree el primero
              </Link>
              .
            </>
          )}
        </Vacio>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Actividad</th>
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Fechas</th>
                <th className="px-4 py-3 text-right font-semibold">Jornadas</th>
                <th className="px-4 py-3 text-right font-semibold">Inscritos</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f) => (
                <tr key={f.curso.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">
                    {f.curso.codigo}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/cursos/${f.curso.id}`}
                      className="font-semibold text-marca-700 hover:underline"
                    >
                      {f.curso.nombreActividad}
                    </Link>
                    <span className="block text-xs text-slate-400">{f.tipoCurso.nombre}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{f.cliente.razonSocial}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">
                    {formatearFecha(f.curso.fechaInicio)}
                    {f.curso.fechaTermino !== f.curso.fechaInicio &&
                      ` – ${formatearFecha(f.curso.fechaTermino)}`}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{f.jornadas}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                    {f.inscritos}
                    {f.curso.nominaEsperada > 0 && (
                      <span className="text-slate-400"> / {f.curso.nominaEsperada}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Estado valor={f.curso.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
