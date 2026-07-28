import { notFound } from 'next/navigation'
import { sesionActual } from '@/lib/auth'
import { nombreLugar, sesionConContexto } from '@/lib/sesiones'
import Kiosco from './Kiosco'

export const dynamic = 'force-dynamic'

/**
 * Modo kiosco para la tablet del relator.
 *
 * La sesión del relator se mantiene abierta durante todo el curso: la tablet
 * pasa de mano en mano sin cerrar sesión entre participante y participante. Al
 * confirmar, el formulario se limpia solo y queda listo para el siguiente.
 */
export default async function PaginaKiosco({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = (await sesionActual())!
  const ctx = await sesionConContexto(id)
  if (!ctx) notFound()
  if (usuario.rol === 'PROFESOR' && ctx.sesion.profesorId !== usuario.profesorId) notFound()

  const habilitado =
    ctx.sesion.asistenciaAbierta &&
    (ctx.sesion.estado === 'ABIERTA' || ctx.sesion.estado === 'REABIERTA')

  return (
    <Kiosco
      sesionId={id}
      token={ctx.sesion.tokenAsistencia}
      habilitado={habilitado}
      estadoSesion={ctx.sesion.estado}
      curso={ctx.curso.nombreActividad}
      cliente={ctx.cliente.razonSocial}
      lugar={nombreLugar(ctx.curso, ctx.lugar)}
      relator={ctx.profesor?.nombre ?? null}
    />
  )
}
