'use client'

import { useState, useTransition } from 'react'
import { formatearNota } from '@/lib/notas'
import {
  alternarActivaEncuesta,
  alternarActivaPlantilla,
  crearEncuestaEstandar,
  eliminarPregunta,
  eliminarPreguntaEncuesta,
  guardarPlantillaEncuesta,
  guardarPlantillaEvaluacion,
  guardarPregunta,
  guardarPreguntaEncuesta,
} from './acciones'

type TipoPregunta = 'SELECCION_MULTIPLE' | 'VERDADERO_FALSO' | 'RESPUESTA_BREVE'

export type PreguntaVista = {
  id: string
  orden: number
  enunciado: string
  tipo: TipoPregunta
  opciones: string[]
  respuestaCorrecta: string
  puntaje: number
}

export type PlantillaEval = {
  id: string
  nombre: string
  tipoCursoId: string
  clienteId: string
  umbralAprobacion: string
  exigencia: number
  activa: boolean
  preguntas: PreguntaVista[]
}

export type PreguntaEncVista = {
  id: string
  orden: number
  enunciado: string
  tipo: 'ESCALA' | 'TEXTO' | 'SI_NO'
}

export type PlantillaEnc = {
  id: string
  nombre: string
  escalaMin: number
  escalaMax: number
  anonima: boolean
  activa: boolean
  preguntas: PreguntaEncVista[]
}

type Props = {
  evaluaciones: PlantillaEval[]
  encuestas: PlantillaEnc[]
  tipos: { id: string; nombre: string }[]
  clientes: { id: string; nombre: string }[]
}

export default function GestionPlantillas({ evaluaciones, encuestas, tipos, clientes }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const [nuevaEval, setNuevaEval] = useState(false)
  const [nuevaEnc, setNuevaEnc] = useState(false)

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    iniciar(async () => {
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'No se pudo completar la acción.')
    })
  }

  return (
    <div className="space-y-10">
      {error && (
        <div
          role="alert"
          className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {error}
        </div>
      )}

      {/* ================= EVALUACIONES ================= */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Evaluaciones</h2>
            <p className="text-sm text-slate-500">
              La prueba escrita del curso. Se asigna sola por tipo de curso y cliente, o a mano en
              cada jornada desde la ficha del curso.
            </p>
          </div>
          <button
            onClick={() => setNuevaEval(!nuevaEval)}
            className="shrink-0 rounded-xl bg-marca-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-marca-700"
          >
            {nuevaEval ? 'Cancelar' : 'Nueva evaluación'}
          </button>
        </div>

        {nuevaEval && (
          <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <FormularioPlantilla
              tipos={tipos}
              clientes={clientes}
              onGuardar={(d) =>
                ejecutar(async () => {
                  const r = await guardarPlantillaEvaluacion(d)
                  if (r.ok) setNuevaEval(false)
                  return r
                })
              }
              onCancelar={() => setNuevaEval(false)}
            />
          </div>
        )}

        {evaluaciones.length === 0 && !nuevaEval ? (
          <Vacio>
            No hay evaluaciones cargadas. Sin al menos una, el interruptor de Evaluación aparece
            deshabilitado en la sala.
          </Vacio>
        ) : (
          <div className="space-y-4">
            {evaluaciones.map((p) => (
              <TarjetaEvaluacion
                key={p.id}
                plantilla={p}
                tipos={tipos}
                clientes={clientes}
                pendiente={pendiente}
                ejecutar={ejecutar}
              />
            ))}
          </div>
        )}
      </section>

      {/* ================= ENCUESTAS ================= */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Encuestas de satisfacción</h2>
            <p className="text-sm text-slate-500">
              Se responde al final del curso y su resumen va en el expediente.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {encuestas.length === 0 && (
              <button
                disabled={pendiente}
                onClick={() => ejecutar(() => crearEncuestaEstandar())}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Crear la encuesta estándar
              </button>
            )}
            <button
              onClick={() => setNuevaEnc(!nuevaEnc)}
              className="rounded-xl bg-marca-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-marca-700"
            >
              {nuevaEnc ? 'Cancelar' : 'Nueva encuesta'}
            </button>
          </div>
        </div>

        {nuevaEnc && (
          <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <FormularioEncuesta
              onGuardar={(d) =>
                ejecutar(async () => {
                  const r = await guardarPlantillaEncuesta(d)
                  if (r.ok) setNuevaEnc(false)
                  return r
                })
              }
              onCancelar={() => setNuevaEnc(false)}
            />
          </div>
        )}

        {encuestas.length === 0 && !nuevaEnc ? (
          <Vacio>
            No hay encuestas cargadas. El botón «Crear la encuesta estándar» deja las seis preguntas
            habituales listas para editar.
          </Vacio>
        ) : (
          <div className="space-y-4">
            {encuestas.map((p) => (
              <TarjetaEncuesta key={p.id} plantilla={p} pendiente={pendiente} ejecutar={ejecutar} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------

function TarjetaEvaluacion({
  plantilla,
  tipos,
  clientes,
  pendiente,
  ejecutar,
}: {
  plantilla: PlantillaEval
  tipos: { id: string; nombre: string }[]
  clientes: { id: string; nombre: string }[]
  pendiente: boolean
  ejecutar: (fn: () => Promise<{ ok: boolean; error?: string }>) => void
}) {
  const [editandoCabecera, setEditandoCabecera] = useState(false)
  const [nuevaPregunta, setNuevaPregunta] = useState(false)
  const [editandoPregunta, setEditandoPregunta] = useState<string | null>(null)

  const puntajeTotal = plantilla.preguntas.reduce((a, p) => a + p.puntaje, 0)
  const tipo = tipos.find((t) => t.id === plantilla.tipoCursoId)
  const cliente = clientes.find((c) => c.id === plantilla.clienteId)

  return (
    <div
      className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${
        plantilla.activa ? '' : 'opacity-60'
      }`}
    >
      {editandoCabecera ? (
        <FormularioPlantilla
          inicial={plantilla}
          tipos={tipos}
          clientes={clientes}
          onGuardar={(d) =>
            ejecutar(async () => {
              const r = await guardarPlantillaEvaluacion(d, plantilla.id)
              if (r.ok) setEditandoCabecera(false)
              return r
            })
          }
          onCancelar={() => setEditandoCabecera(false)}
        />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900">{plantilla.nombre}</h3>
              {!plantilla.activa && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  Inactiva
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-600">
              {plantilla.preguntas.length} pregunta{plantilla.preguntas.length === 1 ? '' : 's'} ·{' '}
              {puntajeTotal} punto{puntajeTotal === 1 ? '' : 's'} · nota mínima{' '}
              {formatearNota(plantilla.umbralAprobacion)} · exigencia {plantilla.exigencia}%
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              Aplica a: {tipo?.nombre ?? 'todos los tipos de curso'}
              {cliente && ` · solo ${cliente.nombre}`}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => setEditandoCabecera(true)}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-marca-700 hover:bg-marca-50"
            >
              Editar
            </button>
            <button
              onClick={() => ejecutar(() => alternarActivaPlantilla(plantilla.id, !plantilla.activa))}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              {plantilla.activa ? 'Desactivar' : 'Reactivar'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-4">
        {plantilla.preguntas.length === 0 && !nuevaPregunta && (
          <p className="mb-3 text-sm text-amber-700">
            Sin preguntas todavía. Una evaluación vacía no se puede aplicar.
          </p>
        )}

        <ol className="space-y-3">
          {plantilla.preguntas.map((p, i) => (
            <li key={p.id}>
              {editandoPregunta === p.id ? (
                <div className="rounded-xl bg-slate-50 p-4">
                  <FormularioPregunta
                    inicial={p}
                    onGuardar={(d) =>
                      ejecutar(async () => {
                        const r = await guardarPregunta(plantilla.id, d, p.id)
                        if (r.ok) setEditandoPregunta(null)
                        return r
                      })
                    }
                    onCancelar={() => setEditandoPregunta(null)}
                  />
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-5 shrink-0 text-sm tabular-nums text-slate-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">{p.enunciado}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {ETIQUETA_TIPO[p.tipo]} · {p.puntaje} punto{p.puntaje === 1 ? '' : 's'}
                    </p>
                    {p.tipo === 'SELECCION_MULTIPLE' && (
                      <ul className="mt-1 space-y-0.5 text-sm">
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
                    {p.tipo === 'VERDADERO_FALSO' && (
                      <p className="mt-0.5 text-sm font-semibold text-emerald-700">
                        Correcta: {p.respuestaCorrecta === 'true' ? 'Verdadero' : 'Falso'}
                      </p>
                    )}
                    {p.tipo === 'RESPUESTA_BREVE' && (
                      <p className="mt-0.5 text-xs italic text-slate-500">
                        La corrige el relator después del curso.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setEditandoPregunta(p.id)}
                      className="rounded px-2 py-1 text-xs font-semibold text-marca-700 hover:bg-marca-50"
                    >
                      Editar
                    </button>
                    <button
                      disabled={pendiente}
                      onClick={() => ejecutar(() => eliminarPregunta(p.id))}
                      className="rounded px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>

        {nuevaPregunta ? (
          <div className="mt-3 rounded-xl bg-slate-50 p-4">
            <FormularioPregunta
              onGuardar={(d) =>
                ejecutar(async () => {
                  const r = await guardarPregunta(plantilla.id, d)
                  if (r.ok) setNuevaPregunta(false)
                  return r
                })
              }
              onCancelar={() => setNuevaPregunta(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setNuevaPregunta(true)}
            className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            + Agregar pregunta
          </button>
        )}
      </div>
    </div>
  )
}

function TarjetaEncuesta({
  plantilla,
  pendiente,
  ejecutar,
}: {
  plantilla: PlantillaEnc
  pendiente: boolean
  ejecutar: (fn: () => Promise<{ ok: boolean; error?: string }>) => void
}) {
  const [editandoCabecera, setEditandoCabecera] = useState(false)
  const [nuevaPregunta, setNuevaPregunta] = useState(false)
  const [editandoPregunta, setEditandoPregunta] = useState<string | null>(null)

  return (
    <div
      className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${
        plantilla.activa ? '' : 'opacity-60'
      }`}
    >
      {editandoCabecera ? (
        <FormularioEncuesta
          inicial={plantilla}
          onGuardar={(d) =>
            ejecutar(async () => {
              const r = await guardarPlantillaEncuesta(d, plantilla.id)
              if (r.ok) setEditandoCabecera(false)
              return r
            })
          }
          onCancelar={() => setEditandoCabecera(false)}
        />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900">{plantilla.nombre}</h3>
              {!plantilla.activa && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  Inactiva
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-600">
              {plantilla.preguntas.length} pregunta{plantilla.preguntas.length === 1 ? '' : 's'} ·
              escala {plantilla.escalaMin} a {plantilla.escalaMax} ·{' '}
              {plantilla.anonima ? 'anónima' : 'identificada'}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => setEditandoCabecera(true)}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-marca-700 hover:bg-marca-50"
            >
              Editar
            </button>
            <button
              onClick={() => ejecutar(() => alternarActivaEncuesta(plantilla.id, !plantilla.activa))}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              {plantilla.activa ? 'Desactivar' : 'Reactivar'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-4">
        <ol className="space-y-2">
          {plantilla.preguntas.map((p, i) => (
            <li key={p.id}>
              {editandoPregunta === p.id ? (
                <div className="rounded-xl bg-slate-50 p-4">
                  <FormularioPreguntaEncuesta
                    inicial={p}
                    onGuardar={(d) =>
                      ejecutar(async () => {
                        const r = await guardarPreguntaEncuesta(plantilla.id, d, p.id)
                        if (r.ok) setEditandoPregunta(null)
                        return r
                      })
                    }
                    onCancelar={() => setEditandoPregunta(null)}
                  />
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-5 shrink-0 text-sm tabular-nums text-slate-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-800">{p.enunciado}</p>
                    <p className="text-xs text-slate-500">{ETIQUETA_TIPO_ENC[p.tipo]}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setEditandoPregunta(p.id)}
                      className="rounded px-2 py-1 text-xs font-semibold text-marca-700 hover:bg-marca-50"
                    >
                      Editar
                    </button>
                    <button
                      disabled={pendiente}
                      onClick={() => ejecutar(() => eliminarPreguntaEncuesta(p.id))}
                      className="rounded px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>

        {nuevaPregunta ? (
          <div className="mt-3 rounded-xl bg-slate-50 p-4">
            <FormularioPreguntaEncuesta
              onGuardar={(d) =>
                ejecutar(async () => {
                  const r = await guardarPreguntaEncuesta(plantilla.id, d)
                  if (r.ok) setNuevaPregunta(false)
                  return r
                })
              }
              onCancelar={() => setNuevaPregunta(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setNuevaPregunta(true)}
            className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            + Agregar pregunta
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function FormularioPlantilla({
  inicial,
  tipos,
  clientes,
  onGuardar,
  onCancelar,
}: {
  inicial?: PlantillaEval
  tipos: { id: string; nombre: string }[]
  clientes: { id: string; nombre: string }[]
  onGuardar: (d: Record<string, unknown>) => void
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [tipoCursoId, setTipoCursoId] = useState(inicial?.tipoCursoId ?? '')
  const [clienteId, setClienteId] = useState(inicial?.clienteId ?? '')
  const [umbral, setUmbral] = useState(Number(inicial?.umbralAprobacion ?? 4))
  const [exigencia, setExigencia] = useState(inicial?.exigencia ?? 60)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Etiqueta>Nombre de la evaluación</Etiqueta>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Evaluación Trabajo en Altura"
            className={ESTILO}
          />
        </div>
        <div>
          <Etiqueta>Aplica al tipo de curso</Etiqueta>
          <select
            value={tipoCursoId}
            onChange={(e) => setTipoCursoId(e.target.value)}
            className={ESTILO}
          >
            <option value="">Todos los tipos de curso</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Etiqueta>Solo para el cliente</Etiqueta>
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={ESTILO}>
            <option value="">Cualquier cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Etiqueta>Nota mínima de aprobación</Etiqueta>
          <input
            type="number"
            step="0.1"
            min={1}
            max={7}
            value={umbral}
            onChange={(e) => setUmbral(Number(e.target.value))}
            className={ESTILO}
          />
        </div>
        <div>
          <Etiqueta>Exigencia (%)</Etiqueta>
          <input
            type="number"
            min={1}
            max={100}
            value={exigencia}
            onChange={(e) => setExigencia(Number(e.target.value))}
            className={ESTILO}
          />
          <p className="mt-1 text-xs text-slate-500">
            Porcentaje de logro necesario para alcanzar la nota mínima. Lo habitual es 60%.
          </p>
        </div>
      </div>
      <Botones
        deshabilitado={nombre.trim().length < 3}
        onGuardar={() =>
          onGuardar({ nombre, tipoCursoId, clienteId, umbralAprobacion: umbral, exigencia })
        }
        onCancelar={onCancelar}
      />
    </div>
  )
}

function FormularioPregunta({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial?: PreguntaVista
  onGuardar: (d: Record<string, unknown>) => void
  onCancelar: () => void
}) {
  const [enunciado, setEnunciado] = useState(inicial?.enunciado ?? '')
  const [tipo, setTipo] = useState<TipoPregunta>(inicial?.tipo ?? 'SELECCION_MULTIPLE')
  const [opciones, setOpciones] = useState<string[]>(
    inicial?.opciones?.length ? inicial.opciones : ['', '', '', ''],
  )
  const [correcta, setCorrecta] = useState(inicial?.respuestaCorrecta ?? '')
  const [puntaje, setPuntaje] = useState(inicial?.puntaje ?? 2)

  return (
    <div className="space-y-4">
      <div>
        <Etiqueta>Enunciado</Etiqueta>
        <textarea
          value={enunciado}
          onChange={(e) => setEnunciado(e.target.value)}
          rows={2}
          placeholder="Ej: ¿Cuál es la altura mínima que exige el uso de arnés?"
          className={ESTILO}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Etiqueta>Tipo de pregunta</Etiqueta>
          <select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as TipoPregunta)
              setCorrecta('')
            }}
            className={ESTILO}
          >
            <option value="SELECCION_MULTIPLE">Selección múltiple</option>
            <option value="VERDADERO_FALSO">Verdadero o falso</option>
            <option value="RESPUESTA_BREVE">Respuesta breve (la corrige el relator)</option>
          </select>
        </div>
        <div>
          <Etiqueta>Puntaje</Etiqueta>
          <input
            type="number"
            min={1}
            max={20}
            value={puntaje}
            onChange={(e) => setPuntaje(Number(e.target.value))}
            className={ESTILO}
          />
        </div>
      </div>

      {tipo === 'SELECCION_MULTIPLE' && (
        <div>
          <Etiqueta>Opciones — marque la correcta</Etiqueta>
          <div className="space-y-2">
            {opciones.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correcta"
                  checked={correcta === String(i)}
                  onChange={() => setCorrecta(String(i))}
                  className="h-5 w-5 shrink-0 accent-emerald-600"
                />
                <input
                  value={o}
                  onChange={(e) => setOpciones(opciones.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Opción ${String.fromCharCode(97 + i)}`}
                  className={ESTILO}
                />
                {opciones.length > 2 && (
                  <button
                    onClick={() => {
                      setOpciones(opciones.filter((_, j) => j !== i))
                      if (correcta === String(i)) setCorrecta('')
                    }}
                    className="shrink-0 rounded px-2 py-1 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    Quitar
                  </button>
                )}
              </div>
            ))}
          </div>
          {opciones.length < 6 && (
            <button
              onClick={() => setOpciones([...opciones, ''])}
              className="mt-2 text-sm font-semibold text-marca-600 hover:underline"
            >
              + Agregar opción
            </button>
          )}
        </div>
      )}

      {tipo === 'VERDADERO_FALSO' && (
        <div>
          <Etiqueta>La afirmación es</Etiqueta>
          <div className="flex gap-2">
            {[
              ['true', 'Verdadera'],
              ['false', 'Falsa'],
            ].map(([valor, texto]) => (
              <button
                key={valor}
                onClick={() => setCorrecta(valor)}
                className={`rounded-xl border-2 px-5 py-2.5 font-semibold transition ${
                  correcta === valor
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>
      )}

      {tipo === 'RESPUESTA_BREVE' && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          El participante escribe su respuesta y el relator le asigna el puntaje después del curso,
          desde la pantalla del expediente.
        </p>
      )}

      <Botones
        deshabilitado={enunciado.trim().length < 5}
        onGuardar={() =>
          onGuardar({ enunciado, tipo, opciones, respuestaCorrecta: correcta, puntaje })
        }
        onCancelar={onCancelar}
      />
    </div>
  )
}

function FormularioEncuesta({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial?: PlantillaEnc
  onGuardar: (d: Record<string, unknown>) => void
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [escalaMin, setEscalaMin] = useState(inicial?.escalaMin ?? 1)
  const [escalaMax, setEscalaMax] = useState(inicial?.escalaMax ?? 7)
  const [anonima, setAnonima] = useState(inicial?.anonima ?? true)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Etiqueta>Nombre de la encuesta</Etiqueta>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Encuesta de satisfacción"
            className={ESTILO}
          />
        </div>
        <div>
          <Etiqueta>Escala desde</Etiqueta>
          <input
            type="number"
            min={0}
            max={5}
            value={escalaMin}
            onChange={(e) => setEscalaMin(Number(e.target.value))}
            className={ESTILO}
          />
        </div>
        <div>
          <Etiqueta>Escala hasta</Etiqueta>
          <input
            type="number"
            min={2}
            max={10}
            value={escalaMax}
            onChange={(e) => setEscalaMax(Number(e.target.value))}
            className={ESTILO}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={anonima}
              onChange={(e) => setAnonima(e.target.checked)}
              className="h-5 w-5 accent-marca-600"
            />
            <span className="text-sm font-medium text-slate-700">
              Anónima — las respuestas no se asocian a ningún participante
            </span>
          </label>
        </div>
      </div>
      <Botones
        deshabilitado={nombre.trim().length < 3}
        onGuardar={() => onGuardar({ nombre, escalaMin, escalaMax, anonima })}
        onCancelar={onCancelar}
      />
    </div>
  )
}

function FormularioPreguntaEncuesta({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial?: PreguntaEncVista
  onGuardar: (d: Record<string, unknown>) => void
  onCancelar: () => void
}) {
  const [enunciado, setEnunciado] = useState(inicial?.enunciado ?? '')
  const [tipo, setTipo] = useState(inicial?.tipo ?? 'ESCALA')

  return (
    <div className="space-y-4">
      <div>
        <Etiqueta>Enunciado</Etiqueta>
        <input
          value={enunciado}
          onChange={(e) => setEnunciado(e.target.value)}
          placeholder="Ej: El relator dominaba los contenidos del curso."
          className={ESTILO}
        />
      </div>
      <div>
        <Etiqueta>Tipo de respuesta</Etiqueta>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as PreguntaEncVista['tipo'])}
          className={ESTILO}
        >
          <option value="ESCALA">Escala numérica</option>
          <option value="SI_NO">Sí o no</option>
          <option value="TEXTO">Texto libre (opcional para el participante)</option>
        </select>
      </div>
      <Botones
        deshabilitado={enunciado.trim().length < 5}
        onGuardar={() => onGuardar({ enunciado, tipo })}
        onCancelar={onCancelar}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

const ETIQUETA_TIPO: Record<string, string> = {
  SELECCION_MULTIPLE: 'Selección múltiple',
  VERDADERO_FALSO: 'Verdadero o falso',
  RESPUESTA_BREVE: 'Respuesta breve',
}

const ETIQUETA_TIPO_ENC: Record<string, string> = {
  ESCALA: 'Escala numérica',
  TEXTO: 'Texto libre',
  SI_NO: 'Sí o no',
}

const ESTILO =
  'w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-marca-500'

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-sm font-semibold text-slate-700">{children}</label>
}

function Botones({
  deshabilitado,
  onGuardar,
  onCancelar,
}: {
  deshabilitado: boolean
  onGuardar: () => void
  onCancelar: () => void
}) {
  return (
    <div className="flex gap-2">
      <button
        disabled={deshabilitado}
        onClick={onGuardar}
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
  )
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}
