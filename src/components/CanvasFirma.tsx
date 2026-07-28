'use client'

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

export type Trazo = { x: number; y: number; p: number; t: number }[]

export type ManejadorFirma = {
  limpiar: () => void
  estaVacia: () => boolean
  exportarPng: () => string | null
  exportarTrazos: () => Trazo[]
}

type Props = {
  /** Se llama cada vez que la firma pasa de vacía a con contenido y viceversa. */
  onCambio?: (tieneContenido: boolean) => void
  alto?: number
  ref?: React.Ref<ManejadorFirma>
  etiqueta?: string
}

/**
 * Canvas de firma con soporte para dedo (celular), lápiz óptico (tablet) y
 * mouse. Usa Pointer Events, que unifica los tres, y aprovecha la presión del
 * lápiz cuando el dispositivo la reporta.
 *
 * Guarda dos representaciones:
 *  - PNG con fondo transparente, para incrustar en el expediente.
 *  - Trazos vectoriales con presión y timestamp, para re-render y peritaje.
 */
export default function CanvasFirma({ onCambio, alto = 200, ref, etiqueta }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trazosRef = useRef<Trazo[]>([])
  const trazoActual = useRef<Trazo | null>(null)
  const dibujando = useRef(false)
  const inicioRef = useRef<number>(0)
  const [tieneContenido, setTieneContenido] = useState(false)

  // El canvas se dimensiona en píxeles físicos para que la firma no salga
  // pixelada en pantallas de alta densidad.
  const ajustarTamano = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0) return

    // Preserva lo dibujado al redimensionar (ej. rotar el dispositivo).
    const previo = trazosRef.current.length > 0 ? canvas.toDataURL() : null

    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'

    if (previo) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
      img.src = previo
    }
  }, [])

  useEffect(() => {
    ajustarTamano()
    window.addEventListener('resize', ajustarTamano)
    window.addEventListener('orientationchange', ajustarTamano)
    return () => {
      window.removeEventListener('resize', ajustarTamano)
      window.removeEventListener('orientationchange', ajustarTamano)
    }
  }, [ajustarTamano])

  const posicion = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const grosor = (presion: number, tipo: string) => {
    // El dedo no reporta presión útil: se usa un grosor fijo cómodo.
    if (tipo !== 'pen') return 2.4
    return 0.8 + presion * 3.2
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.setPointerCapture(e.pointerId)
    dibujando.current = true
    if (inicioRef.current === 0) inicioRef.current = Date.now()

    const { x, y } = posicion(e)
    const p = e.pressure > 0 ? e.pressure : 0.5
    trazoActual.current = [{ x, y, p, t: Date.now() - inicioRef.current }]

    ctx.beginPath()
    ctx.lineWidth = grosor(p, e.pointerType)
    ctx.moveTo(x, y)
    // Un toque sin arrastre igual deja marca.
    ctx.lineTo(x + 0.1, y)
    ctx.stroke()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !trazoActual.current) return

    const { x, y } = posicion(e)
    const p = e.pressure > 0 ? e.pressure : 0.5
    trazoActual.current.push({ x, y, p, t: Date.now() - inicioRef.current })

    ctx.lineWidth = grosor(p, e.pointerType)
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const terminarTrazo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return
    dibujando.current = false
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* el puntero ya pudo haberse liberado */
    }
    if (trazoActual.current && trazoActual.current.length > 0) {
      trazosRef.current.push(trazoActual.current)
      if (!tieneContenido) {
        setTieneContenido(true)
        onCambio?.(true)
      }
    }
    trazoActual.current = null
  }

  const limpiar = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      const dpr = window.devicePixelRatio || 1
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    }
    trazosRef.current = []
    trazoActual.current = null
    inicioRef.current = 0
    setTieneContenido(false)
    onCambio?.(false)
  }, [onCambio])

  useImperativeHandle(
    ref,
    () => ({
      limpiar,
      estaVacia: () => trazosRef.current.length === 0,
      exportarPng: () => canvasRef.current?.toDataURL('image/png') ?? null,
      exportarTrazos: () => trazosRef.current,
    }),
    [limpiar],
  )

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          className="canvas-firma block w-full"
          style={{ height: alto }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={terminarTrazo}
          onPointerCancel={terminarTrazo}
          onPointerLeave={terminarTrazo}
        />
        {!tieneContenido && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <svg
              className="mb-1 h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
              />
            </svg>
            <span className="text-sm">{etiqueta ?? 'Firme aquí con el dedo'}</span>
          </div>
        )}
        {/* Línea de firma, como en el libro de papel. */}
        <div className="pointer-events-none absolute inset-x-8 bottom-9 border-b border-slate-200" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {tieneContenido ? 'Firma registrada' : 'Aún sin firmar'}
        </p>
        <button
          type="button"
          onClick={limpiar}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 active:bg-slate-200"
        >
          Borrar y firmar de nuevo
        </button>
      </div>
    </div>
  )
}
