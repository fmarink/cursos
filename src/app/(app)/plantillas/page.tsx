import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  clientes,
  plantillasEncuesta,
  plantillasEvaluacion,
  preguntas,
  preguntasEncuesta,
  tiposCurso,
} from '@/db/schema'
import { requerirRol } from '@/lib/auth'
import GestionPlantillas from './GestionPlantillas'

export const dynamic = 'force-dynamic'

export default async function PaginaPlantillas() {
  await requerirRol('ADMIN', 'OPERACIONES')

  const [evaluaciones, todasPreguntas, encuestas, todasPreguntasEnc, tipos, listaClientes] =
    await Promise.all([
      db.select().from(plantillasEvaluacion).orderBy(asc(plantillasEvaluacion.nombre)),
      db.select().from(preguntas).orderBy(asc(preguntas.plantillaId), asc(preguntas.orden)),
      db.select().from(plantillasEncuesta).orderBy(asc(plantillasEncuesta.nombre)),
      db
        .select()
        .from(preguntasEncuesta)
        .orderBy(asc(preguntasEncuesta.plantillaId), asc(preguntasEncuesta.orden)),
      db.select().from(tiposCurso).where(eq(tiposCurso.activo, true)).orderBy(asc(tiposCurso.nombre)),
      db.select().from(clientes).where(eq(clientes.activo, true)).orderBy(asc(clientes.razonSocial)),
    ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Plantillas</h1>
        <p className="mt-1 text-sm text-slate-500">
          La prueba escrita y la encuesta de satisfacción que se aplican en los cursos. Sin al menos
          una de cada una, los interruptores correspondientes aparecen deshabilitados en la sala.
        </p>
      </div>

      <GestionPlantillas
        evaluaciones={evaluaciones.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          tipoCursoId: p.tipoCursoId ?? '',
          clienteId: p.clienteId ?? '',
          umbralAprobacion: String(p.umbralAprobacion),
          exigencia: p.exigencia,
          activa: p.activa,
          preguntas: todasPreguntas
            .filter((q) => q.plantillaId === p.id)
            .map((q) => ({
              id: q.id,
              orden: q.orden,
              enunciado: q.enunciado,
              tipo: q.tipo,
              opciones: (q.opciones as string[] | null) ?? [],
              respuestaCorrecta: q.respuestaCorrecta ?? '',
              puntaje: q.puntaje,
            })),
        }))}
        encuestas={encuestas.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          escalaMin: p.escalaMin,
          escalaMax: p.escalaMax,
          anonima: p.anonima,
          activa: p.activa,
          preguntas: todasPreguntasEnc
            .filter((q) => q.plantillaId === p.id)
            .map((q) => ({ id: q.id, orden: q.orden, enunciado: q.enunciado, tipo: q.tipo })),
        }))}
        tipos={tipos.map((t) => ({ id: t.id, nombre: t.nombre }))}
        clientes={listaClientes.map((c) => ({ id: c.id, nombre: c.razonSocial }))}
      />
    </div>
  )
}
