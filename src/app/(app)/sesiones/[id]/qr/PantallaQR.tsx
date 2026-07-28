'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const TITULOS: Record<string, { titulo: string; instruccion: string }> = {
  asistencia: {
    titulo: 'Registro de asistencia',
    instruccion: 'Escanee el código con la cámara de su celular para registrar su asistencia',
  },
  evaluacion: {
    titulo: 'Evaluación del curso',
    instruccion: 'Escanee el código para responder la evaluación',
  },
  encuesta: {
    titulo: 'Encuesta de satisfacción',
    instruccion: 'Escanee el código para responder la encuesta',
  },
}

const ETIQUETAS: Record<'asistencia' | 'evaluacion' | 'encuesta', string> = {
  asistencia: 'Asistencia',
  evaluacion: 'Evaluación',
  encuesta: 'Encuesta',
}

export default function PantallaQR({
  qr,
  url,
  proposito,
  curso,
  cliente,
  sesionId,
  habilitado,
}: {
  qr: string
  url: string
  proposito: string
  curso: string
  cliente: string
  sesionId: string
  habilitado: boolean
}) {
  const [registrados, setRegistrados] = useState<number | null>(null)
  const [activo, setActivo] = useState(habilitado)
  const t = TITULOS[proposito] ?? TITULOS.asistencia

  // La proyección se mantiene al día sola: el contador de asistencia avanza a
  // la vista de la sala, y si el relator habilita la evaluación desde el panel
  // el QR proyectado deja de estar en gris sin que nadie toque el proyector.
  useEffect(() => {
    const consultar = async () => {
      try {
        const r = await fetch(`/api/sesiones/${sesionId}/registros`, { cache: 'no-store' })
        if (!r.ok) return
        const d = await r.json()
        if (proposito === 'asistencia') setRegistrados(d.resumen.registrados)
        setActivo(
          proposito === 'evaluacion'
            ? d.evaluacionAbierta
            : proposito === 'encuesta'
              ? d.encuestaAbierta
              : d.asistenciaAbierta,
        )
      } catch {
        /* sin red: se reintenta en el próximo ciclo */
      }
    }
    consultar()
    const i = setInterval(consultar, 3000)
    return () => clearInterval(i)
  }, [sesionId, proposito])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white px-8 py-6">
      <Link
        href={`/sesiones/${sesionId}`}
        className="no-imprimir absolute left-6 top-6 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
      >
        ← Volver al panel
      </Link>
      <button
        onClick={() => window.print()}
        className="no-imprimir absolute right-6 top-6 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
      >
        Imprimir
      </button>

      <header className="mb-6 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-marca-600">Uppercap</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-900 lg:text-5xl">{t.titulo}</h1>
        <p className="mt-3 text-xl text-slate-700 lg:text-2xl">{curso}</p>
        <p className="text-lg text-slate-500">{cliente}</p>
      </header>

      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr}
          alt="Código QR"
          className={`h-auto w-full max-w-[min(60vh,520px)] rounded-2xl ring-1 ring-slate-200 ${
            activo ? '' : 'opacity-20 grayscale'
          }`}
        />
        {!activo && (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <span className="rounded-2xl bg-slate-900/90 px-6 py-4 text-center text-xl font-bold text-white">
              Todavía no está habilitada
              <span className="mt-1 block text-base font-normal">
                Actívela en el panel y esta pantalla se actualiza sola
              </span>
            </span>
          </div>
        )}
      </div>

      <p className="mt-6 max-w-2xl text-center text-xl font-medium text-slate-700 lg:text-2xl">
        {t.instruccion}
      </p>
      <p className="mt-2 break-all text-center text-sm text-slate-400">{url}</p>

      {registrados !== null && (
        <div className="no-imprimir mt-6 rounded-2xl bg-emerald-50 px-8 py-4 text-center ring-1 ring-emerald-200">
          <p className="text-5xl font-bold tabular-nums text-emerald-700">{registrados}</p>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
            registrados
          </p>
        </div>
      )}

      {/* Cambiar de QR sin salir de la proyección: en sala se pasa de la
          asistencia a la evaluación y de ahí a la encuesta, y bajar a buscar el
          panel con el proyector encendido es justo lo que no se puede hacer. */}
      <nav className="no-imprimir mt-8 flex flex-wrap items-center justify-center gap-2">
        {(['asistencia', 'evaluacion', 'encuesta'] as const).map((k) => (
          <Link
            key={k}
            href={`/sesiones/${sesionId}/qr?tipo=${k}`}
            className={`rounded-xl px-5 py-2.5 text-base font-semibold transition ${
              proposito === k
                ? 'bg-slate-900 text-white'
                : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {ETIQUETAS[k]}
          </Link>
        ))}
      </nav>
    </div>
  )
}
