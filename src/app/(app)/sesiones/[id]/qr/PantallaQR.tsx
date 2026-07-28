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

export default function PantallaQR({
  qr,
  url,
  proposito,
  curso,
  cliente,
  sesionId,
}: {
  qr: string
  url: string
  proposito: string
  curso: string
  cliente: string
  sesionId: string
}) {
  const [registrados, setRegistrados] = useState<number | null>(null)
  const t = TITULOS[proposito] ?? TITULOS.asistencia

  // Contador en vivo sobre la proyección: la sala ve avanzar el número.
  useEffect(() => {
    if (proposito !== 'asistencia') return
    const consultar = async () => {
      try {
        const r = await fetch(`/api/sesiones/${sesionId}/registros`, { cache: 'no-store' })
        if (r.ok) {
          const d = await r.json()
          setRegistrados(d.resumen.registrados)
        }
      } catch {
        /* sin red: se reintenta */
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

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qr}
        alt="Código QR"
        className="h-auto w-full max-w-[min(60vh,520px)] rounded-2xl ring-1 ring-slate-200"
      />

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
    </div>
  )
}
