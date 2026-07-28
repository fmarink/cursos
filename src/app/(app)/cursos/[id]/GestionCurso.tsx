'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Estado } from '@/components/ui'
import { asignarPlantillas, asignarProfesor, cargarNomina } from '../acciones'

type Jornada = {
  id: string
  fecha: string
  horaInicio: string
  horaFin: string
  estado: string
  profesorId: string
  profesorNombre: string | null
  registrados: number
  plantillaEvaluacionId: string
  plantillaEncuestaId: string
}

export default function GestionCurso({
  cursoId,
  esGestion,
  jornadas,
  nomina,
  nominaEsperada,
  profesores,
  plantillasEval,
  plantillasEnc,
}: {
  cursoId: string
  esGestion: boolean
  jornadas: Jornada[]
  nomina: { id: string; nombre: string; rut: string | null; empresa: string | null; cargo: string | null }[]
  nominaEsperada: number
  profesores: { id: string; nombre: string }[]
  plantillasEval: { id: string; nombre: string }[]
  plantillasEnc: { id: string; nombre: string }[]
}) {
  const [texto, setTexto] = useState('')
  const [editandoNomina, setEditandoNomina] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  return (
    <div className="space-y-6">
      {mensaje && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {mensaje}
        </div>
      )}

      {/* --- Jornadas --- */}
      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 className="font-bold text-slate-900">Jornadas</h2>
          <p className="text-sm text-slate-500">
            Cada jornada tiene sus propios códigos QR de asistencia, evaluación y encuesta.
          </p>
        </div>
        <ul className="divide-y divide-slate-100">
          {jornadas.map((j) => (
            <li key={j.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900 first-letter:uppercase">{j.fecha}</p>
                    <Estado valor={j.estado} />
                  </div>
                  <p className="mt-0.5 text-sm tabular-nums text-slate-600">
                    {j.horaInicio} – {j.horaFin}
                    <span className="text-slate-400">
                      {' '}
                      · {j.registrados} registrado{j.registrados === 1 ? '' : 's'}
                    </span>
                  </p>
                </div>
                <Link
                  href={`/sesiones/${j.id}`}
                  className="shrink-0 rounded-xl bg-marca-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-marca-700"
                >
                  Abrir panel de sala
                </Link>
              </div>

              {esGestion && (
                <div className="mt-3 grid gap-3 border-t border-slate-50 pt-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">Relator</span>
                    <select
                      defaultValue={j.profesorId}
                      onChange={(e) =>
                        iniciar(async () => {
                          await asignarProfesor(j.id, e.target.value, cursoId)
                          setMensaje('Relator actualizado.')
                        })
                      }
                      className={ESTILO_SELECT}
                    >
                      <option value="">Sin asignar</option>
                      {profesores.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">
                      Evaluación
                    </span>
                    <select
                      defaultValue={j.plantillaEvaluacionId}
                      onChange={(e) =>
                        iniciar(async () => {
                          await asignarPlantillas(
                            j.id,
                            cursoId,
                            e.target.value,
                            j.plantillaEncuestaId,
                          )
                          setMensaje('Evaluación asignada.')
                        })
                      }
                      className={ESTILO_SELECT}
                    >
                      <option value="">Automática según tipo de curso</option>
                      {plantillasEval.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">Encuesta</span>
                    <select
                      defaultValue={j.plantillaEncuestaId}
                      onChange={(e) =>
                        iniciar(async () => {
                          await asignarPlantillas(
                            j.id,
                            cursoId,
                            j.plantillaEvaluacionId,
                            e.target.value,
                          )
                          setMensaje('Encuesta asignada.')
                        })
                      }
                      className={ESTILO_SELECT}
                    >
                      <option value="">Automática</option>
                      {plantillasEnc.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* --- Nómina --- */}
      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
          <div>
            <h2 className="font-bold text-slate-900">
              Nómina del cliente{' '}
              <span className="ml-1 text-sm font-normal text-slate-500">
                {nomina.length > 0 ? `${nomina.length} personas` : 'no cargada'}
              </span>
            </h2>
            <p className="text-sm text-slate-500">
              Referencia para conciliar. No bloquea el registro de nadie.
            </p>
          </div>
          {esGestion && (
            <button
              onClick={() => setEditandoNomina(!editandoNomina)}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {editandoNomina ? 'Cancelar' : nomina.length > 0 ? 'Reemplazar' : 'Cargar'}
            </button>
          )}
        </div>

        {editandoNomina && (
          <div className="border-b border-slate-100 bg-slate-50 p-5">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              placeholder={'Nombre\tRUT\tEmpresa\tCargo'}
              className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-marca-500"
            />
            <button
              disabled={pendiente || texto.trim().length === 0}
              onClick={() =>
                iniciar(async () => {
                  const r = await cargarNomina(cursoId, texto)
                  if (r.ok) {
                    setMensaje(`Nómina cargada: ${r.filas} personas.`)
                    setEditandoNomina(false)
                    setTexto('')
                  } else {
                    setMensaje(r.error)
                  }
                })
              }
              className="mt-3 rounded-lg bg-marca-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
            >
              Guardar nómina
            </button>
          </div>
        )}

        {nomina.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            Sin nómina cargada.
            {nominaEsperada > 0 && ` Se esperan ${nominaEsperada} participantes.`}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Nombre</th>
                <th className="px-5 py-2.5 font-semibold">RUT</th>
                <th className="px-5 py-2.5 font-semibold">Empresa</th>
                <th className="px-5 py-2.5 font-semibold">Cargo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {nomina.map((n) => (
                <tr key={n.id}>
                  <td className="px-5 py-2.5 font-medium text-slate-800">{n.nombre}</td>
                  <td className="px-5 py-2.5 tabular-nums text-slate-600">{n.rut ?? '—'}</td>
                  <td className="px-5 py-2.5 text-slate-600">{n.empresa ?? '—'}</td>
                  <td className="px-5 py-2.5 text-slate-600">{n.cargo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

const ESTILO_SELECT =
  'w-full rounded-lg border-2 border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-marca-500'
