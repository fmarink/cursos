'use client'

import { useState, useTransition } from 'react'
import { Estado } from '@/components/ui'
import { formatearRut } from '@/lib/rut'
import { enviarExpediente, validarExpediente } from './acciones'

type Props = {
  sesionId: string
  problemas: string[]
  resumen: {
    participantes: number
    conFirma: number
    sinFirma: number
    alertas: number
    evaluados: number
    aprobados: number
    encuestas: number
    contenidos: number
    tieneFoto: boolean
  }
  alertas: { participanteId: string; nombre: string; rut: string; estado: string; nota: string | null }[]
  sinFirma: { id: string; nombre: string; rut: string }[]
  expediente: {
    version: number
    generadoEn: string
    generadoPor: string | null
    validadoEn: string | null
    validadoPor: string | null
    enviadoA: string | null
    enviadoEn: string | null
    enviadoPor: string | null
    kb: number
  } | null
  historial: { version: number; generadoEn: string; enviadoEn: string | null }[]
  sugerencia: { para: string; asunto: string }
  puedeEnviar: boolean
  auditoria: { id: string; accion: string; timestamp: string }[]
}

export default function RevisionExpediente(props: Props) {
  const [generando, setGenerando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [para, setPara] = useState(props.sugerencia.para)
  const [cc, setCc] = useState('')
  const [asunto, setAsunto] = useState(props.sugerencia.asunto)
  const [pendiente, iniciar] = useTransition()

  const enviado = Boolean(props.expediente?.enviadoEn)

  async function generar(regenerar: boolean) {
    setGenerando(true)
    setError(null)
    setMensaje(null)
    try {
      const r = await fetch(
        `/api/sesiones/${props.sesionId}/expediente/pdf${regenerar ? '?regenerar=1' : ''}`,
      )
      if (!r.ok) {
        const cuerpo = await r.json().catch(() => ({ error: 'Error desconocido' }))
        setError(cuerpo.error ?? 'No se pudo generar el PDF.')
        return
      }
      const blob = await r.blob()
      window.open(URL.createObjectURL(blob), '_blank')
      setMensaje(regenerar ? 'Se generó una nueva versión del expediente.' : null)
      // Refresca el estado del servidor sin perder la pestaña abierta.
      setTimeout(() => window.location.reload(), 600)
    } catch {
      setError('No se pudo contactar al servidor.')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {error}
        </div>
      )}
      {mensaje && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {mensaje}
        </div>
      )}

      {/* --- Contenido del expediente --- */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-bold text-slate-900">Contenido del expediente</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dato valor={props.resumen.participantes} etiqueta="Participantes" />
          <Dato valor={props.resumen.conFirma} etiqueta="Con firma" />
          <Dato valor={props.resumen.contenidos} etiqueta="Bloques de contenido" />
          <Dato valor={props.resumen.evaluados} etiqueta="Evaluados" />
          <Dato valor={props.resumen.aprobados} etiqueta="Aprobados" />
          <Dato valor={props.resumen.encuestas} etiqueta="Encuestas" />
          <Dato
            valor={props.resumen.alertas}
            etiqueta="Alertas"
            alerta={props.resumen.alertas > 0}
          />
          <Dato valor={props.resumen.tieneFoto ? 'Sí' : 'No'} etiqueta="Foto grupal" />
        </dl>
      </section>

      {/* --- Alertas por resolver --- */}
      {(props.alertas.length > 0 || props.problemas.length > 0) && (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-900">Revisar antes de enviar</h2>

          {props.problemas.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm text-amber-900">
              {props.problemas.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}

          {props.alertas.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl bg-white ring-1 ring-amber-200">
              <table className="w-full text-sm">
                <thead className="bg-amber-100/60 text-left text-xs uppercase text-amber-800">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Participante</th>
                    <th className="px-4 py-2 font-semibold">RUT</th>
                    <th className="px-4 py-2 font-semibold">Observación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {props.alertas.map((a) => (
                    <tr key={a.participanteId}>
                      <td className="px-4 py-2 font-medium text-slate-800">{a.nombre}</td>
                      <td className="px-4 py-2 tabular-nums text-slate-600">
                        {formatearRut(a.rut)}
                      </td>
                      <td className="px-4 py-2">
                        <Estado valor={a.estado} />
                        {a.nota && <span className="ml-2 text-xs text-slate-500">{a.nota}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-sm text-amber-800">
            Las alertas se resuelven en el panel de la sesión: corrija los datos, acepte el registro
            o anúlelo. Después regenere el expediente.
          </p>
        </section>
      )}

      {/* --- Documento --- */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-bold text-slate-900">Documento</h2>
            {props.expediente ? (
              <p className="mt-1 text-sm text-slate-600">
                Versión {props.expediente.version} · {props.expediente.kb} KB · generado el{' '}
                {props.expediente.generadoEn}
                {props.expediente.generadoPor && ` por ${props.expediente.generadoPor}`}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                Todavía no se ha generado el PDF de esta jornada.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={`/expediente/${props.sesionId}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Previsualizar
            </a>
            <a
              href={`/api/sesiones/${props.sesionId}/expediente/excel`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Descargar Excel
            </a>
            <button
              disabled={generando}
              onClick={() => generar(Boolean(props.expediente))}
              className="rounded-xl bg-marca-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-marca-700 disabled:bg-slate-300"
            >
              {generando
                ? 'Generando…'
                : props.expediente
                  ? 'Regenerar PDF'
                  : 'Generar PDF'}
            </button>
            {props.expediente && (
              <a
                href={`/api/sesiones/${props.sesionId}/expediente/pdf?descargar=1`}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Descargar PDF
              </a>
            )}
          </div>
        </div>

        {props.historial.length > 0 && (
          <details className="mt-4 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-600">
              Versiones anteriores ({props.historial.length})
            </summary>
            <ul className="mt-2 space-y-1 text-sm text-slate-500">
              {props.historial.map((v) => (
                <li key={v.version}>
                  Versión {v.version} — generada el {v.generadoEn}
                  {v.enviadoEn && ` · enviada el ${v.enviadoEn}`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* --- Validación y envío --- */}
      {props.puedeEnviar && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="font-bold text-slate-900">Validación y envío al cliente</h2>

          {props.expediente?.validadoEn ? (
            <p className="mt-1 text-sm text-emerald-700">
              Validado el {props.expediente.validadoEn} por {props.expediente.validadoPor}.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                disabled={!props.expediente || pendiente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await validarExpediente(props.sesionId)
                    if (!r.ok) setError(r.error)
                    else window.location.reload()
                  })
                }
                className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:bg-slate-300"
              >
                Marcar como validado
              </button>
              <p className="text-sm text-slate-500">
                Confirma que revisó el expediente y que está conforme para enviarlo.
              </p>
            </div>
          )}

          {enviado ? (
            <div className="mt-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
              <p className="font-semibold text-emerald-900">Enviado al cliente</p>
              <p className="mt-1 text-sm text-emerald-800">
                {props.expediente!.enviadoEn} · a {props.expediente!.enviadoA}
                {props.expediente!.enviadoPor && ` · por ${props.expediente!.enviadoPor}`}
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">
                    Para (representante del cliente)
                  </label>
                  <input
                    value={para}
                    onChange={(e) => setPara(e.target.value)}
                    placeholder="nombre@cliente.cl"
                    className="w-full rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">
                    Con copia (opcional)
                  </label>
                  <input
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="operaciones@uppercap.cl"
                    className="w-full rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Asunto</label>
                <input
                  value={asunto}
                  onChange={(e) => setAsunto(e.target.value)}
                  className="w-full rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500"
                />
              </div>
              <button
                disabled={!props.expediente || para.trim() === '' || pendiente}
                onClick={() =>
                  iniciar(async () => {
                    setError(null)
                    const r = await enviarExpediente(props.sesionId, { para, cc, asunto })
                    if (!r.ok) setError(r.error)
                    else {
                      setMensaje(r.mensaje ?? 'Expediente enviado.')
                      setTimeout(() => window.location.reload(), 1200)
                    }
                  })
                }
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-slate-300"
              >
                {pendiente ? 'Enviando…' : 'Enviar expediente al cliente'}
              </button>
              {!props.expediente && (
                <p className="text-sm text-slate-500">Genere primero el PDF.</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* --- Auditoría --- */}
      {props.auditoria.length > 0 && (
        <details className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <summary className="cursor-pointer font-bold text-slate-900">
            Registro de auditoría
          </summary>
          <ul className="mt-3 space-y-1.5 text-sm">
            {props.auditoria.map((a) => (
              <li key={a.id} className="flex justify-between gap-4 border-b border-slate-50 pb-1.5">
                <span className="text-slate-700">{a.accion.replace(/_/g, ' ')}</span>
                <span className="shrink-0 tabular-nums text-slate-400">{a.timestamp}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Dato({
  valor,
  etiqueta,
  alerta,
}: {
  valor: number | string
  etiqueta: string
  alerta?: boolean
}) {
  return (
    <div>
      <dd
        className={`text-2xl font-bold tabular-nums ${alerta ? 'text-amber-600' : 'text-slate-900'}`}
      >
        {valor}
      </dd>
      <dt className="text-sm text-slate-500">{etiqueta}</dt>
    </div>
  )
}
