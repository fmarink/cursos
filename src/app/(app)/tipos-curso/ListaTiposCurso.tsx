'use client'

import { useState, useTransition } from 'react'
import { alternarActivoTipoCurso, guardarTipoCurso } from './acciones'

type TipoCurso = {
  id: string
  nombre: string
  codigoInterno: string
  horasDefault: number
  tieneComponentePractico: boolean
  descripcion: string
  codigoSence: string
  activo: boolean
  totalCursos: number
  totalRelatores: number
}

export default function ListaTiposCurso({ tipos }: { tipos: TipoCurso[] }) {
  const [editando, setEditando] = useState<string | 'nuevo' | null>(
    tipos.length === 0 ? 'nuevo' : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [, iniciar] = useTransition()

  return (
    <div className="space-y-4">
      <button
        onClick={() => setEditando(editando === 'nuevo' ? null : 'nuevo')}
        className="rounded-xl bg-marca-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-marca-700"
      >
        {editando === 'nuevo' ? 'Cancelar' : 'Nuevo tipo de curso'}
      </button>

      {error && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      )}
      {aviso && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {aviso}
        </div>
      )}

      {editando === 'nuevo' && (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <Formulario
            onGuardar={(d) =>
              iniciar(async () => {
                setError(null)
                const r = await guardarTipoCurso(d)
                if (r.ok) setEditando(null)
                else setError(r.error)
              })
            }
            onCancelar={() => setEditando(null)}
          />
        </div>
      )}

      {tipos.length === 0 && editando !== 'nuevo' && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
          <p className="font-medium text-slate-600">Todavía no hay tipos de curso</p>
          <p className="mt-1 text-sm text-slate-500">
            Cree el primero para poder programar cursos.
          </p>
        </div>
      )}

      {tipos.map((t) => (
        <div
          key={t.id}
          className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${
            t.activo ? '' : 'opacity-60'
          }`}
        >
          {editando === t.id ? (
            <Formulario
              inicial={t}
              onGuardar={(d) =>
                iniciar(async () => {
                  setError(null)
                  const r = await guardarTipoCurso(d, t.id)
                  if (r.ok) setEditando(null)
                  else setError(r.error)
                })
              }
              onCancelar={() => setEditando(null)}
            />
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-slate-900">{t.nombre}</p>
                  {t.codigoInterno && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                      {t.codigoInterno}
                    </span>
                  )}
                  {!t.activo && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  {t.horasDefault} horas por defecto
                  {t.tieneComponentePractico && ' · con taller práctico'}
                </p>
                {t.descripcion && <p className="mt-1 text-sm text-slate-500">{t.descripcion}</p>}
                <p className="mt-1 text-xs text-slate-400">
                  {t.totalCursos} curso{t.totalCursos === 1 ? '' : 's'} dictado
                  {t.totalCursos === 1 ? '' : 's'} · {t.totalRelatores} relator
                  {t.totalRelatores === 1 ? '' : 'es'} habilitado
                  {t.totalRelatores === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setEditando(t.id)}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-marca-700 hover:bg-marca-50"
                >
                  Editar
                </button>
                <button
                  onClick={() =>
                    iniciar(async () => {
                      setAviso(null)
                      const r = await alternarActivoTipoCurso(t.id, !t.activo)
                      if (r.ok && 'aviso' in r && r.aviso) setAviso(r.aviso)
                    })
                  }
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  {t.activo ? 'Desactivar' : 'Reactivar'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function Formulario({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial?: TipoCurso
  onGuardar: (d: Record<string, unknown>) => void
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [codigoInterno, setCodigoInterno] = useState(inicial?.codigoInterno ?? '')
  const [horasDefault, setHorasDefault] = useState(inicial?.horasDefault ?? 8)
  const [practico, setPractico] = useState(inicial?.tieneComponentePractico ?? false)
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '')
  const [codigoSence, setCodigoSence] = useState(inicial?.codigoSence ?? '')

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-semibold text-slate-700">
            Nombre del curso
          </label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Trabajo en Altura Física"
            className={ESTILO}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Código interno</label>
          <input
            value={codigoInterno}
            onChange={(e) => setCodigoInterno(e.target.value.toUpperCase())}
            placeholder="ALTURA"
            maxLength={20}
            className={`${ESTILO} font-mono`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Aparece en el código de cada curso: ALTURA-20260727-1
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">
            Horas por defecto
          </label>
          <input
            type="number"
            min={1}
            max={200}
            value={horasDefault}
            onChange={(e) => setHorasDefault(Number(e.target.value))}
            className={ESTILO}
          />
        </div>
        <div className="flex items-end pb-1 sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={practico}
              onChange={(e) => setPractico(e.target.checked)}
              className="h-5 w-5 accent-marca-600"
            />
            <span className="text-sm font-medium text-slate-700">
              Tiene taller práctico además de la parte teórica
            </span>
          </label>
        </div>
        <div className="sm:col-span-3">
          <label className="mb-1 block text-sm font-semibold text-slate-700">
            Descripción (opcional)
          </label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            placeholder="Contenidos que cubre, a quién está dirigido…"
            className={ESTILO}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">
            Código SENCE (opcional)
          </label>
          <input
            value={codigoSence}
            onChange={(e) => setCodigoSence(e.target.value)}
            className={`${ESTILO} font-mono`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Solo si el curso es SENCE. No se valida ni se exige.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          disabled={nombre.trim().length < 3}
          onClick={() =>
            onGuardar({
              nombre,
              codigoInterno,
              horasDefault,
              tieneComponentePractico: practico,
              descripcion,
              codigoSence,
            })
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

const ESTILO =
  'w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-marca-500'
