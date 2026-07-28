'use client'

import { useMemo, useState, useTransition } from 'react'
import { formatearRut } from '@/lib/rut'
import { registrarDesdeNomina, vincularConNomina } from './acciones'

export type FilaVista = {
  nominaItemId: string | null
  participanteId: string | null
  nombreNomina: string | null
  rutNomina: string | null
  nombreRegistrado: string | null
  rutRegistrado: string | null
  empresa: string | null
  cargo: string | null
  hora: string | null
  tieneFirma: boolean
  origen: string | null
  vinculadoPor: string | null
  situacion: 'conciliado' | 'falta' | 'sin_conciliar'
}

type Props = {
  sesionId: string
  filas: FilaVista[]
  /** Alumnos de la nómina todavía sin vincular, para el desplegable. */
  libres: { id: string; nombre: string }[]
  bloqueada: boolean
}

/**
 * Conciliación entre la nómina que envió el cliente y lo que efectivamente
 * ocurrió en sala.
 *
 * Responde a la pregunta que hace operaciones al recibir el expediente:
 * ¿quién de los que debían venir vino, quién no, y estos registros extra a
 * quién corresponden? Cuando la persona eligió su nombre de la lista al
 * escanear el QR, la fila ya viene conciliada y aquí no hay nada que hacer.
 */
export default function Conciliacion({ sesionId, filas, libres, bloqueada }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  const { conciliados, faltantes, sinConciliar } = useMemo(
    () => ({
      conciliados: filas.filter((f) => f.situacion === 'conciliado'),
      faltantes: filas.filter((f) => f.situacion === 'falta'),
      sinConciliar: filas.filter((f) => f.situacion === 'sin_conciliar'),
    }),
    [filas],
  )

  const hayNomina = filas.some((f) => f.nominaItemId !== null)

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    iniciar(async () => {
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'No se pudo completar la acción.')
    })
  }

  if (!hayNomina && sinConciliar.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
        <p className="font-medium text-slate-600">Este curso no tiene nómina cargada</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Cargue la lista que envió el cliente desde la ficha del curso. Con la nómina cargada, los
          participantes eligen su nombre al escanear el QR y no tienen que escribir su RUT.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Resumen valor={conciliados.length} etiqueta="Conciliados" tono="verde" />
        <Resumen valor={faltantes.length} etiqueta="Faltan por venir" tono="ambar" />
        <Resumen valor={sinConciliar.length} etiqueta="Sin conciliar" tono="rojo" />
      </div>

      {/* --- Registros que no calzaron con la lista --- */}
      {sinConciliar.length > 0 && (
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-100 bg-red-50 px-5 py-3.5">
            <h3 className="font-bold text-red-900">Registros sin conciliar</h3>
            <p className="text-sm text-red-800">
              Se registraron pero no corresponden a ningún alumno de la lista. Indique a quién
              corresponde cada uno, o déjelo así si efectivamente es alguien que no estaba
              convocado.
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {sinConciliar.map((f) => (
              <li key={f.participanteId} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{f.nombreRegistrado}</p>
                    <p className="mt-0.5 text-sm tabular-nums text-slate-600">
                      {f.rutRegistrado ? formatearRut(f.rutRegistrado) : '—'}
                      {f.hora && <span className="text-slate-400"> · {f.hora}</span>}
                      {f.origen && <span className="text-slate-400"> · {etiquetaOrigen(f.origen)}</span>}
                      {!f.tieneFirma && (
                        <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                          sin firma
                        </span>
                      )}
                    </p>
                  </div>

                  {!bloqueada && (
                    <label className="flex shrink-0 items-center gap-2 text-sm">
                      <span className="font-medium text-slate-600">Corresponde a</span>
                      <select
                        defaultValue=""
                        disabled={pendiente || libres.length === 0}
                        onChange={(e) => {
                          const valor = e.target.value
                          if (!valor) return
                          ejecutar(() => vincularConNomina(sesionId, f.participanteId!, valor))
                        }}
                        className="rounded-lg border-2 border-slate-300 bg-white px-3 py-2 outline-none focus:border-marca-500 disabled:bg-slate-50"
                      >
                        <option value="">
                          {libres.length === 0 ? 'No quedan alumnos libres' : 'Seleccione…'}
                        </option>
                        {libres.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Alumnos de la lista que no han firmado --- */}
      {faltantes.length > 0 && (
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-100 bg-amber-50 px-5 py-3.5">
            <h3 className="font-bold text-amber-900">Todavía no se registran</h3>
            <p className="text-sm text-amber-800">
              Están en la lista del cliente pero no han firmado esta jornada.
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {faltantes.map((f) => (
              <li
                key={f.nominaItemId}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="font-medium text-slate-800">{f.nombreNomina}</p>
                  <p className="text-sm tabular-nums text-slate-500">
                    {f.rutNomina ? formatearRut(f.rutNomina) : 'sin RUT en la nómina'}
                    {f.empresa && <span> · {f.empresa}</span>}
                  </p>
                </div>
                {!bloqueada && (
                  <button
                    disabled={pendiente || !f.rutNomina}
                    title={
                      f.rutNomina
                        ? undefined
                        : 'La nómina no trae su RUT. Use el alta manual en la pestaña de asistencia.'
                    }
                    onClick={() =>
                      ejecutar(() => registrarDesdeNomina(sesionId, f.nominaItemId!))
                    }
                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    Registrar sin firma
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Ya conciliados --- */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h3 className="font-bold text-slate-900">Conciliados</h3>
          <p className="text-sm text-slate-500">
            Alumnos de la lista con su registro y firma correspondiente.
          </p>
        </div>
        {conciliados.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Todavía ninguno.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Alumno de la lista</th>
                <th className="px-5 py-2.5 font-semibold">Se registró como</th>
                <th className="px-5 py-2.5 font-semibold">RUT</th>
                <th className="px-5 py-2.5 font-semibold">Hora</th>
                <th className="px-5 py-2.5 font-semibold">Vínculo</th>
                {!bloqueada && <th className="px-5 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {conciliados.map((f) => {
                const distinto =
                  f.nombreNomina &&
                  f.nombreRegistrado &&
                  f.nombreNomina.trim().toLowerCase() !== f.nombreRegistrado.trim().toLowerCase()
                return (
                  <tr key={f.nominaItemId}>
                    <td className="px-5 py-2.5 font-medium text-slate-800">{f.nombreNomina}</td>
                    <td className="px-5 py-2.5 text-slate-600">
                      {distinto ? (
                        <span className="text-amber-700">{f.nombreRegistrado}</span>
                      ) : (
                        <span className="text-slate-400">igual</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 tabular-nums text-slate-600">
                      {f.rutRegistrado ? formatearRut(f.rutRegistrado) : '—'}
                    </td>
                    <td className="px-5 py-2.5 tabular-nums text-slate-600">
                      {f.hora ?? '—'}
                      {!f.tieneFirma && (
                        <span className="ml-2 text-xs font-semibold text-red-600">sin firma</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-xs text-slate-500">
                      {etiquetaVinculo(f.vinculadoPor)}
                    </td>
                    {!bloqueada && (
                      <td className="px-5 py-2.5 text-right">
                        <button
                          disabled={pendiente}
                          onClick={() =>
                            ejecutar(() => vincularConNomina(sesionId, f.participanteId!, null))
                          }
                          className="rounded px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-red-700"
                        >
                          Desvincular
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function Resumen({
  valor,
  etiqueta,
  tono,
}: {
  valor: number
  etiqueta: string
  tono: 'verde' | 'ambar' | 'rojo'
}) {
  const estilos =
    tono === 'verde'
      ? 'bg-emerald-50 ring-emerald-200 text-emerald-900'
      : tono === 'ambar'
        ? valor > 0
          ? 'bg-amber-50 ring-amber-200 text-amber-900'
          : 'bg-white ring-slate-200 text-slate-900'
        : valor > 0
          ? 'bg-red-50 ring-red-200 text-red-900'
          : 'bg-white ring-slate-200 text-slate-900'

  return (
    <div className={`rounded-2xl p-4 shadow-sm ring-1 ${estilos}`}>
      <p className="text-3xl font-bold tabular-nums">{valor}</p>
      <p className="mt-0.5 text-sm font-medium opacity-80">{etiqueta}</p>
    </div>
  )
}

function etiquetaOrigen(origen: string) {
  const mapa: Record<string, string> = {
    QR: 'por QR',
    TABLET: 'en tablet',
    MANUAL: 'alta manual',
    PAPEL: 'desde papel',
    IMPORTADO: 'importado',
  }
  return mapa[origen] ?? origen.toLowerCase()
}

function etiquetaVinculo(por: string | null) {
  if (!por) return '—'
  if (por === 'participante') return 'eligió su nombre'
  if (por === 'automatico') return 'automático'
  return `a mano · ${por}`
}
