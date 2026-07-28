import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { sesiones } from '@/db/schema'
import { sesionActual } from '@/lib/auth'
import { registrosDeSesion, resumir } from '@/lib/registros'
import { cursos } from '@/db/schema'

export const dynamic = 'force-dynamic'

/**
 * Endpoint de tiempo real para el panel del profesor.
 *
 * Se resuelve con polling corto (3 s) en vez de websockets: el volumen es de
 * ~20 participantes por sala y el polling sobrevive mejor a las redes
 * intermitentes y a los proxies corporativos de faena. Cumple holgadamente el
 * criterio de "aparece en menos de 5 segundos".
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await sesionActual()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  const [fila] = await db
    .select({ sesion: sesiones, curso: cursos })
    .from(sesiones)
    .innerJoin(cursos, eq(sesiones.cursoId, cursos.id))
    .where(eq(sesiones.id, id))
    .limit(1)

  if (!fila) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })

  if (usuario.rol === 'PROFESOR' && fila.sesion.profesorId !== usuario.profesorId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const registros = await registrosDeSesion(id, fila.curso.id)
  const resumen = resumir(registros, fila.curso.nominaEsperada)

  return NextResponse.json(
    {
      estado: fila.sesion.estado,
      asistenciaAbierta: fila.sesion.asistenciaAbierta,
      evaluacionAbierta: fila.sesion.evaluacionAbierta,
      encuestaAbierta: fila.sesion.encuestaAbierta,
      resumen,
      registros,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
