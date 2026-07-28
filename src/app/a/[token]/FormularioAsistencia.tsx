'use client'

import { useRef, useState, useTransition } from 'react'
import CampoRut from '@/components/CampoRut'
import CanvasFirma, { type ManejadorFirma } from '@/components/CanvasFirma'
import { NIVELES_ESCOLARIDAD } from '@/lib/constantes'
import { registrarAsistencia } from './acciones'

type Props = {
  token: string
  habilitado: boolean
  estadoSesion: string
  modoKiosco: boolean
}

const VACIO = {
  nombre: '',
  rut: '',
  empresa: '',
  cargo: '',
  nivelEscolaridad: '',
}

export default function FormularioAsistencia({
  token,
  habilitado,
  estadoSesion,
  modoKiosco,
}: Props) {
  const [form, setForm] = useState(VACIO)
  const [rutValido, setRutValido] = useState(false)
  const [tieneFirma, setTieneFirma] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<{ nombre: string; hora: string; yaEstaba: boolean } | null>(
    null,
  )
  const [enviando, iniciarEnvio] = useTransition()
  const firmaRef = useRef<ManejadorFirma>(null)

  const puedeEnviar = form.nombre.trim().length >= 3 && rutValido && tieneFirma && !enviando

  function reiniciar() {
    setForm(VACIO)
    setRutValido(false)
    setTieneFirma(false)
    setError(null)
    setExito(null)
    firmaRef.current?.limpiar()
  }

  function enviar() {
    setError(null)
    const png = firmaRef.current?.exportarPng()
    if (!png) {
      setError('Falta la firma.')
      return
    }
    iniciarEnvio(async () => {
      const r = await registrarAsistencia(token, {
        ...form,
        firmaPng: png,
        firmaTrazos: JSON.stringify(firmaRef.current?.exportarTrazos() ?? []),
        esTablet: modoKiosco,
      })
      if (r.ok) {
        setExito({ nombre: r.nombre, hora: r.hora, yaEstaba: r.yaEstaba })
      } else {
        setError(r.error)
      }
    })
  }

  // ---- Pantalla de éxito ----
  if (exito) {
    return (
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
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
        <h2 className="text-xl font-bold text-emerald-900">
          {exito.yaEstaba ? 'Firma actualizada' : 'Asistencia registrada'}
        </h2>
        <p className="mt-1 text-emerald-800">{exito.nombre}</p>
        <p className="mt-0.5 text-sm text-emerald-700">Registrado a las {exito.hora}</p>
        {exito.yaEstaba && (
          <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
            Ya había un registro con este RUT en esta jornada. Se actualizó la firma y el relator lo
            revisará.
          </p>
        )}

        {modoKiosco ? (
          <button
            type="button"
            onClick={reiniciar}
            className="mt-6 w-full rounded-xl bg-marca-600 px-6 py-4 text-lg font-bold text-white active:bg-marca-700"
          >
            Siguiente participante
          </button>
        ) : (
          <p className="mt-6 text-sm text-emerald-800">
            Ya puede guardar su teléfono. Al terminar el curso el relator le indicará cómo responder
            la evaluación.
          </p>
        )}
      </div>
    )
  }

  // ---- Registro aún no habilitado ----
  if (!habilitado) {
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 text-center">
        <h2 className="text-lg font-bold text-amber-900">
          {estadoSesion === 'CERRADA' ? 'Sesión cerrada' : 'Registro no habilitado todavía'}
        </h2>
        <p className="mt-2 text-sm text-amber-800">
          {estadoSesion === 'CERRADA'
            ? 'El relator ya cerró esta sesión. Si necesita registrarse, pídale que la reabra.'
            : 'El relator habilitará el registro al comenzar la clase. Mantenga esta página abierta.'}
        </p>
      </div>
    )
  }

  // ---- Formulario ----
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="nombre" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Nombre completo <span className="text-red-600">*</span>
        </label>
        <input
          id="nombre"
          type="text"
          autoComplete="name"
          autoCapitalize="words"
          placeholder="Ej: Juan Pérez González"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          className="w-full rounded-xl border-2 border-slate-300 px-4 py-3.5 text-lg outline-none transition focus:border-marca-500"
        />
      </div>

      <CampoRut
        value={form.rut}
        onChange={(v, ok) => {
          setForm({ ...form, rut: v })
          setRutValido(ok)
        }}
        required
      />

      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700">
          Antecedentes (empresa, cargo, escolaridad)
        </summary>
        <div className="space-y-4 border-t border-slate-100 px-4 py-4">
          <div>
            <label htmlFor="empresa" className="mb-1 block text-sm font-medium text-slate-600">
              Empresa o institución
            </label>
            <input
              id="empresa"
              type="text"
              value={form.empresa}
              onChange={(e) => setForm({ ...form, empresa: e.target.value })}
              className="w-full rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500"
            />
          </div>
          <div>
            <label htmlFor="cargo" className="mb-1 block text-sm font-medium text-slate-600">
              Cargo que desempeña
            </label>
            <input
              id="cargo"
              type="text"
              value={form.cargo}
              onChange={(e) => setForm({ ...form, cargo: e.target.value })}
              className="w-full rounded-lg border-2 border-slate-300 px-3 py-2.5 outline-none focus:border-marca-500"
            />
          </div>
          <div>
            <label htmlFor="escolaridad" className="mb-1 block text-sm font-medium text-slate-600">
              Nivel de escolaridad
            </label>
            <select
              id="escolaridad"
              value={form.nivelEscolaridad}
              onChange={(e) => setForm({ ...form, nivelEscolaridad: e.target.value })}
              className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-marca-500"
            >
              <option value="">Seleccione…</option>
              {NIVELES_ESCOLARIDAD.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </details>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-700">
          Firma <span className="text-red-600">*</span>
        </p>
        <CanvasFirma
          ref={firmaRef}
          onCambio={setTieneFirma}
          alto={modoKiosco ? 260 : 200}
          etiqueta={modoKiosco ? 'Firme aquí con el lápiz' : 'Firme aquí con el dedo'}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={!puedeEnviar}
        onClick={enviar}
        className="w-full rounded-xl bg-marca-600 px-6 py-4 text-lg font-bold text-white transition active:bg-marca-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
      >
        {enviando ? 'Registrando…' : 'Confirmar asistencia'}
      </button>

      {!puedeEnviar && !enviando && (
        <p className="text-center text-sm text-slate-500">
          {form.nombre.trim().length < 3
            ? 'Ingrese su nombre completo'
            : !rutValido
              ? 'Ingrese un RUT válido'
              : 'Falta su firma'}
        </p>
      )}
    </div>
  )
}
