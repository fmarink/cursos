import Link from 'next/link'
import { notFound } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { auditLog, expedientes } from '@/db/schema'
import { sesionActual } from '@/lib/auth'
import { armarExpediente, problemasBloqueantes } from '@/lib/expediente'
import { Estado, formatearFecha, formatearFechaHora } from '@/components/ui'
import RevisionExpediente from './RevisionExpediente'

export const dynamic = 'force-dynamic'

export default async function PaginaExpediente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = (await sesionActual())!
  const d = await armarExpediente(id)
  if (!d) notFound()
  if (usuario.rol === 'PROFESOR' && d.sesion.profesorId !== usuario.profesorId) notFound()

  const versiones = await db
    .select()
    .from(expedientes)
    .where(eq(expedientes.sesionId, id))
    .orderBy(desc(expedientes.version))

  const ultimo = versiones[0] ?? null

  const auditoria = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.entidadId, id))
    .orderBy(desc(auditLog.timestamp))
    .limit(20)

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/sesiones/${id}`} className="text-sm font-medium text-marca-600 hover:underline">
          ← Volver al panel de la sesión
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Expediente del curso</h1>
            <p className="mt-1 text-sm text-slate-600">
              {d.curso.nombreActividad} · {d.cliente.razonSocial} ·{' '}
              {formatearFecha(d.sesion.fecha, true)}
            </p>
          </div>
          <Estado valor={d.curso.estado} />
        </div>
      </header>

      <RevisionExpediente
        sesionId={id}
        problemas={problemasBloqueantes(d)}
        resumen={{
          participantes: d.vigentes.length,
          conFirma: d.resumen.conFirma,
          sinFirma: d.sinFirma.length,
          alertas: d.alertas.length,
          evaluados: d.resumen.evaluados,
          aprobados: d.resumen.aprobados,
          encuestas: d.encuestas.length,
          contenidos: d.contenidos.length,
          tieneFoto: Boolean(d.fotoGrupal),
        }}
        alertas={d.alertas}
        sinFirma={d.sinFirma.map((r) => ({ id: r.participanteId, nombre: r.nombre, rut: r.rut }))}
        expediente={
          ultimo
            ? {
                version: ultimo.version,
                generadoEn: formatearFechaHora(ultimo.generadoEn),
                generadoPor: ultimo.generadoPor,
                validadoEn: ultimo.validadoEn ? formatearFechaHora(ultimo.validadoEn) : null,
                validadoPor: ultimo.validadoPor,
                enviadoA: ultimo.enviadoA,
                enviadoEn: ultimo.enviadoEn ? formatearFechaHora(ultimo.enviadoEn) : null,
                enviadoPor: ultimo.enviadoPor,
                kb: Math.round(ultimo.bytes / 1024),
              }
            : null
        }
        historial={versiones.slice(1).map((v) => ({
          version: v.version,
          generadoEn: formatearFechaHora(v.generadoEn),
          enviadoEn: v.enviadoEn ? formatearFechaHora(v.enviadoEn) : null,
        }))}
        sugerencia={{
          para: d.cliente.contactoEmail ?? '',
          asunto: `Expediente curso ${d.curso.nombreActividad} — ${formatearFecha(d.sesion.fecha)} — ${d.cliente.razonSocial}`,
        }}
        puedeEnviar={usuario.rol !== 'PROFESOR'}
        auditoria={auditoria.map((a) => ({
          id: a.id,
          accion: a.accion,
          timestamp: formatearFechaHora(a.timestamp),
        }))}
      />
    </div>
  )
}
