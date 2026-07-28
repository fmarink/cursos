'use client'

import { useMemo, useState, useTransition } from 'react'
import { crearCurso } from '../acciones'
import { hoyEnChile } from '@/lib/fechas'

type Jornada = { fecha: string; horaInicio: string; horaFin: string; profesorId: string }

export default function FormularioCurso({
  clientes,
  tipos,
  lugares,
  profesores,
}: {
  clientes: { id: string; nombre: string }[]
  tipos: { id: string; nombre: string; horas: number; practico: boolean }[]
  lugares: { id: string; nombre: string; clienteId: string | null }[]
  profesores: { id: string; nombre: string }[]
}) {
  const hoy = hoyEnChile()

  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? '')
  const [tipoCursoId, setTipoCursoId] = useState(tipos[0]?.id ?? '')
  const [nombreActividad, setNombreActividad] = useState(tipos[0]?.nombre ?? '')
  const [modalidad, setModalidad] = useState<
    'PRESENCIAL_TEORICO' | 'PRESENCIAL_PRACTICO' | 'PRESENCIAL_MIXTO'
  >('PRESENCIAL_TEORICO')
  const [horas, setHoras] = useState(tipos[0]?.horas ?? 8)
  const [lugarId, setLugarId] = useState('')
  const [lugarLibre, setLugarLibre] = useState('')
  const [nominaEsperada, setNominaEsperada] = useState(0)
  const [nominaTexto, setNominaTexto] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [jornadas, setJornadas] = useState<Jornada[]>([
    { fecha: hoy, horaInicio: '08:00', horaFin: '17:00', profesorId: profesores[0]?.id ?? '' },
  ])
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  const lugaresFiltrados = useMemo(
    () => lugares.filter((l) => !l.clienteId || l.clienteId === clienteId),
    [lugares, clienteId],
  )

  const filasNomina = nominaTexto.split('\n').filter((l) => l.trim().length > 0).length

  function cambiarTipo(id: string) {
    setTipoCursoId(id)
    const t = tipos.find((x) => x.id === id)
    if (t) {
      setHoras(t.horas)
      if (!nombreActividad || tipos.some((x) => x.nombre === nombreActividad)) {
        setNombreActividad(t.nombre)
      }
      setModalidad(t.practico ? 'PRESENCIAL_MIXTO' : 'PRESENCIAL_TEORICO')
    }
  }

  function enviar() {
    setError(null)
    iniciar(async () => {
      const r = await crearCurso({
        nombreActividad,
        clienteId,
        tipoCursoId,
        lugarId,
        lugarLibre,
        modalidad,
        horas,
        nominaEsperada: filasNomina > 0 ? filasNomina : nominaEsperada,
        jornadas,
        nominaTexto,
        observaciones,
      })
      // crearCurso redirige cuando tiene éxito; solo vuelve con error.
      if (r && !r.ok) setError(r.error)
    })
  }

  if (clientes.length === 0 || tipos.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6">
        <p className="font-semibold text-amber-900">Faltan datos base</p>
        <p className="mt-1 text-sm text-amber-800">
          Un curso se arma sobre un cliente y un tipo de curso. Cree lo que falta y vuelva aquí.
        </p>
        <ul className="mt-4 space-y-2">
          {clientes.length === 0 && (
            <li>
              <a
                href="/clientes"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
              >
                Crear el primer cliente →
              </a>
            </li>
          )}
          {tipos.length === 0 && (
            <li>
              <a
                href="/tipos-curso"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
              >
                Crear el primer tipo de curso →
              </a>
            </li>
          )}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Bloque titulo="Actividad">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Cliente">
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className={ESTILO_INPUT}
            >
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Tipo de curso">
            <select
              value={tipoCursoId}
              onChange={(e) => cambiarTipo(e.target.value)}
              className={ESTILO_INPUT}
            >
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Nombre de la actividad" ancho>
            <input
              value={nombreActividad}
              onChange={(e) => setNombreActividad(e.target.value)}
              className={ESTILO_INPUT}
            />
          </Campo>
          <Campo etiqueta="Modalidad">
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as typeof modalidad)}
              className={ESTILO_INPUT}
            >
              <option value="PRESENCIAL_TEORICO">Presencial (Teórico)</option>
              <option value="PRESENCIAL_PRACTICO">Presencial (Práctico)</option>
              <option value="PRESENCIAL_MIXTO">Presencial (Teórico y Práctico)</option>
            </select>
          </Campo>
          <Campo etiqueta="Horas totales">
            <input
              type="number"
              min={1}
              value={horas}
              onChange={(e) => setHoras(Number(e.target.value))}
              className={ESTILO_INPUT}
            />
          </Campo>
        </div>
      </Bloque>

      <Bloque titulo="Lugar de ejecución">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Lugar frecuente">
            <select
              value={lugarId}
              onChange={(e) => {
                setLugarId(e.target.value)
                if (e.target.value) setLugarLibre('')
              }}
              className={ESTILO_INPUT}
            >
              <option value="">Otro (escribir abajo)</option>
              {lugaresFiltrados.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Otro lugar">
            <input
              value={lugarLibre}
              onChange={(e) => {
                setLugarLibre(e.target.value)
                if (e.target.value) setLugarId('')
              }}
              placeholder="Ej: Hotel Open Quillota"
              className={ESTILO_INPUT}
            />
          </Campo>
        </div>
      </Bloque>

      <Bloque titulo="Jornadas">
        <div className="space-y-3">
          {jornadas.map((j, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_1fr_auto]">
              <Campo etiqueta={i === 0 ? 'Fecha' : ''}>
                <input
                  type="date"
                  value={j.fecha}
                  onChange={(e) => actualizar(i, { fecha: e.target.value })}
                  className={ESTILO_INPUT}
                />
              </Campo>
              <Campo etiqueta={i === 0 ? 'Inicio' : ''}>
                <input
                  type="time"
                  value={j.horaInicio}
                  onChange={(e) => actualizar(i, { horaInicio: e.target.value })}
                  className={ESTILO_INPUT}
                />
              </Campo>
              <Campo etiqueta={i === 0 ? 'Término' : ''}>
                <input
                  type="time"
                  value={j.horaFin}
                  onChange={(e) => actualizar(i, { horaFin: e.target.value })}
                  className={ESTILO_INPUT}
                />
              </Campo>
              <Campo etiqueta={i === 0 ? 'Relator' : ''}>
                <select
                  value={j.profesorId}
                  onChange={(e) => actualizar(i, { profesorId: e.target.value })}
                  className={ESTILO_INPUT}
                >
                  <option value="">Sin asignar</option>
                  {profesores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <div className={i === 0 ? 'flex items-end pb-0.5' : 'flex items-start'}>
                {jornadas.length > 1 && (
                  <button
                    onClick={() => setJornadas(jornadas.filter((_, x) => x !== i))}
                    className="rounded-lg px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={() => {
              const ultima = jornadas[jornadas.length - 1]
              const siguiente = new Date(`${ultima.fecha}T12:00:00`)
              siguiente.setDate(siguiente.getDate() + 1)
              setJornadas([
                ...jornadas,
                { ...ultima, fecha: siguiente.toISOString().slice(0, 10) },
              ])
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            + Agregar jornada
          </button>
        </div>
      </Bloque>

      <Bloque titulo="Nómina enviada por el cliente">
        <p className="mb-3 text-sm text-slate-500">
          Pegue la nómina desde Excel o desde el correo. Se usa solo como referencia para conciliar:
          quien no aparezca podrá registrarse igual y quedará marcado para revisión.
        </p>
        <textarea
          value={nominaTexto}
          onChange={(e) => setNominaTexto(e.target.value)}
          rows={6}
          placeholder={'Juan Pérez González\t12.345.678-9\tAnglo American\tMantenedor\nMaría Soto Díaz\t9.876.543-2\tAnglo American\tOperadora'}
          className={`${ESTILO_INPUT} font-mono text-sm`}
        />
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            {filasNomina > 0
              ? `${filasNomina} personas detectadas`
              : 'Sin nómina — puede cargarla después'}
          </span>
          {filasNomina === 0 && (
            <label className="flex items-center gap-2 text-slate-600">
              Participantes esperados
              <input
                type="number"
                min={0}
                value={nominaEsperada}
                onChange={(e) => setNominaEsperada(Number(e.target.value))}
                className="w-20 rounded-lg border-2 border-slate-300 px-2 py-1.5 text-right"
              />
            </label>
          )}
        </div>
      </Bloque>

      <Bloque titulo="Observaciones">
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          placeholder="Condiciones logísticas, alimentación, requerimientos especiales…"
          className={ESTILO_INPUT}
        />
      </Bloque>

      {error && (
        <div
          role="alert"
          className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {error}
        </div>
      )}

      <button
        disabled={pendiente || nombreActividad.trim().length < 3}
        onClick={enviar}
        className="w-full rounded-xl bg-marca-600 px-6 py-4 font-bold text-white hover:bg-marca-700 disabled:bg-slate-300"
      >
        {pendiente ? 'Creando…' : 'Crear curso y generar códigos QR'}
      </button>
    </div>
  )

  function actualizar(i: number, cambios: Partial<Jornada>) {
    setJornadas(jornadas.map((j, x) => (x === i ? { ...j, ...cambios } : j)))
  }
}

const ESTILO_INPUT =
  'w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-marca-500'

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-4 font-bold text-slate-900">{titulo}</h2>
      {children}
    </section>
  )
}

function Campo({
  etiqueta,
  children,
  ancho,
}: {
  etiqueta: string
  children: React.ReactNode
  ancho?: boolean
}) {
  return (
    <div className={ancho ? 'sm:col-span-2' : ''}>
      {etiqueta && (
        <label className="mb-1 block text-sm font-semibold text-slate-700">{etiqueta}</label>
      )}
      {children}
    </div>
  )
}
