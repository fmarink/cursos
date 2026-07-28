import bcrypt from 'bcryptjs'

/** Hash de contraseña sin pasar por next/headers, para uso en scripts. */
export async function hashPasswordDirecto(plano: string): Promise<string> {
  return bcrypt.hash(plano, 10)
}
