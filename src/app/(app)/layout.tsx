import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sesionActual } from '@/lib/auth'
import { salir } from '../login/acciones'

export const dynamic = 'force-dynamic'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await sesionActual()
  if (!usuario) redirect('/login')

  const esGestion = usuario.rol === 'ADMIN' || usuario.rol === 'OPERACIONES'

  return (
    <div className="min-h-dvh">
      <header className="no-imprimir sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <Link href="/" className="shrink-0">
            <span className="text-sm font-bold uppercase tracking-[0.18em] text-marca-600">
              Uppercap
            </span>
          </Link>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
            <Enlace href="/">Tablero</Enlace>
            <Enlace href="/cursos">Cursos</Enlace>
            {esGestion && (
              <>
                <Enlace href="/profesores">Profesores</Enlace>
                <Enlace href="/clientes">Clientes</Enlace>
                <Enlace href="/plantillas">Plantillas</Enlace>
              </>
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-slate-800">{usuario.nombre}</p>
              <p className="text-xs capitalize text-slate-500">
                {usuario.rol.toLowerCase().replace('_', ' ')}
              </p>
            </div>
            <form action={salir}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap rounded-lg px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
    >
      {children}
    </Link>
  )
}
