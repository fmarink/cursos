import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import QRCode from 'qrcode'
import { db } from '@/db'
import {
  adjuntos,
  bloquesPrograma,
  expedientes,
  plantillasEvaluacion,
  plantillasEncuesta,
} from '@/db/schema'
import { sesionActual } from '@/lib/auth'
import { contenidosDeSesion, encuestasDeSesion, registrosDeSesion, resumir } from '@/lib/registros'
import { nombreLugar, sesionConContexto } from '@/lib/sesiones'
import { qrEsAlcanzableDesdeCelular, urlPublica } from '@/lib/url'
import { alumnosLibres, conciliacionDeSesion } from '@/lib/conciliacion'
import { Estado, formatearFecha } from '@/components/ui'
import PanelProfesor from './PanelProfesor'

export const dynamic = 'force-dynamic'

export default async function PaginaSesion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = (await sesionActual())!
  const ctx = await sesionConContexto(id)
  if (!ctx) notFound()

  if (usuario.rol === 'PROFESOR' && ctx.sesion.profesorId !== usuario.profesorId) {
    notFound()
  }

  const base = await urlPublica()
  const urlAsistencia = `${base}/a/${ctx.sesion.tokenAsistencia}`
  const urlEvaluacion = `${base}/e/${ctx.sesion.tokenEvaluacion}`
  const urlEncuesta = `${base}/s/${ctx.sesion.tokenEncuesta}`

  const [qrAsistencia, qrEvaluacion, qrEncuesta] = await Promise.all([
    QRCode.toDataURL(urlAsistencia, { width: 520, margin: 1, errorCorrectionLevel: 'M' }),
    QRCode.toDataURL(urlEvaluacion, { width: 520, margin: 1, errorCorrectionLevel: 'M' }),
    QRCode.toDataURL(urlEncuesta, { width: 520, margin: 1, errorCorrectionLevel: 'M' }),
  ])

  const [
    registros,
    contenidos,
    encuestas,
    fotos,
    expedientesSesion,
    plantillasEval,
    plantillasEnc,
    programa,
  ] = await Promise.all([
    registrosDeSesion(id, ctx.curso.id),
    contenidosDeSesion(id),
    encuestasDeSesion(id),
    db.select().from(adjuntos).where(eq(adjuntos.sesionId, id)),
    db.select().from(expedientes).where(eq(expedientes.sesionId, id)),
    db.select().from(plantillasEvaluacion).where(eq(plantillasEvaluacion.activa, true)),
    db.select().from(plantillasEncuesta).where(eq(plantillasEncuesta.activa, true)),
    db
      .select({ id: bloquesPrograma.id })
      .from(bloquesPrograma)
      .where(eq(bloquesPrograma.tipoCursoId, ctx.curso.tipoCursoId))
      .limit(1),
  ])

  const resumen = resumir(registros, ctx.curso.nominaEsperada)

  const [filasConciliacion, libres] = await Promise.all([
    conciliacionDeSesion(id, ctx.curso.id),
    alumnosLibres(ctx.curso.id),
  ])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm font-medium text-marca-600 hover:underline">
            ← Tablero
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{ctx.curso.nombreActividad}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {ctx.cliente.razonSocial} · {formatearFecha(ctx.sesion.fecha, true)} ·{' '}
            {ctx.sesion.horaInicio}–{ctx.sesion.horaFin} · {nombreLugar(ctx.curso, ctx.lugar)}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            Relator: {ctx.profesor?.nombre ?? 'sin asignar'} · {ctx.curso.horas} horas ·{' '}
            {ctx.curso.codigo}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Estado valor={ctx.sesion.estado} />
          <Estado valor={ctx.curso.estado} />
        </div>
      </header>

      <PanelProfesor
        sesionId={id}
        cursoId={ctx.curso.id}
        estadoInicial={{
          estado: ctx.sesion.estado,
          asistenciaAbierta: ctx.sesion.asistenciaAbierta,
          evaluacionAbierta: ctx.sesion.evaluacionAbierta,
          encuestaAbierta: ctx.sesion.encuestaAbierta,
          resumen,
          registros,
        }}
        qr={{ asistencia: qrAsistencia, evaluacion: qrEvaluacion, encuesta: qrEncuesta }}
        urls={{ asistencia: urlAsistencia, evaluacion: urlEvaluacion, encuesta: urlEncuesta }}
        qrAlcanzable={qrEsAlcanzableDesdeCelular(base)}
        contenidos={contenidos}
        hayPrograma={programa.length > 0}
        fotos={fotos.map((f) => ({ id: f.id, tipo: f.tipo, nombre: f.nombre, datos: f.datos }))}
        encuestasRecibidas={encuestas.length}
        expedienteGenerado={expedientesSesion.length > 0}
        expedienteEnviado={expedientesSesion.some((e) => e.enviadoEn !== null)}
        motivoReapertura={ctx.sesion.motivoReapertura}
        tienePlantillaEval={plantillasEval.length > 0}
        tienePlantillaEnc={plantillasEnc.length > 0}
        esGestion={usuario.rol !== 'PROFESOR'}
        conciliacion={filasConciliacion.map((f) => ({
          nominaItemId: f.nominaItemId,
          participanteId: f.participanteId,
          nombreNomina: f.nombreNomina,
          rutNomina: f.rutNomina,
          nombreRegistrado: f.nombreRegistrado,
          rutRegistrado: f.rutRegistrado,
          empresa: f.empresa,
          cargo: f.cargo,
          hora: f.registradoEn
            ? new Date(f.registradoEn).toLocaleTimeString('es-CL', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'America/Santiago',
              })
            : null,
          tieneFirma: f.tieneFirma,
          origen: f.origen,
          vinculadoPor: f.vinculadoPor,
          situacion: f.situacion,
        }))}
        alumnosLibres={libres.map((a) => ({ id: a.id, nombre: a.nombre }))}
      />
    </div>
  )
}
