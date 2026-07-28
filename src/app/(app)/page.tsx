import Link from 'next/link'
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  asistencias,
  clientes,
  cursos,
  expedientes,
  participantes,
  profesores,
  sesiones,
  tiposCurso,
} from '@/db/schema'
import { sesionActual } from '@/lib/auth'
import { hoyEnChile } from '@/lib/fechas'
import { Estado, Tarjeta, TituloSeccion, Vacio, formatearFecha } from '@/components/ui'

export const dynamic = 'force-dynamic'

const FLUJO = [
  'PROGRAMADO',
  'EN_CURSO',
  'CERRADO',
  'EXPEDIENTE_VALIDADO',
  'ENVIADO_AL_CLIENTE',
] as const

export default async function Tablero() {
  const usuario = (await sesionActual())!
  const esProfesor = usuario.rol === 'PROFESOR'

  const filtroProfesor = esProfesor && usuario.profesorId ? usuario.profesorId : null

  // Conteo por estado del ciclo completo
  const porEstado = await db
    .select({ estado: cursos.estado, total: count() })
    .from(cursos)
    .groupBy(cursos.estado)

  const mapaEstados = new Map(porEstado.map((f) => [f.estado, f.total]))

  // Sesiones próximas y en curso
  const filas = await db
    .select({
      sesion: sesiones,
      curso: cursos,
      cliente: clientes,
      tipoCurso: tiposCurso,
      profesor: profesores,
      registrados: sql<number>`(
        select count(*)::int from ${asistencias}
        where ${asistencias.sesionId} = ${sesiones.id}
      )`,
    })
    .from(sesiones)
    .innerJoin(cursos, eq(sesiones.cursoId, cursos.id))
    .innerJoin(clientes, eq(cursos.clienteId, clientes.id))
    .innerJoin(tiposCurso, eq(cursos.tipoCursoId, tiposCurso.id))
    .leftJoin(profesores, eq(sesiones.profesorId, profesores.id))
    .where(
      filtroProfesor
        ? and(eq(sesiones.profesorId, filtroProfesor), inArray(cursos.estado, [...FLUJO]))
        : inArray(cursos.estado, [...FLUJO]),
    )
    .orderBy(desc(sesiones.fecha))
    .limit(25)

  const hoyISO = hoyEnChile()
  const deHoy = filas.filter((f) => f.sesion.fecha === hoyISO)
  const resto = filas.filter((f) => f.sesion.fecha !== hoyISO)

  // Expedientes pendientes de envío
  const pendientes = await db
    .select({ total: count() })
    .from(expedientes)
    .where(sql`${expedientes.enviadoEn} is null`)

  // Métrica principal: días entre cierre de sesión y envío del expediente.
  const [{ promedio }] = await db
    .select({
      promedio: sql<number | null>`avg(
        extract(epoch from (${expedientes.enviadoEn} - ${sesiones.cerradaEn})) / 86400.0
      )`,
    })
    .from(expedientes)
    .innerJoin(sesiones, eq(expedientes.sesionId, sesiones.id))
    .where(sql`${expedientes.enviadoEn} is not null and ${sesiones.cerradaEn} is not null`)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tablero</h1>
        <p className="mt-1 text-sm text-slate-500">
          {esProfesor
            ? 'Sus sesiones asignadas.'
            : 'Estado del ciclo desde la programación hasta el envío al cliente.'}
        </p>
      </div>

      {!esProfesor && (
        <section>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {FLUJO.map((estado) => (
              <div
                key={estado}
                className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
              >
                <p className="text-3xl font-bold tabular-nums text-slate-900">
                  {mapaEstados.get(estado) ?? 0}
                </p>
                <div className="mt-2">
                  <Estado valor={estado} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Tarjeta>
              <p className="text-sm font-medium text-slate-500">
                Días promedio entre cierre y envío
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                {/* El promedio puede salir levemente negativo: si una sesión se
                    reabre y se vuelve a cerrar después de haber enviado el
                    expediente, `cerrada_en` queda posterior a `enviado_en`.
                    Medido en días sigue siendo 0 —se envió el mismo día—, así
                    que se muestra 0,0 en vez de un desconcertante «-0.0». */}
                {promedio === null || promedio === undefined
                  ? '—'
                  : Math.max(0, Number(promedio)).toFixed(1)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Métrica de éxito del proyecto. Objetivo: 0 días (mismo día del curso).
              </p>
            </Tarjeta>
            <Tarjeta>
              <p className="text-sm font-medium text-slate-500">Expedientes por enviar</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                {pendientes[0]?.total ?? 0}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Generados y aún no enviados al representante del cliente.
              </p>
            </Tarjeta>
          </div>
        </section>
      )}

      {deHoy.length > 0 && (
        <section>
          <TituloSeccion>Hoy en sala</TituloSeccion>
          <div className="grid gap-3 md:grid-cols-2">
            {deHoy.map((f) => (
              <FilaSesion key={f.sesion.id} f={f} destacada />
            ))}
          </div>
        </section>
      )}

      <section>
        <TituloSeccion>Sesiones recientes y programadas</TituloSeccion>
        {resto.length === 0 ? (
          <Vacio>
            {filas.length > 0 ? (
              <>
                Todo lo que hay está hoy en sala, arriba. Acá aparecerán las jornadas de otros
                días.{' '}
                <Link href="/cursos/nuevo" className="font-semibold text-marca-600 underline">
                  Programar otro curso
                </Link>
                .
              </>
            ) : (
              <>
                No hay sesiones registradas todavía.{' '}
                <Link href="/cursos/nuevo" className="font-semibold text-marca-600 underline">
                  Cree el primer curso
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
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Curso</th>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Relator</th>
                  <th className="px-4 py-3 text-right font-semibold">Registrados</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resto.map((f) => (
                  <tr key={f.sesion.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">
                      {formatearFecha(f.sesion.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/sesiones/${f.sesion.id}`}
                        className="font-semibold text-marca-700 hover:underline"
                      >
                        {f.curso.nombreActividad}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{f.cliente.razonSocial}</td>
                    <td className="px-4 py-3 text-slate-600">{f.profesor?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {f.registrados}
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
      </section>
    </div>
  )
}

function FilaSesion({
  f,
  destacada,
}: {
  f: {
    sesion: typeof sesiones.$inferSelect
    curso: typeof cursos.$inferSelect
    cliente: typeof clientes.$inferSelect
    profesor: typeof profesores.$inferSelect | null
    registrados: number
  }
  destacada?: boolean
}) {
  return (
    <Link
      href={`/sesiones/${f.sesion.id}`}
      className={`block rounded-2xl p-5 shadow-sm ring-1 transition hover:shadow ${
        destacada ? 'bg-marca-50 ring-marca-200' : 'bg-white ring-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-slate-900">{f.curso.nombreActividad}</p>
          <p className="mt-0.5 text-sm text-slate-600">{f.cliente.razonSocial}</p>
        </div>
        <Estado valor={f.sesion.estado} />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div className="text-sm text-slate-600">
          <p>
            {f.sesion.horaInicio} – {f.sesion.horaFin}
          </p>
          <p className="text-slate-500">{f.profesor?.nombre ?? 'Sin relator asignado'}</p>
        </div>
        <p className="text-2xl font-bold tabular-nums text-slate-900">
          {f.registrados}
          {f.curso.nominaEsperada > 0 && (
            <span className="text-base font-medium text-slate-400">
              {' '}
              / {f.curso.nominaEsperada}
            </span>
          )}
        </p>
      </div>
    </Link>
  )
}
