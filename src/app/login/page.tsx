import { redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth'
import FormularioLogin from './FormularioLogin'

export const dynamic = 'force-dynamic'

export default async function PaginaLogin() {
  if (await sesionActual()) redirect('/')

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-marca-600">Uppercap</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Registro digital de cursos</h1>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <FormularioLogin />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          Los participantes no necesitan cuenta: acceden escaneando el código QR de su sesión.
        </p>
      </div>
    </main>
  )
}
