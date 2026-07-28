import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { expedientes } from '@/db/schema'
import { auditar } from '@/lib/audit'
import { sesionActual } from '@/lib/auth'
import { armarExpediente } from '@/lib/expediente'
import { generarPdfDesdeUrl } from '@/lib/pdf'
import { urlInterna } from '@/lib/url'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Genera (o devuelve) el PDF del expediente.
 *
 * `?regenerar=1` fuerza una nueva versión: se usa después de resolver alertas
 * o de corregir datos. Cada versión queda guardada, nunca se pisa la anterior.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await sesionActual()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const url = new URL(req.url)
  const regenerar = url.searchParams.get('regenerar') === '1'
  const descargar = url.searchParams.get('descargar') === '1'

  const datos = await armarExpediente(id)
  if (!datos) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })

  if (usuario.rol === 'PROFESOR' && datos.sesion.profesorId !== usuario.profesorId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // ¿Ya existe una versión vigente?
  const [ultimo] = await db
    .select()
    .from(expedientes)
    .where(eq(expedientes.sesionId, id))
    .orderBy(desc(expedientes.version))
    .limit(1)

  if (ultimo?.pdfBase64 && !regenerar) {
    return responder(Buffer.from(ultimo.pdfBase64, 'base64'), datos.curso.codigo, descargar)
  }

  // --- Generar ---
  const base = urlInterna()
  const store = await cookies()
  const cookie = store.get('uppercap_sesion')
  if (!cookie) return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 })

  let pdf: Buffer
  try {
    pdf = await generarPdfDesdeUrl(`${base}/expediente/${id}`, {
      name: cookie.name,
      value: cookie.value,
      domain: new URL(base).hostname,
    })
  } catch (e) {
    console.error('[expediente] falló la generación del PDF', e)
    return NextResponse.json(
      { error: 'No se pudo generar el PDF. Revise los logs del servidor.' },
      { status: 500 },
    )
  }

  const version = (ultimo?.version ?? 0) + 1
  await db.insert(expedientes).values({
    sesionId: id,
    version,
    pdfBase64: pdf.toString('base64'),
    bytes: pdf.length,
    generadoPor: usuario.nombre,
  })

  await auditar({
    entidad: 'expediente',
    entidadId: id,
    accion: 'expediente_generado',
    valorNuevo: { version, bytes: pdf.length },
    usuarioId: usuario.id,
  })

  return responder(pdf, datos.curso.codigo, descargar)
}

function responder(pdf: Buffer, codigo: string, descargar: boolean) {
  const nombre = `Expediente-${codigo}.pdf`
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  })
}
