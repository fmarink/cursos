'use client'

import { useRef, useState, useTransition } from 'react'
import {
  analizarArchivoEncuesta,
  analizarArchivoEvaluacion,
  cargarPreguntasEncuesta,
  cargarPreguntasEvaluacion,
} from './acciones'

type PreguntaLeida = {
  fila: number
  enunciado: string
  tipo: 'SELECCION_MULTIPLE' | 'VERDADERO_FALSO' | 'RESPUESTA_BREVE'
  opciones: string[]
  respuestaCorrecta: string
  puntaje: number
}

type PreguntaEncLeida = {
  fila: number
  enunciado: string
  tipo: 'ESCALA' | 'TEXTO' | 'SI_NO'
}

type Problema = { fila: number; mensaje: string }

const ETIQUETA: Record<string, string> = {
  SELECCION_MULTIPLE: 'Selección múltiple',
  VERDADERO_FALSO: 'Verdadero o falso',
  RESPUESTA_BREVE: 'Respuesta breve',
  ESCALA: 'Escala numérica',
  TEXTO: 'Texto libre',
  SI_NO: 'Sí o no',
}

/**
 * Carga de preguntas desde un archivo Excel o CSV.
 *
 * Nunca guarda directo: primero analiza y muestra lo que entendió, fila por
 * fila, junto con los problemas encontrados. El usuario confirma después. Así
 * un archivo mal armado se detecta antes de ensuciar la evaluación, y no
 * después de aplicarla en sala.
 */
export default function CargaArchivo({
  destino,
  plantillaId,
  preguntasActuales,
}: {
  destino: 'EVALUACION' | 'ENCUESTA'
  plantillaId: string
  preguntasActuales: number
}) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [preguntas, setPreguntas] = useState<(PreguntaLeida | PreguntaEncLeida)[] | null>(null)
  const [problemas, setProblemas] = useState<Problema[]>([])
  const [modo, setModo] = useState<'AGREGAR' | 'REEMPLAZAR'>('AGREGAR')
  const input = useRef<HTMLInputElement>(null)

  const esEval = destino === 'EVALUACION'
  const urlPlantilla = esEval ? '/api/plantillas/evaluacion' : '/api/plantillas/encuesta'

  function limpiar() {
    setPreguntas(null)
    setProblemas([])
    setError(null)
    setNombreArchivo('')
    setModo('AGREGAR')
    if (input.current) input.current.value = ''
  }

  function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setError(null)
    setPreguntas(null)
    setProblemas([])
    setNombreArchivo(archivo.name)

    const fd = new FormData()
    fd.append('archivo', archivo)

    iniciar(async () => {
      const r = esEval ? await analizarArchivoEvaluacion(fd) : await analizarArchivoEncuesta(fd)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setPreguntas(r.preguntas as (PreguntaLeida | PreguntaEncLeida)[])
      setProblemas(r.problemas)
    })
  }

  function confirmar() {
    if (!preguntas || preguntas.length === 0) return
    setError(null)
    iniciar(async () => {
      const r = esEval
        ? await cargarPreguntasEvaluacion(plantillaId, {
            modo,
            preguntas: (preguntas as PreguntaLeida[]).map((p) => ({
              enunciado: p.enunciado,
              tipo: p.tipo,
              opciones: p.opciones,
              respuestaCorrecta: p.respuestaCorrecta,
              puntaje: p.puntaje,
            })),
          })
        : await cargarPreguntasEncuesta(plantillaId, {
            modo,
            preguntas: (preguntas as PreguntaEncLeida[]).map((p) => ({
              enunciado: p.enunciado,
              tipo: p.tipo,
            })),
          })

      if (!r.ok) {
        setError(r.error)
        return
      }
      limpiar()
      setAbierto(false)
    })
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        ⬆ Cargar desde archivo
      </button>
    )
  }

  return (
    <div className="mt-3 w-full rounded-xl border-2 border-marca-200 bg-marca-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-slate-900">Cargar preguntas desde un archivo</h4>
          <p className="mt-0.5 text-sm text-slate-600">
            Descargue la plantilla, escriba las preguntas en Excel y súbala. Antes de guardar verá
            exactamente lo que el sistema entendió.
          </p>
        </div>
        <button
          onClick={() => {
            limpiar()
            setAbierto(false)
          }}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-white"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={urlPlantilla}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ⬇ Descargar plantilla Excel
        </a>
        <label className="cursor-pointer rounded-lg bg-marca-600 px-3 py-2 text-sm font-bold text-white hover:bg-marca-700">
          Elegir archivo…
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={alElegirArchivo}
            className="hidden"
          />
        </label>
        {nombreArchivo && <span className="text-sm text-slate-600">{nombreArchivo}</span>}
        {pendiente && <span className="text-sm text-slate-500">Procesando…</span>}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {error}
        </p>
      )}

      {problemas.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-sm font-bold text-amber-900">
            {problemas.length} fila{problemas.length === 1 ? '' : 's'} con problemas — no se
            {problemas.length === 1 ? ' cargará' : ' cargarán'}:
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-amber-900">
            {problemas.map((p, i) => (
              <li key={i}>
                {p.fila > 0 ? `Fila ${p.fila}: ` : ''}
                {p.mensaje}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preguntas && preguntas.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-bold text-slate-900">
            {preguntas.length} pregunta{preguntas.length === 1 ? '' : 's'} lista
            {preguntas.length === 1 ? '' : 's'} para cargar:
          </p>

          <ol className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-lg bg-white p-3 ring-1 ring-slate-200">
            {preguntas.map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 w-8 shrink-0 text-xs tabular-nums text-slate-400">
                  f.{p.fila}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{p.enunciado}</p>
                  <p className="text-xs text-slate-500">
                    {ETIQUETA[p.tipo]}
                    {'puntaje' in p && ` · ${p.puntaje} punto${p.puntaje === 1 ? '' : 's'}`}
                  </p>
                  {'opciones' in p && p.tipo === 'SELECCION_MULTIPLE' && (
                    <ul className="mt-0.5 text-xs">
                      {p.opciones.map((o, idx) => (
                        <li
                          key={idx}
                          className={
                            String(idx) === p.respuestaCorrecta
                              ? 'font-semibold text-emerald-700'
                              : 'text-slate-600'
                          }
                        >
                          {String.fromCharCode(97 + idx)}) {o}
                          {String(idx) === p.respuestaCorrecta && ' ✓'}
                        </li>
                      ))}
                    </ul>
                  )}
                  {'respuestaCorrecta' in p && p.tipo === 'VERDADERO_FALSO' && (
                    <p className="text-xs font-semibold text-emerald-700">
                      Correcta: {p.respuestaCorrecta === 'true' ? 'Verdadero' : 'Falso'}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {preguntasActuales > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-sm font-semibold text-slate-700">
                Esta {esEval ? 'evaluación' : 'encuesta'} ya tiene {preguntasActuales} pregunta
                {preguntasActuales === 1 ? '' : 's'}. ¿Qué hago con ellas?
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name={`modo-${plantillaId}`}
                  checked={modo === 'AGREGAR'}
                  onChange={() => setModo('AGREGAR')}
                />
                Mantenerlas y agregar las nuevas al final
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name={`modo-${plantillaId}`}
                  checked={modo === 'REEMPLAZAR'}
                  onChange={() => setModo('REEMPLAZAR')}
                />
                Borrarlas y dejar solo las del archivo
              </label>
            </div>
          )}

          <button
            disabled={pendiente}
            onClick={confirmar}
            className="mt-3 rounded-lg bg-marca-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
          >
            {modo === 'REEMPLAZAR'
              ? `Reemplazar por estas ${preguntas.length}`
              : `Cargar ${preguntas.length} pregunta${preguntas.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  )
}
