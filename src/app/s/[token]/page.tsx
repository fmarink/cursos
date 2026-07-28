import { notFound } from 'next/navigation'
import { buscarSesionPorToken } from '@/lib/sesiones'
import { preguntasDeEncuesta, resolverPlantillaEncuesta } from '@/lib/plantillas'
import FormularioEncuesta from './FormularioEncuesta'

export const dynamic = 'force-dynamic'

export default async function PaginaEncuesta({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const ctx = await buscarSesionPorToken(token, 'encuesta')
  if (!ctx) notFound()

  const habilitada =
    ctx.sesion.encuestaAbierta &&
    (ctx.sesion.estado === 'ABIERTA' || ctx.sesion.estado === 'REABIERTA')

  const plantilla = await resolverPlantillaEncuesta(ctx.sesion.plantillaEncuestaId)
  const listaPreguntas = plantilla ? await preguntasDeEncuesta(plantilla.id) : []

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-10 pt-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-marca-600">Uppercap</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-900">
          Encuesta de satisfacción
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {ctx.curso.nombreActividad} · {ctx.cliente.razonSocial}
        </p>
      </header>

      {!habilitada ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 text-center">
          <h2 className="text-lg font-bold text-amber-900">Encuesta no habilitada</h2>
          <p className="mt-2 text-sm text-amber-800">
            El relator la habilitará al finalizar el curso.
          </p>
        </div>
      ) : !plantilla || listaPreguntas.length === 0 ? (
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-6 text-center">
          <h2 className="text-lg font-bold text-slate-800">Sin encuesta configurada</h2>
        </div>
      ) : (
        <FormularioEncuesta
          token={token}
          anonima={plantilla.anonima}
          escalaMin={plantilla.escalaMin}
          escalaMax={plantilla.escalaMax}
          preguntas={listaPreguntas.map((p) => ({
            id: p.id,
            enunciado: p.enunciado,
            tipo: p.tipo,
          }))}
        />
      )}
    </main>
  )
}
