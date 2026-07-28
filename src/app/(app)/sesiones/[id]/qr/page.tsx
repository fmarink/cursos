import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { sesionActual } from '@/lib/auth'
import { sesionConContexto } from '@/lib/sesiones'
import { urlPublica } from '@/lib/url'
import PantallaQR from './PantallaQR'

export const dynamic = 'force-dynamic'

export default async function PaginaQR({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tipo?: string }>
}) {
  const { id } = await params
  const { tipo } = await searchParams
  const usuario = (await sesionActual())!
  const ctx = await sesionConContexto(id)
  if (!ctx) notFound()
  if (usuario.rol === 'PROFESOR' && ctx.sesion.profesorId !== usuario.profesorId) notFound()

  const base = await urlPublica()
  const proposito = tipo === 'evaluacion' ? 'evaluacion' : tipo === 'encuesta' ? 'encuesta' : 'asistencia'
  const ruta =
    proposito === 'evaluacion' ? 'e' : proposito === 'encuesta' ? 's' : 'a'
  const token =
    proposito === 'evaluacion'
      ? ctx.sesion.tokenEvaluacion
      : proposito === 'encuesta'
        ? ctx.sesion.tokenEncuesta
        : ctx.sesion.tokenAsistencia

  const url = `${base}/${ruta}/${token}`
  // Alta corrección de errores: el QR se proyecta y a veces se lee de lejos o
  // con reflejo en la pantalla.
  const qr = await QRCode.toDataURL(url, { width: 1400, margin: 2, errorCorrectionLevel: 'H' })

  return (
    <PantallaQR
      qr={qr}
      url={url}
      proposito={proposito}
      curso={ctx.curso.nombreActividad}
      cliente={ctx.cliente.razonSocial}
      sesionId={id}
      habilitado={
        proposito === 'evaluacion'
          ? ctx.sesion.evaluacionAbierta
          : proposito === 'encuesta'
            ? ctx.sesion.encuestaAbierta
            : ctx.sesion.asistenciaAbierta
      }
    />
  )
}
