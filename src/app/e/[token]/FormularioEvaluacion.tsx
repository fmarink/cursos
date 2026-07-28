'use client'

import { useState, useTransition } from 'react'
import CampoRut from '@/components/CampoRut'
import { formatearNota } from '@/lib/notas'
import { enviarEvaluacion } from './acciones'

type Pregunta = {
  id: string
  enunciado: string
  tipo: 'SELECCION_MULTIPLE' | 'VERDADERO_FALSO' | 'RESPUESTA_BREVE'
  opciones: string[]
  puntaje: number
}

export default function FormularioEvaluacion({
  token,
  nombrePlantilla,
  umbral,
  preguntas,
}: {
  token: string
  nombrePlantilla: string
  umbral: number
  preguntas: Pregunta[]
}) {
  const [rut, setRut] = useState('')
  const [rutValido, setRutValido] = useState(false)
  const [identificado, setIdentificado] = useState(false)
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{
    nota: number
    aprobado: boolean
    pendiente: boolean
    nombre: string
  } | null>(null)
  const [enviando, iniciar] = useTransition()

  const respondidas = preguntas.filter((p) => (respuestas[p.id] ?? '').trim() !== '').length
  const completa = respondidas === preguntas.length

  function enviar() {
    setError(null)
    iniciar(async () => {
      const r = await enviarEvaluacion(token, { rut, respuestas })
      if (r.ok) {
        setResultado({
          nota: r.nota,
          aprobado: r.aprobado,
          pendiente: r.pendiente,
          nombre: r.nombre,
        })
      } else {
        setError(r.error)
      }
    })
  }

  // ---- Resultado ----
  if (resultado) {
    return (
      <div
        className={`rounded-2xl border-2 p-6 text-center ${
          resultado.pendiente
            ? 'border-slate-300 bg-white'
            : resultado.aprobado
              ? 'border-emerald-300 bg-emerald-50'
              : 'border-amber-300 bg-amber-50'
        }`}
      >
        <h2 className="text-xl font-bold text-slate-900">Evaluación enviada</h2>
        <p className="mt-1 text-slate-700">{resultado.nombre}</p>

        {resultado.pendiente ? (
          <p className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
            Su evaluación incluye preguntas de desarrollo. El relator las corregirá y su nota final
            quedará en el expediente del curso.
          </p>
        ) : (
          <>
            <p className="mt-5 text-6xl font-bold tabular-nums text-slate-900">
              {formatearNota(resultado.nota)}
            </p>
            <p
              className={`mt-2 text-lg font-bold ${
                resultado.aprobado ? 'text-emerald-700' : 'text-amber-800'
              }`}
            >
              {resultado.aprobado ? 'Aprobado' : 'No aprobado'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Nota mínima de aprobación: {formatearNota(umbral)}
            </p>
          </>
        )}
      </div>
    )
  }

  // ---- Identificación ----
  if (!identificado) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-bold text-slate-900">{nombrePlantilla}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {preguntas.length} preguntas · nota mínima {formatearNota(umbral)}
          </p>
        </div>
        <p className="text-sm text-slate-600">
          Ingrese el mismo RUT con el que registró su asistencia.
        </p>
        <CampoRut
          value={rut}
          onChange={(v, ok) => {
            setRut(v)
            setRutValido(ok)
          }}
          autoFocus
          required
        />
        <button
          disabled={!rutValido}
          onClick={() => setIdentificado(true)}
          className="w-full rounded-xl bg-marca-600 px-6 py-4 text-lg font-bold text-white disabled:bg-slate-300 disabled:text-slate-500"
        >
          Comenzar evaluación
        </button>
      </div>
    )
  }

  // ---- Preguntas ----
  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">
            {respondidas} de {preguntas.length} respondidas
          </span>
          <button
            onClick={() => setIdentificado(false)}
            className="font-medium text-marca-600 hover:underline"
          >
            Cambiar RUT
          </button>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-marca-500 transition-all"
            style={{ width: `${(respondidas / preguntas.length) * 100}%` }}
          />
        </div>
      </div>

      {preguntas.map((p, i) => (
        <fieldset key={p.id} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <legend className="sr-only">Pregunta {i + 1}</legend>
          <p className="font-semibold text-slate-900">
            <span className="mr-2 text-slate-400">{i + 1}.</span>
            {p.enunciado}
          </p>

          {p.tipo === 'RESPUESTA_BREVE' ? (
            <textarea
              rows={3}
              value={respuestas[p.id] ?? ''}
              onChange={(e) => setRespuestas({ ...respuestas, [p.id]: e.target.value })}
              placeholder="Escriba su respuesta"
              className="mt-3 w-full rounded-xl border-2 border-slate-300 px-4 py-3 outline-none focus:border-marca-500"
            />
          ) : (
            <div className="mt-3 space-y-2">
              {(p.tipo === 'VERDADERO_FALSO' ? ['Verdadero', 'Falso'] : p.opciones).map(
                (opcion, idx) => {
                  const valor = p.tipo === 'VERDADERO_FALSO' ? (idx === 0 ? 'true' : 'false') : String(idx)
                  const marcada = respuestas[p.id] === valor
                  return (
                    <label
                      key={valor}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3 transition ${
                        marcada
                          ? 'border-marca-500 bg-marca-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name={p.id}
                        value={valor}
                        checked={marcada}
                        onChange={() => setRespuestas({ ...respuestas, [p.id]: valor })}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-marca-600"
                      />
                      <span className="text-slate-800">{opcion}</span>
                    </label>
                  )
                },
              )}
            </div>
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
        onClick={enviar}
        className="w-full rounded-xl bg-marca-600 px-6 py-4 text-lg font-bold text-white disabled:bg-slate-300 disabled:text-slate-500"
      >
        {enviando ? 'Enviando…' : 'Enviar evaluación'}
      </button>
      {!completa && (
        <p className="text-center text-sm text-slate-500">
          Faltan {preguntas.length - respondidas} preguntas por responder
        </p>
      )}
    </div>
  )
}
