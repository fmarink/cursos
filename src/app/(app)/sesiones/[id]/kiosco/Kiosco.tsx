'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import FormularioAsistencia from '@/app/a/[token]/FormularioAsistencia'

/**
 * Envoltorio de pantalla completa para la tablet.
 *
 * Reutiliza exactamente el mismo formulario que el participante ve en su
 * celular — un solo flujo que mantener — pero en modo kiosco: firma más alta
 * pensada para lápiz óptico, y al confirmar se reinicia para el siguiente.
 *
 * La salida está protegida con confirmación para que nadie abandone el modo
 * por accidente al pasar la tablet.
 */
export default function Kiosco({
  sesionId,
  token,
  habilitado,
  estadoSesion,
  curso,
  cliente,
  lugar,
  relator,
}: {
  sesionId: string
  token: string
  habilitado: boolean
  estadoSesion: string
  curso: string
  cliente: string
  lugar: string
  relator: string | null
}) {
  const router = useRouter()
  const [confirmandoSalida, setConfirmandoSalida] = useState(false)
  const [registrados, setRegistrados] = useState<number | null>(null)

  // Contador discreto para que el relator sepa cuántos van sin salir del modo.
  useEffect(() => {
    const consultar = async () => {
      try {
        const r = await fetch(`/api/sesiones/${sesionId}/registros`, { cache: 'no-store' })
        if (r.ok) setRegistrados((await r.json()).resumen.registrados)
      } catch {
        /* sin red: se reintenta */
      }
    }
    consultar()
    const i = setInterval(consultar, 5000)
    return () => clearInterval(i)
  }, [sesionId])

  // Evita que la tablet se apague en medio de la ronda de firmas.
  useEffect(() => {
    let bloqueo: WakeLockSentinel | null = null
    const pedir = async () => {
      try {
        bloqueo = await navigator.wakeLock?.request('screen')
      } catch {
        /* el navegador puede no soportarlo */
      }
    }
    pedir()
    const alVolver = () => document.visibilityState === 'visible' && pedir()
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      bloqueo?.release().catch(() => {})
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-100">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-marca-600">
              Modo tablet
            </p>
            <p className="truncate text-sm font-semibold text-slate-800">{curso}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {registrados !== null && (
              <div className="rounded-xl bg-emerald-50 px-3 py-1.5 text-center ring-1 ring-emerald-200">
                <p className="text-xl font-bold leading-none tabular-nums text-emerald-700">
                  {registrados}
                </p>
                <p className="text-[10px] font-semibold uppercase text-emerald-600">firmas</p>
              </div>
            )}
            {confirmandoSalida ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => router.push(`/sesiones/${sesionId}`)}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white"
                >
                  Salir
                </button>
                <button
                  onClick={() => setConfirmandoSalida(false)}
                  className="rounded-lg px-2 py-2 text-sm font-semibold text-slate-600"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmandoSalida(true)}
                aria-label="Salir del modo tablet"
                className="rounded-lg border border-slate-300 px-2.5 py-2 text-slate-400 hover:bg-slate-50"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-6">
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-2xl font-bold text-slate-900">Registre su asistencia</h1>
          <p className="mt-1 text-slate-600">
            Complete sus datos y firme con el lápiz. Al confirmar, entregue la tablet a la
            siguiente persona.
          </p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
            <div className="flex gap-1.5">
              <dt className="font-medium">Cliente:</dt>
              <dd>{cliente}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-medium">Lugar:</dt>
              <dd>{lugar}</dd>
            </div>
            {relator && (
              <div className="flex gap-1.5">
                <dt className="font-medium">Relator:</dt>
                <dd>{relator}</dd>
              </div>
            )}
          </dl>
        </div>

        <FormularioAsistencia
          token={token}
          habilitado={habilitado}
          estadoSesion={estadoSesion}
          modoKiosco
        />
      </main>
    </div>
  )
}
