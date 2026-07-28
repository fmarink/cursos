'use client'

import { useMemo, useState, useTransition } from 'react'
import CampoRut from '@/components/CampoRut'
import { alternarActivoProfesor, guardarProfesor } from './acciones'

type Profesor = {
  id: string
  nombre: string
  rut: string
  telefono: string
  email: string
  direccion: string
  comuna: string
  activo: boolean
  materias: { id: string; nombre: string }[]
}

export default function ListaProfesores({
  profesores,
  tipos,
}: {
  profesores: Profesor[]
  tipos: { id: string; nombre: string }[]
}) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroMateria, setFiltroMateria] = useState('')
  const [editando, setEditando] = useState<string | 'nuevo' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, iniciar] = useTransition()

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return profesores.filter((p) => {
      const coincideTexto =
        q === '' ||
        p.nombre.toLowerCase().includes(q) ||
        p.rut.includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.telefono.includes(q)
      const coincideMateria =
        filtroMateria === '' || p.materias.some((m) => m.id === filtroMateria)
      return coincideTexto && coincideMateria
    })
  }, [profesores, busqueda, filtroMateria])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, RUT, correo o teléfono"
          className="min-w-[240px] flex-1 rounded-xl border-2 border-slate-300 px-4 py-2.5 outline-none focus:border-marca-500"
        />
        <select
          value={filtroMateria}
          onChange={(e) => setFiltroMateria(e.target.value)}
          className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-marca-500"
        >
          <option value="">Todas las materias</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <button
          onClick={() => setEditando(editando === 'nuevo' ? null : 'nuevo')}
          className="rounded-xl bg-marca-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-marca-700"
        >
          {editando === 'nuevo' ? 'Cancelar' : 'Nuevo relator'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      )}

      {editando === 'nuevo' && (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <Formulario
            tipos={tipos}
            onGuardar={(d) =>
              iniciar(async () => {
                const r = await guardarProfesor(d)
                if (r.ok) setEditando(null)
                else setError(r.error)
              })
            }
            onCancelar={() => setEditando(null)}
          />
        </div>
      )}

      <p className="text-sm text-slate-500">
        {filtrados.length} de {profesores.length} relatores
      </p>

      <div className="space-y-3">
        {filtrados.map((p) => (
          <div
            key={p.id}
            className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${
              p.activo ? '' : 'opacity-60'
            }`}
          >
            {editando === p.id ? (
              <Formulario
                inicial={p}
                tipos={tipos}
                onGuardar={(d) =>
                  iniciar(async () => {
                    const r = await guardarProfesor(d, p.id)
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
                    <p className="font-bold text-slate-900">{p.nombre}</p>
                    {!p.activo && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                        Inactivo
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {[p.rut, p.telefono, p.email].filter(Boolean).join(' · ') || 'Sin contacto'}
                  </p>
                  {(p.direccion || p.comuna) && (
                    <p className="text-sm text-slate-500">
                      {[p.direccion, p.comuna].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {p.materias.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.materias.map((m) => (
                        <span
                          key={m.id}
                          className="rounded-full bg-marca-50 px-2.5 py-0.5 text-xs font-semibold text-marca-700 ring-1 ring-inset ring-marca-200"
                        >
                          {m.nombre}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setEditando(p.id)}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-marca-700 hover:bg-marca-50"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => iniciar(() => alternarActivoProfesor(p.id, !p.activo).then(() => {}))}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    {p.activo ? 'Desactivar' : 'Reactivar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Formulario({
  inicial,
  tipos,
  onGuardar,
  onCancelar,
}: {
  inicial?: Profesor
  tipos: { id: string; nombre: string }[]
  onGuardar: (d: Record<string, unknown>) => void
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [rut, setRut] = useState(inicial?.rut ?? '')
  const [telefono, setTelefono] = useState(inicial?.telefono ?? '')
  const [email, setEmail] = useState(inicial?.email ?? '')
  const [direccion, setDireccion] = useState(inicial?.direccion ?? '')
  const [comuna, setComuna] = useState(inicial?.comuna ?? '')
  const [materias, setMaterias] = useState<string[]>(inicial?.materias.map((m) => m.id) ?? [])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-semibold text-slate-700">Nombre completo</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={ESTILO} />
        </div>
        <CampoRut value={rut} onChange={(v) => setRut(v)} id={`rut-prof-${inicial?.id ?? 'nuevo'}`} />
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Teléfono</label>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={ESTILO} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Correo</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={ESTILO}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Comuna</label>
          <input value={comuna} onChange={(e) => setComuna(e.target.value)} className={ESTILO} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-semibold text-slate-700">Dirección</label>
          <input
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            className={ESTILO}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Materias que imparte</p>
        <div className="flex flex-wrap gap-2">
          {tipos.map((t) => {
            const marcada = materias.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setMaterias(
                    marcada ? materias.filter((m) => m !== t.id) : [...materias, t.id],
                  )
                }
                className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition ${
                  marcada
                    ? 'border-marca-500 bg-marca-50 text-marca-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {t.nombre}
              </button>
            )
          })}
          {tipos.length === 0 && (
            <p className="text-sm text-slate-500">No hay tipos de curso registrados todavía.</p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          disabled={nombre.trim().length < 3}
          onClick={() =>
            onGuardar({ nombre, rut, telefono, email, direccion, comuna, materias })
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
  'w-full rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500'
