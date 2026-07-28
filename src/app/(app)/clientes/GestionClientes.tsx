'use client'

import { useState, useTransition } from 'react'
import CampoRut from '@/components/CampoRut'
import { desactivarLugar, guardarCliente, guardarLugar } from './acciones'

type Cliente = {
  id: string
  razonSocial: string
  rut: string
  contactoNombre: string
  contactoEmail: string
  contactoTelefono: string
  activo: boolean
  totalCursos: number
  lugares: { id: string; nombre: string; tipo: string }[]
}

const ETIQUETA_TIPO: Record<string, string> = {
  FAENA: 'Faena',
  HOTEL: 'Hotel',
  OFICINA: 'Oficina',
  OTRO: 'Otro',
}

export default function GestionClientes({
  clientes,
  lugaresGenerales,
}: {
  clientes: Cliente[]
  lugaresGenerales: { id: string; nombre: string; tipo: string }[]
}) {
  const [editando, setEditando] = useState<string | 'nuevo' | null>(null)
  const [agregandoLugar, setAgregandoLugar] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, iniciar] = useTransition()

  return (
    <div className="space-y-4">
      <button
        onClick={() => setEditando(editando === 'nuevo' ? null : 'nuevo')}
        className="rounded-xl bg-marca-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-marca-700"
      >
        {editando === 'nuevo' ? 'Cancelar' : 'Nuevo cliente'}
      </button>

      {error && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      )}

      {editando === 'nuevo' && (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <FormularioCliente
            onGuardar={(d) =>
              iniciar(async () => {
                const r = await guardarCliente(d)
                if (r.ok) setEditando(null)
                else setError(r.error)
              })
            }
            onCancelar={() => setEditando(null)}
          />
        </div>
      )}

      {clientes.map((c) => (
        <div key={c.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          {editando === c.id ? (
            <FormularioCliente
              inicial={c}
              onGuardar={(d) =>
                iniciar(async () => {
                  const r = await guardarCliente(d, c.id)
                  if (r.ok) setEditando(null)
                  else setError(r.error)
                })
              }
              onCancelar={() => setEditando(null)}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-slate-900">{c.razonSocial}</p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {[c.rut, c.contactoNombre, c.contactoEmail, c.contactoTelefono]
                      .filter(Boolean)
                      .join(' · ') || 'Sin datos de contacto'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {c.totalCursos} curso{c.totalCursos === 1 ? '' : 's'} registrado
                    {c.totalCursos === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  onClick={() => setEditando(c.id)}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-marca-700 hover:bg-marca-50"
                >
                  Editar
                </button>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Lugares</p>
                  <button
                    onClick={() => setAgregandoLugar(agregandoLugar === c.id ? null : c.id)}
                    className="text-sm font-semibold text-marca-600 hover:underline"
                  >
                    {agregandoLugar === c.id ? 'Cancelar' : '+ Agregar lugar'}
                  </button>
                </div>

                {agregandoLugar === c.id && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-4">
                    <FormularioLugar
                      clienteId={c.id}
                      onGuardar={(d) =>
                        iniciar(async () => {
                          const r = await guardarLugar(d)
                          if (r.ok) setAgregandoLugar(null)
                          else setError(r.error)
                        })
                      }
                    />
                  </div>
                )}

                {c.lugares.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-400">Sin lugares registrados.</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {c.lugares.map((l) => (
                      <li
                        key={l.id}
                        className="flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-sm text-slate-700"
                      >
                        <span>
                          {l.nombre}
                          <span className="ml-1 text-xs text-slate-400">
                            {ETIQUETA_TIPO[l.tipo]}
                          </span>
                        </span>
                        <button
                          onClick={() => iniciar(() => desactivarLugar(l.id).then(() => {}))}
                          aria-label={`Quitar ${l.nombre}`}
                          className="rounded-full px-1.5 text-slate-400 hover:bg-slate-200 hover:text-red-600"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      ))}

      {lugaresGenerales.length > 0 && (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="font-semibold text-slate-700">Lugares generales</p>
          <p className="mt-0.5 text-sm text-slate-500">
            Disponibles para cualquier cliente (hoteles, salas arrendadas).
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {lugaresGenerales.map((l) => (
              <li key={l.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {l.nombre}
                <span className="ml-1 text-xs text-slate-400">{ETIQUETA_TIPO[l.tipo]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function FormularioCliente({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial?: Cliente
  onGuardar: (d: Record<string, string>) => void
  onCancelar: () => void
}) {
  const [razonSocial, setRazonSocial] = useState(inicial?.razonSocial ?? '')
  const [rut, setRut] = useState(inicial?.rut ?? '')
  const [contactoNombre, setContactoNombre] = useState(inicial?.contactoNombre ?? '')
  const [contactoEmail, setContactoEmail] = useState(inicial?.contactoEmail ?? '')
  const [contactoTelefono, setContactoTelefono] = useState(inicial?.contactoTelefono ?? '')

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-semibold text-slate-700">Razón social</label>
          <input
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            className={ESTILO}
          />
        </div>
        <CampoRut value={rut} onChange={(v) => setRut(v)} id={`rut-cli-${inicial?.id ?? 'nuevo'}`} />
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">
            Nombre del representante
          </label>
          <input
            value={contactoNombre}
            onChange={(e) => setContactoNombre(e.target.value)}
            className={ESTILO}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">
            Correo para el expediente
          </label>
          <input
            type="email"
            value={contactoEmail}
            onChange={(e) => setContactoEmail(e.target.value)}
            placeholder="operaciones@cliente.cl"
            className={ESTILO}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Teléfono</label>
          <input
            value={contactoTelefono}
            onChange={(e) => setContactoTelefono(e.target.value)}
            className={ESTILO}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          disabled={razonSocial.trim().length < 3}
          onClick={() =>
            onGuardar({ razonSocial, rut, contactoNombre, contactoEmail, contactoTelefono })
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

function FormularioLugar({
  clienteId,
  onGuardar,
}: {
  clienteId: string
  onGuardar: (d: Record<string, string>) => void
}) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('FAENA')
  const [direccion, setDireccion] = useState('')
  const [comuna, setComuna] = useState('')

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Nombre</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Faena Los Bronces"
            className={ESTILO}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={ESTILO}>
            <option value="FAENA">Faena</option>
            <option value="HOTEL">Hotel</option>
            <option value="OFICINA">Oficina</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Comuna</label>
          <input value={comuna} onChange={(e) => setComuna(e.target.value)} className={ESTILO} />
        </div>
        <div className="sm:col-span-4">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Dirección</label>
          <input
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            className={ESTILO}
          />
        </div>
      </div>
      <button
        disabled={nombre.trim().length < 2}
        onClick={() => onGuardar({ nombre, tipo, direccion, comuna, clienteId })}
        className="rounded-lg bg-marca-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
      >
        Agregar lugar
      </button>
    </div>
  )
}

const ESTILO =
  'w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-marca-500'
