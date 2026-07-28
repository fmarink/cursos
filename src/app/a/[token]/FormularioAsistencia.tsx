'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import CampoRut from '@/components/CampoRut'
import CanvasFirma, { type ManejadorFirma } from '@/components/CanvasFirma'
import { NIVELES_ESCOLARIDAD } from '@/lib/constantes'
import { registrarAsistencia } from './acciones'

export type AlumnoEnLista = { id: string; nombre: string; tomado: boolean; pideRut: boolean }

type Props = {
  token: string
  habilitado: boolean
  estadoSesion: string
  modoKiosco: boolean
  /** Lista del curso. Vacía cuando el cliente no envió nómina. */
  lista: AlumnoEnLista[]
}

const VACIO = {
  nombre: '',
  rut: '',
  empresa: '',
  cargo: '',
  nivelEscolaridad: '',
}

/**
 * Flujo del participante.
 *
 * Con lista cargada son dos pasos: encuentra su nombre y firma. Ese es el caso
 * normal y el más rápido — el RUT ya viene de la nómina, así que no lo escribe
 * nadie y no hay errores de tipeo que corregir después.
 *
 * Quien no aparezca en la lista escribe sus datos. Nunca se le bloquea: el
 * registro entra marcado y el instructor lo empareja desde su panel.
 */
export default function FormularioAsistencia({
  token,
  habilitado,
  estadoSesion,
  modoKiosco,
  lista,
}: Props) {
  const hayLista = lista.length > 0

  const [paso, setPaso] = useState<'lista' | 'datos'>(hayLista ? 'lista' : 'datos')
  const [elegido, setElegido] = useState<AlumnoEnLista | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [form, setForm] = useState(VACIO)
  const [rutValido, setRutValido] = useState(false)
  const [tieneFirma, setTieneFirma] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<{ nombre: string; hora: string; yaEstaba: boolean } | null>(
    null,
  )
  const [enviando, iniciarEnvio] = useTransition()
  const firmaRef = useRef<ManejadorFirma>(null)

  const filtrada = useMemo(() => {
    const q = normalizar(busqueda)
    if (!q) return lista
    return lista.filter((a) => normalizar(a.nombre).includes(q))
  }, [lista, busqueda])

  const pendientes = lista.filter((a) => !a.tomado).length

  // Con alumno elegido y RUT en la nómina, basta con firmar.
  const necesitaRut = !elegido || elegido.pideRut
  const nombreOk = elegido ? true : form.nombre.trim().length >= 3
  const rutOk = necesitaRut ? rutValido : true
  const puedeEnviar = nombreOk && rutOk && tieneFirma && !enviando

  function reiniciar() {
    setForm(VACIO)
    setElegido(null)
    setBusqueda('')
    setRutValido(false)
    setTieneFirma(false)
    setError(null)
    setExito(null)
    setPaso(hayLista ? 'lista' : 'datos')
    firmaRef.current?.limpiar()
  }

  function elegirAlumno(a: AlumnoEnLista) {
    if (a.tomado) return
    setElegido(a)
    setForm({ ...VACIO, nombre: a.nombre })
    setRutValido(false)
    setPaso('datos')
  }

  function irAManual() {
    setElegido(null)
    setForm(VACIO)
    setRutValido(false)
    setPaso('datos')
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
        nombre: elegido?.nombre ?? form.nombre,
        rut: necesitaRut ? form.rut : '',
        nominaItemId: elegido?.id ?? '',
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

  // ---- Paso 1: encontrarse en la lista del curso ----
  if (paso === 'lista') {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Busque su nombre en la lista</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Quedan {pendientes} de {lista.length} por registrar.
          </p>
        </div>

        {lista.length > 8 && (
          <input
            type="search"
            inputMode="search"
            autoCapitalize="none"
            placeholder="Escriba parte de su nombre o apellido"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-xl border-2 border-slate-300 px-4 py-3.5 text-lg outline-none focus:border-marca-500"
          />
        )}

        <ul className="space-y-2">
          {filtrada.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={a.tomado}
                onClick={() => elegirAlumno(a)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border-2 px-4 py-4 text-left transition ${
                  a.tomado
                    ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                    : 'border-slate-300 bg-white text-slate-900 active:border-marca-500 active:bg-marca-50'
                }`}
              >
                <span className="text-lg font-medium">{a.nombre}</span>
                {a.tomado ? (
                  <span className="shrink-0 text-sm font-semibold text-emerald-600">
                    ✓ registrado
                  </span>
                ) : (
                  <svg
                    className="h-5 w-5 shrink-0 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                )}
              </button>
            </li>
          ))}
          {filtrada.length === 0 && (
            <li className="rounded-xl bg-slate-100 px-4 py-6 text-center text-sm text-slate-600">
              Ningún nombre coincide con «{busqueda}».
            </li>
          )}
        </ul>

        <button
          type="button"
          onClick={irAManual}
          className="w-full rounded-xl border-2 border-dashed border-slate-300 px-4 py-4 font-semibold text-slate-600 active:bg-slate-100"
        >
          No encuentro mi nombre en la lista
        </button>
      </div>
    )
  }

  // ---- Paso 2: confirmar y firmar ----
  return (
    <div className="space-y-5">
      {elegido ? (
        <div className="rounded-xl border-2 border-marca-300 bg-marca-50 px-4 py-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-marca-700">
            Registrando a
          </p>
          <p className="mt-0.5 text-xl font-bold text-slate-900">{elegido.nombre}</p>
          {hayLista && (
            <button
              type="button"
              onClick={() => setPaso('lista')}
              className="mt-1.5 text-sm font-semibold text-marca-700 underline"
            >
              No soy yo, volver a la lista
            </button>
          )}
        </div>
      ) : (
        <>
          {hayLista && (
            <button
              type="button"
              onClick={() => setPaso('lista')}
              className="text-sm font-semibold text-marca-700 underline"
            >
              ← Volver a la lista del curso
            </button>
          )}
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
        </>
      )}

      {necesitaRut && (
        <CampoRut
          value={form.rut}
          onChange={(v, ok) => {
            setForm({ ...form, rut: v })
            setRutValido(ok)
          }}
          required
        />
      )}

      {!elegido && (
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
      )}

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
          {!nombreOk
            ? 'Ingrese su nombre completo'
            : !rutOk
              ? 'Ingrese un RUT válido'
              : 'Falta su firma'}
        </p>
      )}
    </div>
  )
}

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}
