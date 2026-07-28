'use client'

import { useState } from 'react'
import { formatearMientrasEscribe, validarRut } from '@/lib/rut'

type Props = {
  value: string
  onChange: (valor: string, esValido: boolean) => void
  id?: string
  autoFocus?: boolean
  required?: boolean
}

/**
 * Campo de RUT con formateo progresivo y validación de dígito verificador.
 * El error se muestra recién al salir del campo, para no molestar mientras
 * la persona todavía está escribiendo.
 */
export default function CampoRut({ value, onChange, id = 'rut', autoFocus, required }: Props) {
  const [tocado, setTocado] = useState(false)
  const esValido = validarRut(value)
  const mostrarError = tocado && value.length > 0 && !esValido

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">
        RUT {required && <span className="text-red-600">*</span>}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        autoFocus={autoFocus}
        placeholder="12.345.678-9"
        value={value}
        onChange={(e) => {
          const formateado = formatearMientrasEscribe(e.target.value)
          onChange(formateado, validarRut(formateado))
        }}
        onBlur={() => setTocado(true)}
        aria-invalid={mostrarError}
        aria-describedby={mostrarError ? `${id}-error` : undefined}
        className={`w-full rounded-xl border-2 px-4 py-3.5 text-lg tracking-wide outline-none transition ${
          mostrarError
            ? 'border-red-400 bg-red-50 focus:border-red-500'
            : esValido && value.length > 0
              ? 'border-emerald-400 bg-emerald-50/50 focus:border-emerald-500'
              : 'border-slate-300 focus:border-marca-500'
        }`}
      />
      {mostrarError ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-red-600">
          El RUT no es válido. Revise el número y el dígito verificador.
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-slate-500">
          Se validan los puntos, el guion y el dígito verificador
          automáticamente.
        </p>
      )}
    </div>
  )
}
