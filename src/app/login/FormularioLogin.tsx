'use client'

import { useActionState } from 'react'
import { iniciarSesion } from './acciones'

export default function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, null)

  return (
    <form action={accion} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="w-full rounded-xl border-2 border-slate-300 px-4 py-3 outline-none focus:border-marca-500"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-xl border-2 border-slate-300 px-4 py-3 outline-none focus:border-marca-500"
        />
      </div>

      {estado?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="w-full rounded-xl bg-marca-600 px-4 py-3.5 font-bold text-white transition hover:bg-marca-700 disabled:bg-slate-300"
      >
        {pendiente ? 'Ingresando…' : 'Ingresar'}
      </button>
    </form>
  )
}
