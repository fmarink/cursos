import { generarPlantillaEvaluacion } from '@/lib/plantillas-archivo'
import { requerirRol } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  await requerirRol('ADMIN', 'OPERACIONES')
  const buffer = await generarPlantillaEvaluacion()
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-evaluacion.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
