'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import CampoRut from '@/components/CampoRut'
import { Estado, ETIQUETA_ESTADO } from '@/components/ui'
import { formatearRut } from '@/lib/rut'
import { NIVELES_ESCOLARIDAD } from '@/lib/constantes'
import type { RegistroSesion } from '@/lib/registros'
import {
  abrirSesion,
  agregarManual,
  alternarFlujo,
  alternarPresencia,
  cerrarSesionCurso,
  corregirParticipante,
  eliminarAdjunto,
  eliminarBloqueContenido,
  guardarAdjunto,
  guardarBloqueContenido,
  reabrirSesion,
  resolverAlerta,
} from './acciones'

type EstadoVivo = {
  estado: string
  asistenciaAbierta: boolean
  evaluacionAbierta: boolean
  encuestaAbierta: boolean
  resumen: {
    registrados: number
    conFirma: number
    sinFirma: number
    alertas: number
    esperados: number
    faltantes: number
    evaluados: number
    aprobados: number
  }
  registros: RegistroSesion[]
}

type Bloque = {
  id: string
  orden: number
  tema: string
  actividades: string | null
  horaInicio: string
  horaFin: string
  observaciones: string | null
}

type Props = {
  sesionId: string
  cursoId: string
  estadoInicial: EstadoVivo
  qr: { asistencia: string; evaluacion: string; encuesta: string }
  urls: { asistencia: string; evaluacion: string; encuesta: string }
  /** false cuando el panel se abrió desde localhost: el QR no serviría. */
  qrAlcanzable: boolean
  contenidos: Bloque[]
  fotos: { id: string; tipo: string; nombre: string; datos: string }[]
  encuestasRecibidas: number
  expedienteGenerado: boolean
  expedienteEnviado: boolean
  motivoReapertura: string | null
  tienePlantillaEval: boolean
  tienePlantillaEnc: boolean
  esGestion: boolean
}

const PESTANAS = ['asistencia', 'contenidos', 'cierre'] as const
type Pestana = (typeof PESTANAS)[number]

export default function PanelProfesor(props: Props) {
  const [vivo, setVivo] = useState<EstadoVivo>(props.estadoInicial)
  const [pestana, setPestana] = useState<Pestana>('asistencia')
  const [qrVisible, setQrVisible] = useState<'asistencia' | 'evaluacion' | 'encuesta'>('asistencia')
  const [error, setError] = useState<string | null>(null)
  const [_, iniciar] = useTransition()

  const abierta = vivo.estado === 'ABIERTA' || vivo.estado === 'REABIERTA'
  const cerrada = vivo.estado === 'CERRADA'

  // --- Tiempo real por polling corto ---
  const refrescar = useCallback(async () => {
    try {
      const r = await fetch(`/api/sesiones/${props.sesionId}/registros`, { cache: 'no-store' })
      if (r.ok) setVivo(await r.json())
    } catch {
      /* red intermitente: se reintenta en el próximo ciclo */
    }
  }, [props.sesionId])

  useEffect(() => {
    if (!abierta) return
    const t = setInterval(refrescar, 3000)
    return () => clearInterval(t)
  }, [abierta, refrescar])

  // Refresca también al volver a la pestaña, tras bloquear la tablet.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && refrescar()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refrescar])

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    iniciar(async () => {
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'No se pudo completar la acción.')
      await refrescar()
    })
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

      {props.motivoReapertura && vivo.estado === 'REABIERTA' && (
        <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <span className="font-semibold">Sesión reabierta.</span> Motivo:{' '}
          {props.motivoReapertura}
        </div>
      )}

      {/* --- Contadores --- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Contador
          valor={vivo.resumen.registrados}
          de={vivo.resumen.esperados || undefined}
          etiqueta="Registrados"
          destacado
        />
        <Contador valor={vivo.resumen.conFirma} etiqueta="Con firma" />
        <Contador
          valor={vivo.resumen.alertas}
          etiqueta="Por revisar"
          alerta={vivo.resumen.alertas > 0}
        />
        <Contador valor={vivo.resumen.evaluados} etiqueta="Evaluados" />
      </div>

      {/* --- Control de la sesión --- */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">Control de la sesión</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {cerrada
                ? 'La sesión está cerrada. No admite nuevos registros.'
                : abierta
                  ? 'La sesión está abierta. Los participantes ya pueden registrarse.'
                  : 'Abra la sesión para habilitar el registro por QR.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!abierta && !cerrada && (
              <button
                onClick={() => ejecutar(() => abrirSesion(props.sesionId))}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
              >
                Abrir sesión
              </button>
            )}
            {abierta && (
              <>
                <Link
                  href={`/sesiones/${props.sesionId}/kiosco`}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Modo tablet
                </Link>
                <Link
                  href={`/sesiones/${props.sesionId}/qr`}
                  target="_blank"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Proyectar QR
                </Link>
                <BotonCerrar
                  resumen={vivo.resumen}
                  onCerrar={() => ejecutar(() => cerrarSesionCurso(props.sesionId))}
                />
              </>
            )}
            {cerrada && (
              <>
                <Link
                  href={`/sesiones/${props.sesionId}/expediente`}
                  className="rounded-xl bg-marca-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-marca-700"
                >
                  {props.expedienteEnviado ? 'Ver expediente' : 'Revisar y enviar expediente'}
                </Link>
                <BotonReabrir
                  onReabrir={(motivo) => ejecutar(() => reabrirSesion(props.sesionId, motivo))}
                />
              </>
            )}
          </div>
        </div>

        {abierta && (
          <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-3">
            <Interruptor
              titulo="Asistencia"
              clave="asistencia"
              activo={vivo.asistenciaAbierta}
              onCambio={(v) => ejecutar(() => alternarFlujo(props.sesionId, 'asistencia', v))}
            />
            <Interruptor
              titulo="Evaluación"
              clave="evaluacion"
              activo={vivo.evaluacionAbierta}
              deshabilitado={!props.tienePlantillaEval}
              nota={!props.tienePlantillaEval ? 'Sin plantilla configurada' : undefined}
              onCambio={(v) => ejecutar(() => alternarFlujo(props.sesionId, 'evaluacion', v))}
            />
            <Interruptor
              titulo="Encuesta"
              clave="encuesta"
              activo={vivo.encuestaAbierta}
              deshabilitado={!props.tienePlantillaEnc}
              nota={
                !props.tienePlantillaEnc
                  ? 'Sin plantilla configurada'
                  : `${props.encuestasRecibidas} respuestas`
              }
              onCambio={(v) => ejecutar(() => alternarFlujo(props.sesionId, 'encuesta', v))}
            />
          </div>
        )}
      </div>

      {/* --- Pestañas --- */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {PESTANAS.map((p) => (
          <button
            key={p}
            data-testid={`pestana-${p}`}
            onClick={() => setPestana(p)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold capitalize transition ${
              pestana === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            {p === 'cierre' ? 'Foto y cierre' : p}
          </button>
        ))}
      </div>

      {pestana === 'asistencia' && (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <PanelQR
            qr={props.qr}
            urls={props.urls}
            alcanzable={props.qrAlcanzable}
            visible={qrVisible}
            setVisible={setQrVisible}
            estados={{
              asistencia: vivo.asistenciaAbierta,
              evaluacion: vivo.evaluacionAbierta,
              encuesta: vivo.encuestaAbierta,
            }}
          />
          <TablaRegistros
            registros={vivo.registros}
            bloqueada={cerrada}
            onCorregir={(pid, datos) =>
              ejecutar(() => corregirParticipante(props.sesionId, pid, datos))
            }
            onResolver={(pid, estado, nota) =>
              ejecutar(() => resolverAlerta(props.sesionId, pid, estado, nota))
            }
            onPresencia={(aid, presente) =>
              ejecutar(() => alternarPresencia(props.sesionId, aid, presente))
            }
            onAgregar={(datos) => ejecutar(() => agregarManual(props.sesionId, datos))}
          />
        </div>
      )}

      {pestana === 'contenidos' && (
        <Contenidos
          bloques={props.contenidos}
          bloqueada={cerrada}
          onGuardar={(datos, id) =>
            ejecutar(() => guardarBloqueContenido(props.sesionId, datos, id))
          }
          onEliminar={(id) => ejecutar(() => eliminarBloqueContenido(props.sesionId, id))}
        />
      )}

      {pestana === 'cierre' && (
        <Cierre
          sesionId={props.sesionId}
          fotos={props.fotos}
          bloqueada={cerrada}
          resumen={vivo.resumen}
          onSubir={(tipo, nombre, mime, datos) =>
            ejecutar(() => guardarAdjunto(props.sesionId, tipo, nombre, mime, datos))
          }
          onEliminar={(id) => ejecutar(() => eliminarAdjunto(props.sesionId, id))}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Contador({
  valor,
  de,
  etiqueta,
  destacado,
  alerta,
}: {
  valor: number
  de?: number
  etiqueta: string
  destacado?: boolean
  alerta?: boolean
}) {
  return (
    <div
      className={`rounded-2xl p-4 shadow-sm ring-1 ${
        alerta
          ? 'bg-amber-50 ring-amber-200'
          : destacado
            ? 'bg-marca-50 ring-marca-200'
            : 'bg-white ring-slate-200'
      }`}
    >
      <p className="text-3xl font-bold tabular-nums text-slate-900">
        {valor}
        {de !== undefined && <span className="text-lg font-medium text-slate-400"> / {de}</span>}
      </p>
      <p className="mt-0.5 text-sm font-medium text-slate-600">{etiqueta}</p>
    </div>
  )
}

function Interruptor({
  titulo,
  clave,
  activo,
  onCambio,
  deshabilitado,
  nota,
}: {
  titulo: string
  clave: string
  activo: boolean
  onCambio: (v: boolean) => void
  deshabilitado?: boolean
  nota?: string
}) {
  return (
    <button
      type="button"
      data-testid={`flujo-${clave}`}
      disabled={deshabilitado}
      onClick={() => onCambio(!activo)}
      className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        activo ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <span>
        <span className="block text-sm font-bold text-slate-800">{titulo}</span>
        <span className="block text-xs text-slate-500">
          {nota ?? (activo ? 'Habilitada' : 'Deshabilitada')}
        </span>
      </span>
      <span
        className={`ml-3 h-6 w-11 shrink-0 rounded-full p-0.5 transition ${
          activo ? 'bg-emerald-500' : 'bg-slate-300'
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white shadow transition ${
            activo ? 'translate-x-5' : ''
          }`}
        />
      </span>
    </button>
  )
}

function PanelQR({
  qr,
  urls,
  alcanzable,
  visible,
  setVisible,
  estados,
}: {
  qr: Props['qr']
  urls: Props['urls']
  alcanzable: boolean
  visible: 'asistencia' | 'evaluacion' | 'encuesta'
  setVisible: (v: 'asistencia' | 'evaluacion' | 'encuesta') => void
  estados: { asistencia: boolean; evaluacion: boolean; encuesta: boolean }
}) {
  const [copiado, setCopiado] = useState(false)

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
        {(['asistencia', 'evaluacion', 'encuesta'] as const).map((k) => (
          <button
            key={k}
            data-testid={`qr-tab-${k}`}
            onClick={() => setVisible(k)}
            className={`flex-1 rounded px-2 py-1.5 font-semibold capitalize transition ${
              visible === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr[visible]}
          alt={`Código QR de ${visible}`}
          className={`w-full rounded-xl ${estados[visible] ? '' : 'opacity-25 grayscale'}`}
        />
        {!estados[visible] && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-lg bg-slate-900/85 px-3 py-2 text-center text-sm font-semibold text-white">
              Deshabilitado
              <span className="mt-0.5 block text-xs font-normal">
                Actívelo arriba para que funcione
              </span>
            </span>
          </div>
        )}
      </div>

      {!alcanzable && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <span className="font-semibold">Este QR no lo pueden abrir los celulares.</span> Abrió el
          panel desde <code className="font-mono">localhost</code>, que en un teléfono apunta al
          propio teléfono. Abra la aplicación desde la dirección de red de este equipo (por ejemplo{' '}
          <code className="font-mono">http://192.168.1.42:3000</code>) y el QR se corregirá solo.
        </p>
      )}

      <p
        data-testid="qr-url"
        className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"
      >
        {urls[visible]}
      </p>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(urls[visible])
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1800)
        }}
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        {copiado ? 'Enlace copiado' : 'Copiar enlace'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function TablaRegistros({
  registros,
  bloqueada,
  onCorregir,
  onResolver,
  onPresencia,
  onAgregar,
}: {
  registros: RegistroSesion[]
  bloqueada: boolean
  onCorregir: (pid: string, datos: Record<string, string>) => void
  onResolver: (pid: string, estado: 'OK' | 'ANULADO', nota?: string) => void
  onPresencia: (aid: string, presente: boolean) => void
  onAgregar: (datos: Record<string, string>) => void
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [agregando, setAgregando] = useState(false)

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <h2 className="font-bold text-slate-900">
          Registros{' '}
          <span className="ml-1 text-sm font-normal text-slate-500">
            se actualiza automáticamente
          </span>
        </h2>
        {!bloqueada && (
          <button
            onClick={() => setAgregando(!agregando)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {agregando ? 'Cancelar' : '+ Agregar manualmente'}
          </button>
        )}
      </div>

      {agregando && (
        <div className="border-b border-slate-100 bg-slate-50 p-5">
          <FormularioParticipante
            onGuardar={(d) => {
              onAgregar(d)
              setAgregando(false)
            }}
            onCancelar={() => setAgregando(false)}
            titulo="Agregar participante sin celular"
          />
        </div>
      )}

      {registros.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <p className="font-medium text-slate-600">Todavía no hay registros</p>
          <p className="mt-1 text-sm text-slate-500">
            Proyecte el código QR para que los participantes se registren.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {registros.map((r, i) => (
            <li key={r.participanteId} className={r.anulado ? 'opacity-50' : ''}>
              {editando === r.participanteId ? (
                <div className="bg-slate-50 p-5">
                  <FormularioParticipante
                    inicial={r}
                    titulo="Corregir datos"
                    onGuardar={(d) => {
                      onCorregir(r.participanteId, d)
                      setEditando(null)
                    }}
                    onCancelar={() => setEditando(null)}
                  />
                </div>
              ) : (
                <div className="flex items-start gap-3 px-5 py-3.5">
                  <span className="mt-0.5 w-6 shrink-0 text-sm tabular-nums text-slate-400">
                    {i + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{r.nombre}</p>
                      {r.estadoValidacion !== 'OK' && <Estado valor={r.estadoValidacion} />}
                      {!r.tieneFirma && r.asistenciaId && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                          Sin firma
                        </span>
                      )}
                      {!r.asistenciaId && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                          No registró hoy
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm tabular-nums text-slate-600">
                      {formatearRut(r.rut)}
                      {r.empresa && <span className="text-slate-400"> · {r.empresa}</span>}
                      {r.cargo && <span className="text-slate-400"> · {r.cargo}</span>}
                    </p>
                    {r.notaRevision && r.estadoValidacion !== 'OK' && (
                      <p className="mt-1 text-xs text-amber-700">{r.notaRevision}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-xs tabular-nums text-slate-400">
                      {r.registradoEn
                        ? new Date(r.registradoEn).toLocaleTimeString('es-CL', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })
                        : '—'}
                    </span>
                    {!bloqueada && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => setEditando(r.participanteId)}
                          className="rounded px-2 py-1 text-xs font-semibold text-marca-700 hover:bg-marca-50"
                        >
                          Corregir
                        </button>
                        {r.estadoValidacion !== 'OK' && !r.anulado && (
                          <button
                            onClick={() => onResolver(r.participanteId, 'OK')}
                            className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            Aceptar
                          </button>
                        )}
                        {!r.anulado ? (
                          <button
                            onClick={() => onResolver(r.participanteId, 'ANULADO')}
                            className="rounded px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            Anular
                          </button>
                        ) : (
                          <button
                            onClick={() => onResolver(r.participanteId, 'OK')}
                            className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            Restaurar
                          </button>
                        )}
                        {r.asistenciaId && (
                          <button
                            onClick={() => onPresencia(r.asistenciaId!, !r.presente)}
                            className="rounded px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            {r.presente ? 'Ausente' : 'Presente'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FormularioParticipante({
  inicial,
  titulo,
  onGuardar,
  onCancelar,
}: {
  inicial?: Partial<RegistroSesion>
  titulo: string
  onGuardar: (d: Record<string, string>) => void
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [rut, setRut] = useState(inicial?.rut ? formatearRut(inicial.rut) : '')
  const [rutValido, setRutValido] = useState(Boolean(inicial?.rut))
  const [empresa, setEmpresa] = useState(inicial?.empresa ?? '')
  const [cargo, setCargo] = useState(inicial?.cargo ?? '')
  const [escolaridad, setEscolaridad] = useState(inicial?.nivelEscolaridad ?? '')

  const valido = nombre.trim().length >= 3 && rutValido

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-slate-800">{titulo}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Nombre completo</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500"
          />
        </div>
        <CampoRut
          value={rut}
          onChange={(v, ok) => {
            setRut(v)
            setRutValido(ok)
          }}
          id={`rut-${inicial?.participanteId ?? 'nuevo'}`}
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Empresa</label>
          <input
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            className="w-full rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Cargo</label>
          <input
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            className="w-full rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-600">
            Nivel de escolaridad
          </label>
          <select
            value={escolaridad}
            onChange={(e) => setEscolaridad(e.target.value)}
            className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-marca-500"
          >
            <option value="">Sin especificar</option>
            {NIVELES_ESCOLARIDAD.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          disabled={!valido}
          onClick={() =>
            onGuardar({ nombre, rut, empresa, cargo, nivelEscolaridad: escolaridad })
          }
          className="rounded-lg bg-marca-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
        >
          Guardar
        </button>
        <button
          onClick={onCancelar}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Contenidos({
  bloques,
  bloqueada,
  onGuardar,
  onEliminar,
}: {
  bloques: Bloque[]
  bloqueada: boolean
  onGuardar: (d: Record<string, string>, id?: string) => void
  onEliminar: (id: string) => void
}) {
  const [editando, setEditando] = useState<string | 'nuevo' | null>(null)

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 className="font-bold text-slate-900">Contenidos impartidos</h2>
          <p className="text-sm text-slate-500">
            Reemplaza la hoja de contenidos del libro. Cada bloque queda en el expediente.
          </p>
        </div>
        {!bloqueada && (
          <button
            onClick={() => setEditando(editando === 'nuevo' ? null : 'nuevo')}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {editando === 'nuevo' ? 'Cancelar' : '+ Agregar bloque'}
          </button>
        )}
      </div>

      {editando === 'nuevo' && (
        <div className="border-b border-slate-100 bg-slate-50 p-5">
          <FormularioBloque
            onGuardar={(d) => {
              onGuardar(d)
              setEditando(null)
            }}
            onCancelar={() => setEditando(null)}
          />
        </div>
      )}

      {bloques.length === 0 && editando !== 'nuevo' ? (
        <p className="px-5 py-12 text-center text-sm text-slate-500">
          Aún no se registran contenidos para esta jornada.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {bloques.map((b) => (
            <li key={b.id}>
              {editando === b.id ? (
                <div className="bg-slate-50 p-5">
                  <FormularioBloque
                    inicial={b}
                    onGuardar={(d) => {
                      onGuardar(d, b.id)
                      setEditando(null)
                    }}
                    onCancelar={() => setEditando(null)}
                  />
                </div>
              ) : (
                <div className="flex items-start gap-4 px-5 py-4">
                  <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-semibold tabular-nums text-slate-700">
                    {b.horaInicio}–{b.horaFin}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{b.tema}</p>
                    {b.actividades && (
                      <p className="mt-0.5 text-sm text-slate-600">{b.actividades}</p>
                    )}
                    {b.observaciones && (
                      <p className="mt-1 text-sm italic text-slate-500">{b.observaciones}</p>
                    )}
                  </div>
                  {!bloqueada && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => setEditando(b.id)}
                        className="rounded px-2 py-1 text-xs font-semibold text-marca-700 hover:bg-marca-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => onEliminar(b.id)}
                        className="rounded px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FormularioBloque({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial?: Bloque
  onGuardar: (d: Record<string, string>) => void
  onCancelar: () => void
}) {
  const [tema, setTema] = useState(inicial?.tema ?? '')
  const [actividades, setActividades] = useState(inicial?.actividades ?? '')
  const [horaInicio, setHoraInicio] = useState(inicial?.horaInicio ?? '08:00')
  const [horaFin, setHoraFin] = useState(inicial?.horaFin ?? '11:00')
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? '')

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Tema</label>
          <input
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder="Ej: Procedimiento de manejo de sustancias peligrosas"
            className="w-full rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Inicio</label>
          <input
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            className="rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">Término</label>
          <input
            type="time"
            value={horaFin}
            onChange={(e) => setHoraFin(e.target.value)}
            className="rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">Actividades</label>
        <textarea
          value={actividades}
          onChange={(e) => setActividades(e.target.value)}
          rows={2}
          placeholder="Ej: Revisión de hoja de datos de seguridad del nitrógeno líquido"
          className="w-full rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">
          Observaciones (opcional)
        </label>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          className="w-full rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500"
        />
      </div>
      <div className="flex gap-2">
        <button
          disabled={tema.trim().length < 3}
          onClick={() => onGuardar({ tema, actividades, horaInicio, horaFin, observaciones })}
          className="rounded-lg bg-marca-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
        >
          Guardar bloque
        </button>
        <button
          onClick={onCancelar}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Cierre({
  fotos,
  bloqueada,
  resumen,
  onSubir,
  onEliminar,
}: {
  sesionId: string
  fotos: { id: string; tipo: string; nombre: string; datos: string }[]
  bloqueada: boolean
  resumen: EstadoVivo['resumen']
  onSubir: (
    tipo: 'FOTO_GRUPAL' | 'FOTO_SALA' | 'LIBRO_PAPEL' | 'OTRO',
    nombre: string,
    mime: string,
    datos: string,
  ) => void
  onEliminar: (id: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState<'FOTO_GRUPAL' | 'LIBRO_PAPEL'>('FOTO_GRUPAL')
  const [subiendo, setSubiendo] = useState(false)

  async function alSeleccionar(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setSubiendo(true)
    try {
      const comprimida = await comprimirImagen(archivo)
      onSubir(tipo, archivo.name, 'image/jpeg', comprimida)
    } finally {
      setSubiendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-bold text-slate-900">Foto grupal y respaldos</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          La foto grupal se incluye en el expediente. Durante la marcha blanca puede además
          fotografiar el libro de papel como respaldo.
        </p>

        {!bloqueada && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as typeof tipo)}
              className="rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-marca-500"
            >
              <option value="FOTO_GRUPAL">Foto grupal del curso</option>
              <option value="LIBRO_PAPEL">Respaldo del libro en papel</option>
            </select>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={alSeleccionar}
              className="hidden"
              id="subir-foto"
            />
            <label
              htmlFor="subir-foto"
              className="cursor-pointer rounded-xl bg-marca-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-marca-700"
            >
              {subiendo ? 'Procesando…' : 'Tomar o subir foto'}
            </label>
          </div>
        )}

        {fotos.length > 0 && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fotos.map((f) => (
              <figure key={f.id} className="overflow-hidden rounded-xl ring-1 ring-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.datos} alt={f.nombre} className="aspect-video w-full object-cover" />
                <figcaption className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-semibold text-slate-600">
                    {f.tipo === 'FOTO_GRUPAL' ? 'Foto grupal' : 'Respaldo papel'}
                  </span>
                  {!bloqueada && (
                    <button
                      onClick={() => onEliminar(f.id)}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-bold text-slate-900">Antes de cerrar</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <Chequeo
            ok={resumen.registrados > 0}
            texto={`${resumen.registrados} participantes registrados`}
          />
          <Chequeo
            ok={resumen.sinFirma === 0}
            texto={
              resumen.sinFirma === 0
                ? 'Todos los registros tienen firma'
                : `${resumen.sinFirma} registro(s) sin firma`
            }
          />
          <Chequeo
            ok={resumen.alertas === 0}
            texto={
              resumen.alertas === 0
                ? 'Sin alertas pendientes'
                : `${resumen.alertas} registro(s) marcados para revisión`
            }
          />
          <Chequeo
            ok={fotos.some((f) => f.tipo === 'FOTO_GRUPAL')}
            texto="Foto grupal cargada"
            opcional
          />
        </ul>
        <p className="mt-4 text-sm text-slate-500">
          Al cerrar la sesión se bloquean los nuevos registros y el expediente queda listo para
          revisión de operaciones. Puede cerrar aunque queden alertas: se resuelven en la revisión.
        </p>
      </div>
    </div>
  )
}

function Chequeo({ ok, texto, opcional }: { ok: boolean; texto: string; opcional?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
          ok ? 'bg-emerald-500' : opcional ? 'bg-slate-300' : 'bg-amber-500'
        }`}
      >
        {ok ? '✓' : '!'}
      </span>
      <span className={ok ? 'text-slate-700' : 'text-slate-600'}>{texto}</span>
      {opcional && !ok && <span className="text-xs text-slate-400">(opcional)</span>}
    </li>
  )
}

function BotonCerrar({
  resumen,
  onCerrar,
}: {
  resumen: EstadoVivo['resumen']
  onCerrar: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)

  if (!confirmando) {
    return (
      <button
        onClick={() => setConfirmando(true)}
        className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-900"
      >
        Cerrar sesión
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-300">
      <span className="text-sm font-medium text-amber-900">
        ¿Cerrar con {resumen.registrados} registrados
        {resumen.alertas > 0 && ` y ${resumen.alertas} alertas`}?
      </span>
      <button
        onClick={onCerrar}
        className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-bold text-white"
      >
        Sí, cerrar
      </button>
      <button
        onClick={() => setConfirmando(false)}
        className="rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600"
      >
        No
      </button>
    </div>
  )
}

function BotonReabrir({ onReabrir }: { onReabrir: (motivo: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Reabrir
      </button>
    )
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-orange-50 px-3 py-2.5 ring-1 ring-orange-300">
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo de la reapertura (queda auditado)"
        className="min-w-[240px] flex-1 rounded-lg border border-orange-300 px-3 py-1.5 text-sm outline-none"
      />
      <button
        disabled={motivo.trim().length < 5}
        onClick={() => {
          onReabrir(motivo)
          setAbierto(false)
          setMotivo('')
        }}
        className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-bold text-white disabled:bg-slate-300"
      >
        Reabrir
      </button>
      <button
        onClick={() => setAbierto(false)}
        className="rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600"
      >
        Cancelar
      </button>
    </div>
  )
}

/** Comprime la foto en el navegador: las cámaras de celular entregan 4–8 MB. */
async function comprimirImagen(archivo: File, maxLado = 1600, calidad = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(archivo)
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', calidad)
}
