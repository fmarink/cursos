import { notFound } from 'next/navigation'
import { buscarSesionPorToken, nombreLugar } from '@/lib/sesiones'
import { listaDelCurso, paraElParticipante } from '@/lib/conciliacion'
import FormularioAsistencia from './FormularioAsistencia'

export const dynamic = 'force-dynamic'

export default async function PaginaAsistencia({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ kiosco?: string }>
}) {
  const { token } = await params
  const { kiosco } = await searchParams
  const ctx = await buscarSesionPorToken(token, 'asistencia')
  if (!ctx) notFound()

  // Solo nombre y disponibilidad viajan al navegador. El RUT nunca.
  const lista = paraElParticipante(await listaDelCurso(ctx.curso.id))

  const fecha = new Date(`${ctx.sesion.fecha}T12:00:00`).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-10 pt-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-marca-600">Uppercap</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-900">
          {ctx.curso.nombreActividad}
        </h1>
        <dl className="mt-3 space-y-1 text-sm text-slate-600">
          <div className="flex gap-2">
            <dt className="font-medium text-slate-500">Cliente:</dt>
            <dd>{ctx.cliente.razonSocial}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-slate-500">Fecha:</dt>
            <dd className="first-letter:uppercase">{fecha}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-medium text-slate-500">Lugar:</dt>
            <dd>{nombreLugar(ctx.curso, ctx.lugar)}</dd>
          </div>
          {ctx.profesor && (
            <div className="flex gap-2">
              <dt className="font-medium text-slate-500">Relator:</dt>
              <dd>{ctx.profesor.nombre}</dd>
            </div>
          )}
        </dl>
      </header>

      <FormularioAsistencia
        token={token}
        modoKiosco={kiosco === '1'}
        habilitado={
          ctx.sesion.asistenciaAbierta &&
          (ctx.sesion.estado === 'ABIERTA' || ctx.sesion.estado === 'REABIERTA')
        }
        estadoSesion={ctx.sesion.estado}
        lista={lista}
      />

      <footer className="mt-8 rounded-xl bg-slate-100 p-4 text-xs leading-relaxed text-slate-600">
        <p className="mb-1 font-semibold text-slate-700">Tratamiento de datos personales</p>
        <p>
          Uppercap registra su nombre, RUT y firma con el único fin de acreditar su asistencia y
          aprobación de este curso ante {ctx.cliente.razonSocial}. Los datos se conservan según la
          política de retención vigente y se tratan conforme a la Ley 19.628 y la Ley 21.719. Su
          firma constituye firma electrónica simple según la Ley 19.799. Puede solicitar acceso,
          rectificación o eliminación escribiendo a Uppercap.
        </p>
      </footer>
    </main>
  )
}
