import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  clientes,
  plantillasEncuesta,
  plantillasEvaluacion,
  preguntas,
  preguntasEncuesta,
  tiposCurso,
} from '@/db/schema'
import { requerirRol } from '@/lib/auth'
import { formatearNota } from '@/lib/notas'
import { Tarjeta, TituloSeccion, Vacio } from '@/components/ui'

export const dynamic = 'force-dynamic'

const ETIQUETA_TIPO_PREGUNTA: Record<string, string> = {
  SELECCION_MULTIPLE: 'Selección múltiple',
  VERDADERO_FALSO: 'Verdadero / Falso',
  RESPUESTA_BREVE: 'Respuesta breve',
}

export default async function PaginaPlantillas() {
  await requerirRol('ADMIN', 'OPERACIONES')

  const evaluaciones = await db
    .select({
      plantilla: plantillasEvaluacion,
      tipoCurso: tiposCurso,
      cliente: clientes,
      total: sql<number>`(select count(*)::int from ${preguntas}
        where ${preguntas.plantillaId} = ${plantillasEvaluacion.id})`,
    })
    .from(plantillasEvaluacion)
    .leftJoin(tiposCurso, eq(plantillasEvaluacion.tipoCursoId, tiposCurso.id))
    .leftJoin(clientes, eq(plantillasEvaluacion.clienteId, clientes.id))
    .orderBy(asc(plantillasEvaluacion.nombre))

  const encuestas = await db
    .select({
      plantilla: plantillasEncuesta,
      total: sql<number>`(select count(*)::int from ${preguntasEncuesta}
        where ${preguntasEncuesta.plantillaId} = ${plantillasEncuesta.id})`,
    })
    .from(plantillasEncuesta)
    .orderBy(asc(plantillasEncuesta.nombre))

  const detalles = await db
    .select()
    .from(preguntas)
    .orderBy(asc(preguntas.plantillaId), asc(preguntas.orden))

  const porPlantilla = new Map<string, typeof detalles>()
  for (const p of detalles) {
    const actual = porPlantilla.get(p.plantillaId) ?? []
    actual.push(p)
    porPlantilla.set(p.plantillaId, actual)
  }

  const preguntasEnc = await db
    .select()
    .from(preguntasEncuesta)
    .orderBy(asc(preguntasEncuesta.plantillaId), asc(preguntasEncuesta.orden))

  return (
    <div className="space-y-8">
      <section>
        <TituloSeccion>Plantillas de evaluación</TituloSeccion>
        <p className="-mt-2 mb-4 text-sm text-slate-500">
          La evaluación se asigna automáticamente por tipo de curso y cliente, o se fija a mano en
          cada jornada desde la ficha del curso.
        </p>

        {evaluaciones.length === 0 ? (
          <Vacio>No hay plantillas de evaluación cargadas.</Vacio>
        ) : (
          <div className="space-y-4">
            {evaluaciones.map((e) => (
              <Tarjeta key={e.plantilla.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">{e.plantilla.nombre}</h3>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {e.total} preguntas · nota mínima{' '}
                      {formatearNota(e.plantilla.umbralAprobacion)} · exigencia{' '}
                      {e.plantilla.exigencia}%
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Aplica a: {e.tipoCurso?.nombre ?? 'todos los tipos de curso'}
                      {e.cliente && ` · ${e.cliente.razonSocial}`}
                    </p>
                  </div>
                  {!e.plantilla.activa && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                      Inactiva
                    </span>
                  )}
                </div>

                <details className="mt-3 border-t border-slate-100 pt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-600">
                    Ver preguntas
                  </summary>
                  <ol className="mt-3 space-y-3">
                    {(porPlantilla.get(e.plantilla.id) ?? []).map((p) => (
                      <li key={p.id} className="text-sm">
                        <p className="font-medium text-slate-800">
                          {p.orden}. {p.enunciado}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {ETIQUETA_TIPO_PREGUNTA[p.tipo]} · {p.puntaje} punto
                          {p.puntaje === 1 ? '' : 's'}
                        </p>
                        {Array.isArray(p.opciones) && p.opciones.length > 0 && (
                          <ul className="mt-1 space-y-0.5 pl-4">
                            {(p.opciones as string[]).map((op, i) => (
                              <li
                                key={i}
                                className={
                                  String(i) === p.respuestaCorrecta
                                    ? 'font-semibold text-emerald-700'
                                    : 'text-slate-600'
                                }
                              >
                                {String.fromCharCode(97 + i)}) {op}
                                {String(i) === p.respuestaCorrecta && ' ✓'}
                              </li>
                            ))}
                          </ul>
                        )}
                        {p.tipo === 'VERDADERO_FALSO' && (
                          <p className="mt-0.5 pl-4 text-xs font-semibold text-emerald-700">
                            Respuesta correcta:{' '}
                            {p.respuestaCorrecta === 'true' ? 'Verdadero' : 'Falso'}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              </Tarjeta>
            ))}
          </div>
        )}
      </section>

      <section>
        <TituloSeccion>Plantillas de encuesta</TituloSeccion>
        {encuestas.length === 0 ? (
          <Vacio>No hay plantillas de encuesta cargadas.</Vacio>
        ) : (
          <div className="space-y-4">
            {encuestas.map((e) => (
              <Tarjeta key={e.plantilla.id}>
                <h3 className="font-bold text-slate-900">{e.plantilla.nombre}</h3>
                <p className="mt-0.5 text-sm text-slate-600">
                  {e.total} preguntas · escala {e.plantilla.escalaMin} a {e.plantilla.escalaMax} ·{' '}
                  {e.plantilla.anonima ? 'anónima' : 'identificada'}
                </p>
                <ol className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
                  {preguntasEnc
                    .filter((p) => p.plantillaId === e.plantilla.id)
                    .map((p) => (
                      <li key={p.id} className="text-slate-700">
                        {p.orden}. {p.enunciado}
                        <span className="ml-2 text-xs text-slate-400">
                          {p.tipo === 'ESCALA'
                            ? 'escala'
                            : p.tipo === 'SI_NO'
                              ? 'sí/no'
                              : 'texto libre'}
                        </span>
                      </li>
                    ))}
                </ol>
              </Tarjeta>
            ))}
          </div>
        )}
      </section>

      <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
        La edición de plantillas desde la interfaz está prevista para la Fase 3. Por ahora se
        cargan con los datos de prueba (<code className="font-mono text-xs">npm run db:seed</code>)
        o directamente en la base de datos.
      </p>
    </div>
  )
}
