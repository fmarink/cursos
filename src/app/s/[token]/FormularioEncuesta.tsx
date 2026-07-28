'use client'

import { useState, useTransition } from 'react'
import CampoRut from '@/components/CampoRut'
import { enviarEncuesta } from './acciones'

type Pregunta = { id: string; enunciado: string; tipo: 'ESCALA' | 'TEXTO' | 'SI_NO' }

export default function FormularioEncuesta({
  token,
  anonima,
  escalaMin,
  escalaMax,
  preguntas,
}: {
  token: string
  anonima: boolean
  escalaMin: number
  escalaMax: number
  preguntas: Pregunta[]
}) {
  const [respuestas, setRespuestas] = useState<Record<string, string | number>>({})
  const [rut, setRut] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviada, setEnviada] = useState(false)
  const [enviando, iniciar] = useTransition()

  const escala = Array.from({ length: escalaMax - escalaMin + 1 }, (_, i) => escalaMin + i)
  const obligatorias = preguntas.filter((p) => p.tipo !== 'TEXTO')
  const completa = obligatorias.every((p) => respuestas[p.id] !== undefined)

  if (enviada) {
    return (
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-8 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500">
          <svg
            className="h-9 w-9 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-emerald-900">Gracias por su respuesta</h2>
        <p className="mt-2 text-sm text-emerald-800">
          Sus comentarios nos ayudan a mejorar los próximos cursos.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {anonima && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          Esta encuesta es anónima. Sus respuestas no se asocian a su nombre ni a su RUT.
        </p>
      )}

      {!anonima && (
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <CampoRut value={rut} onChange={(v) => setRut(v)} id="rut-encuesta" />
        </div>
      )}

      {preguntas.map((p, i) => (
        <fieldset key={p.id} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <legend className="sr-only">Pregunta {i + 1}</legend>
          <p className="font-semibold text-slate-900">
            <span className="mr-2 text-slate-400">{i + 1}.</span>
            {p.enunciado}
          </p>

          {p.tipo === 'ESCALA' && (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {escala.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRespuestas({ ...respuestas, [p.id]: n })}
                    className={`h-12 w-12 rounded-xl border-2 text-lg font-bold tabular-nums transition ${
                      respuestas[p.id] === n
                        ? 'border-marca-500 bg-marca-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-400">
                <span>Muy en desacuerdo</span>
                <span>Muy de acuerdo</span>
              </div>
            </>
          )}

          {p.tipo === 'SI_NO' && (
            <div className="mt-4 flex gap-2">
              {['Sí', 'No'].map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => setRespuestas({ ...respuestas, [p.id]: op })}
                  className={`flex-1 rounded-xl border-2 px-4 py-3 font-bold transition ${
                    respuestas[p.id] === op
                      ? 'border-marca-500 bg-marca-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {op}
                </button>
              ))}
            </div>
          )}

          {p.tipo === 'TEXTO' && (
            <textarea
              rows={3}
              value={(respuestas[p.id] as string) ?? ''}
              onChange={(e) => setRespuestas({ ...respuestas, [p.id]: e.target.value })}
              placeholder="Opcional"
              className="mt-3 w-full rounded-xl border-2 border-slate-300 px-4 py-3 outline-none focus:border-marca-500"
            />
          )}
        </fieldset>
      ))}

      {error && (
        <div
          role="alert"
          className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {error}
        </div>
      )}

      <button
        disabled={!completa || enviando}
        onClick={() => {
          setError(null)
          iniciar(async () => {
            const r = await enviarEncuesta(token, { rut, respuestas })
            if (r.ok) setEnviada(true)
            else setError(r.error)
          })
        }}
        className="w-full rounded-xl bg-marca-600 px-6 py-4 text-lg font-bold text-white disabled:bg-slate-300 disabled:text-slate-500"
      >
        {enviando ? 'Enviando…' : 'Enviar encuesta'}
      </button>
    </div>
  )
}
