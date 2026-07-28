import { notFound } from 'next/navigation'
import { buscarSesionPorToken } from '@/lib/sesiones'
import { preguntasDePlantilla, resolverPlantillaEvaluacion } from '@/lib/plantillas'
import FormularioEvaluacion from './FormularioEvaluacion'

export const dynamic = 'force-dynamic'

export default async function PaginaEvaluacion({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const ctx = await buscarSesionPorToken(token, 'evaluacion')
  if (!ctx) notFound()

  const habilitada =
    ctx.sesion.evaluacionAbierta &&
    (ctx.sesion.estado === 'ABIERTA' || ctx.sesion.estado === 'REABIERTA')

  const plantilla = await resolverPlantillaEvaluacion(
    ctx.sesion.plantillaEvaluacionId,
    ctx.curso.tipoCursoId,
    ctx.curso.clienteId,
  )

  const listaPreguntas = plantilla ? await preguntasDePlantilla(plantilla.id) : []

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-10 pt-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-marca-600">Uppercap</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-900">
          Evaluación — {ctx.curso.nombreActividad}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{ctx.cliente.razonSocial}</p>
      </header>

      {!habilitada ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 text-center">
          <h2 className="text-lg font-bold text-amber-900">Evaluación no habilitada</h2>
          <p className="mt-2 text-sm text-amber-800">
            El relator la habilitará al terminar la parte teórica del curso.
          </p>
        </div>
      ) : !plantilla || listaPreguntas.length === 0 ? (
        <div className="rounded-2xl border-2 border-slate-300 bg-white p-6 text-center">
          <h2 className="text-lg font-bold text-slate-800">Sin evaluación configurada</h2>
          <p className="mt-2 text-sm text-slate-600">
            Este curso todavía no tiene una prueba asociada. Avise al relator.
          </p>
        </div>
      ) : (
        <FormularioEvaluacion
          token={token}
          nombrePlantilla={plantilla.nombre}
          umbral={Number(plantilla.umbralAprobacion)}
          preguntas={listaPreguntas.map((p) => ({
            id: p.id,
            enunciado: p.enunciado,
            tipo: p.tipo,
            opciones: (p.opciones as string[] | null) ?? [],
            puntaje: p.puntaje,
          }))}
        />
      )}
    </main>
  )
}
