import { db } from '@/db'
import { auditLog } from '@/db/schema'

type Entrada = {
  entidad: string
  entidadId: string
  accion: string
  valorAnterior?: unknown
  valorNuevo?: unknown
  usuarioId?: string | null
  actorAnonimo?: string | null
  ip?: string | null
}

/**
 * Registra una acción en el log de auditoría.
 *
 * Nunca lanza: una falla de auditoría no debe tumbar la operación de negocio,
 * pero sí se reporta por consola para que quede visible en los logs.
 */
export async function auditar(entrada: Entrada): Promise<void> {
  try {
    await db.insert(auditLog).values({
      entidad: entrada.entidad,
      entidadId: entrada.entidadId,
      accion: entrada.accion,
      valorAnterior: (entrada.valorAnterior ?? null) as never,
      valorNuevo: (entrada.valorNuevo ?? null) as never,
      usuarioId: entrada.usuarioId ?? null,
      actorAnonimo: entrada.actorAnonimo ?? null,
      ip: entrada.ip ?? null,
    })
  } catch (e) {
    console.error('[audit] no se pudo registrar la acción', entrada.accion, e)
  }
}
