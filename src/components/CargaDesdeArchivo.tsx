'use client'

import { useRef, useState, useTransition } from 'react'

export type ProblemaVista = { fila: number; mensaje: string }

export type ResultadoAnalisis<T> =
  | { ok: true; filas: T[]; problemas: ProblemaVista[]; columnasIgnoradas: string[] }
  | { ok: false; error: string }

export type Modo = 'AGREGAR' | 'REEMPLAZAR'

/**
 * Carga por archivo, igual para todas las entidades.
 *
 * El principio es uno solo: **nada se guarda hasta que la persona vea lo que el
 * sistema entendió**. Primero se analiza el archivo y se muestra fila por fila
 * lo detectado, junto con los problemas y su número de fila real de la
 * planilla; recién ahí aparece el botón que guarda. Un archivo mal armado se
 * descubre antes de ensuciar los datos, no después.
 */
export default function CargaDesdeArchivo<T extends { fila: number }>({
  titulo,
  descripcion,
  etiquetaBoton = 'Cargar desde archivo',
  urlPlantilla,
  nombre,
  analizar,
  confirmar,
  fila: Fila,
  existentes = 0,
  textoReemplazar,
  compacto = false,
}: {
  titulo: string
  descripcion: string
  etiquetaBoton?: string
  urlPlantilla: string
  /** Cómo llamar a lo que se carga, para redactar los mensajes. */
  nombre: { uno: string; varios: string }
  analizar: (fd: FormData) => Promise<ResultadoAnalisis<T>>
  confirmar: (filas: T[], modo: Modo) => Promise<{ ok: boolean; error?: string }>
  fila: (props: { dato: T }) => React.ReactNode
  /** Cuántos hay ya; si es 0 no se pregunta por agregar o reemplazar. */
  existentes?: number
  /** Cómo describir el reemplazo, si aplica. */
  textoReemplazar?: string
  compacto?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [filas, setFilas] = useState<T[] | null>(null)
  const [problemas, setProblemas] = useState<ProblemaVista[]>([])
  const [ignoradas, setIgnoradas] = useState<string[]>([])
  const [modo, setModo] = useState<Modo>('AGREGAR')
  const input = useRef<HTMLInputElement>(null)

  function limpiar() {
    setFilas(null)
    setProblemas([])
    setIgnoradas([])
    setError(null)
    setNombreArchivo('')
    setModo('AGREGAR')
    if (input.current) input.current.value = ''
  }

  function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setError(null)
    setFilas(null)
    setProblemas([])
    setIgnoradas([])
    setNombreArchivo(archivo.name)

    // El input se vacía apenas se lee el archivo. Si no, volver a elegir el
    // MISMO archivo después de corregirlo no dispara el evento y parece que la
    // aplicación se quedó pegada.
    e.target.value = ''

    const fd = new FormData()
    fd.append('archivo', archivo)
    iniciar(async () => {
      const r = await analizar(fd)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setFilas(r.filas)
      setProblemas(r.problemas)
      setIgnoradas(r.columnasIgnoradas)
    })
  }

  function guardar() {
    if (!filas || filas.length === 0) return
    setError(null)
    iniciar(async () => {
      const r = await confirmar(filas, modo)
      if (!r.ok) {
        setError(r.error ?? 'No se pudo guardar.')
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
        className={`rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50 ${
          compacto ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm'
        }`}
      >
        ⬆ {etiquetaBoton}
      </button>
    )
  }

  return (
    <div className="w-full rounded-xl border-2 border-marca-200 bg-marca-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-bold text-slate-900">{titulo}</h4>
          <p className="mt-0.5 text-sm text-slate-600">{descripcion}</p>
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
            onChange={alElegir}
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

      {ignoradas.length > 0 && (
        <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold">Columnas que no se usan:</span> {ignoradas.join(', ')}. Los
          datos se cargan igual; avise si alguna debería conservarse.
        </p>
      )}

      {problemas.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-sm font-bold text-amber-900">
            {problemas.length} fila{problemas.length === 1 ? '' : 's'} con problemas — no se
            {problemas.length === 1 ? ' cargará' : ' cargarán'}:
          </p>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-sm text-amber-900">
            {problemas.map((p, i) => (
              <li key={i}>
                {p.fila > 0 ? `Fila ${p.fila}: ` : ''}
                {p.mensaje}
              </li>
            ))}
          </ul>
        </div>
      )}

      {filas && filas.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-bold text-slate-900">
            {filas.length} {filas.length === 1 ? nombre.uno : nombre.varios} para cargar:
          </p>

          <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-lg bg-white p-3 ring-1 ring-slate-200">
            {filas.map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 w-8 shrink-0 text-xs tabular-nums text-slate-400">
                  f.{d.fila}
                </span>
                <div className="min-w-0 flex-1">
                  <Fila dato={d} />
                </div>
              </li>
            ))}
          </ul>

          {existentes > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-sm font-semibold text-slate-700">
                Ya hay {existentes}. ¿Qué hago con {existentes === 1 ? 'ese' : 'esos'}?
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name={`modo-${urlPlantilla}`}
                  checked={modo === 'AGREGAR'}
                  onChange={() => setModo('AGREGAR')}
                />
                Mantenerlos y agregar los del archivo
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name={`modo-${urlPlantilla}`}
                  checked={modo === 'REEMPLAZAR'}
                  onChange={() => setModo('REEMPLAZAR')}
                />
                {textoReemplazar ?? 'Borrarlos y dejar solo los del archivo'}
              </label>
            </div>
          )}

          <button
            disabled={pendiente}
            onClick={guardar}
            className="mt-3 rounded-lg bg-marca-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
          >
            {modo === 'REEMPLAZAR'
              ? `Reemplazar por ${filas.length}`
              : `Cargar ${filas.length} ${filas.length === 1 ? nombre.uno : nombre.varios}`}
          </button>
        </div>
      )}
    </div>
  )
}
