import { plantillaLugares } from '@/lib/cargas'
import { requerirRol } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  await requerirRol('ADMIN', 'OPERACIONES')
  const buffer = await plantillaLugares()
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-lugares.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
