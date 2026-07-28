import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/db'

export const dynamic = 'force-dynamic'

/**
 * Comprobación de salud para Coolify y cualquier balanceador.
 *
 * Verifica que la aplicación responda **y** que la base conteste, que es lo que
 * de verdad importa: un contenedor vivo con la base caída no sirve de nada en
 * medio de un curso.
 */
export async function GET() {
  const inicio = Date.now()
  try {
    await db.execute(sql`select 1`)
    return NextResponse.json(
      { estado: 'ok', baseDeDatos: 'ok', ms: Date.now() - inicio },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    return NextResponse.json(
      {
        estado: 'degradado',
        baseDeDatos: 'sin conexión',
        detalle: e instanceof Error ? e.message : 'error desconocido',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
