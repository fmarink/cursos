import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  asistencias,
  clientes,
  cursos,
  lugares,
  nominaItems,
  plantillasEncuesta,
  plantillasEvaluacion,
  profesores,
  sesiones,
  tiposCurso,
} from '@/db/schema'
import { sesionActual } from '@/lib/auth'
import { formatearRut } from '@/lib/rut'
import { nombreLugar } from '@/lib/sesiones'
import { Estado, Tarjeta, formatearFecha } from '@/components/ui'
import GestionCurso from './GestionCurso'

export const dynamic = 'force-dynamic'

export default async function DetalleCurso({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = (await sesionActual())!

  const [fila] = await db
    .select({ curso: cursos, cliente: clientes, tipoCurso: tiposCurso, lugar: lugares })
    .from(cursos)
    .innerJoin(clientes, eq(cursos.clienteId, clientes.id))
    .innerJoin(tiposCurso, eq(cursos.tipoCursoId, tiposCurso.id))
    .leftJoin(lugares, eq(cursos.lugarId, lugares.id))
    .where(eq(cursos.id, id))
    .limit(1)

  if (!fila) notFound()

  const [jornadas, nomina, listaProfesores, plantillasEval, plantillasEnc] = await Promise.all([
    db
      .select({
        sesion: sesiones,
        profesor: profesores,
        registrados: sql<number>`(select count(*)::int from ${asistencias}
          where ${asistencias.sesionId} = ${sesiones.id})`,
      })
      .from(sesiones)
      .leftJoin(profesores, eq(sesiones.profesorId, profesores.id))
      .where(eq(sesiones.cursoId, id))
      .orderBy(asc(sesiones.fecha), asc(sesiones.horaInicio)),
    db.select().from(nominaItems).where(eq(nominaItems.cursoId, id)),
    db.select().from(profesores).where(eq(profesores.activo, true)).orderBy(asc(profesores.nombre)),
    db.select().from(plantillasEvaluacion).where(eq(plantillasEvaluacion.activa, true)),
    db.select().from(plantillasEncuesta).where(eq(plantillasEncuesta.activa, true)),
  ])

  const esGestion = usuario.rol !== 'PROFESOR'

  return (
    <div className="space-y-6">
      <header>
        <Link href="/cursos" className="text-sm font-medium text-marca-600 hover:underline">
          ← Cursos
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{fila.curso.nombreActividad}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {fila.cliente.razonSocial} · {fila.tipoCurso.nombre} · {fila.curso.horas} horas ·{' '}
              {nombreLugar(fila.curso, fila.lugar)}
            </p>
            <p className="mt-0.5 font-mono text-xs text-slate-400">{fila.curso.codigo}</p>
          </div>
          <Estado valor={fila.curso.estado} />
        </div>
      </header>

      {fila.curso.observaciones && (
        <Tarjeta>
          <p className="text-sm font-semibold text-slate-500">Observaciones</p>
          <p className="mt-1 text-sm text-slate-700">{fila.curso.observaciones}</p>
        </Tarjeta>
      )}

      <GestionCurso
        cursoId={id}
        esGestion={esGestion}
        jornadas={jornadas.map((j) => ({
          id: j.sesion.id,
          fecha: formatearFecha(j.sesion.fecha, true),
          horaInicio: j.sesion.horaInicio,
          horaFin: j.sesion.horaFin,
          estado: j.sesion.estado,
          profesorId: j.sesion.profesorId ?? '',
          profesorNombre: j.profesor?.nombre ?? null,
          registrados: j.registrados,
          plantillaEvaluacionId: j.sesion.plantillaEvaluacionId ?? '',
          plantillaEncuestaId: j.sesion.plantillaEncuestaId ?? '',
        }))}
        nominaEsperada={fila.curso.nominaEsperada}
        nomina={nomina.map((n) => ({
          id: n.id,
          nombre: n.nombre,
          rut: n.rut ? formatearRut(n.rut) : null,
          empresa: n.empresa,
          cargo: n.cargo,
        }))}
        profesores={listaProfesores.map((p) => ({ id: p.id, nombre: p.nombre }))}
        plantillasEval={plantillasEval.map((p) => ({ id: p.id, nombre: p.nombre }))}
        plantillasEnc={plantillasEnc.map((p) => ({ id: p.id, nombre: p.nombre }))}
      />
    </div>
  )
}
