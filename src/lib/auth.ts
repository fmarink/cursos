import { cookies, headers } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { usuarios } from '@/db/schema'

const COOKIE = 'uppercap_sesion'
const DURACION_HORAS = 12

function secreto() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET debe estar definido y tener al menos 32 caracteres')
  }
  return new TextEncoder().encode(s)
}

export type SesionUsuario = {
  id: string
  email: string
  nombre: string
  rol: 'ADMIN' | 'OPERACIONES' | 'PROFESOR'
  profesorId: string | null
}

export async function hashPassword(plano: string) {
  return bcrypt.hash(plano, 10)
}

export async function verificarCredenciales(
  email: string,
  password: string,
): Promise<SesionUsuario | null> {
  const [u] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, email.trim().toLowerCase()))
    .limit(1)
  if (!u || !u.activo) return null
  const ok = await bcrypt.compare(password, u.passwordHash)
  if (!ok) return null
  await db
    .update(usuarios)
    .set({ ultimoAcceso: new Date() })
    .where(eq(usuarios.id, u.id))
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    profesorId: u.profesorId ?? null,
  }
}

/**
 * ¿La conexión actual es HTTPS?
 *
 * Determina si la cookie de sesión puede marcarse `secure`. No se puede usar
 * NODE_ENV para esto: una instalación local corre compilada en modo producción
 * pero se sirve por HTTP en la red interna (`http://192.168.1.42:3000`), y una
 * cookie `secure` sobre HTTP simplemente no se guarda — el relator queda sin
 * poder iniciar sesión desde ningún dispositivo que no sea localhost.
 *
 * Se mira el protocolo real de la petición, contemplando proxies inversos.
 */
async function conexionEsSegura(): Promise<boolean> {
  const h = await headers()
  const proto = h.get('x-forwarded-proto')
  if (proto) return proto.split(',')[0].trim() === 'https'
  // Sin encabezado de proxy, Next expone el origen en despliegues HTTPS.
  const origen = h.get('origin') ?? h.get('referer')
  if (origen?.startsWith('https://')) return true
  return false
}

export async function crearSesion(usuario: SesionUsuario) {
  const token = await new SignJWT({ ...usuario })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${DURACION_HORAS}h`)
    .sign(secreto())

  const store = await cookies()
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: await conexionEsSegura(),
    path: '/',
    maxAge: DURACION_HORAS * 3600,
  })
}

export async function cerrarSesion() {
  const store = await cookies()
  store.delete(COOKIE)
}

/** Devuelve el usuario de la sesión o null. No redirige. */
export async function sesionActual(): Promise<SesionUsuario | null> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secreto())
    return {
      id: String(payload.id),
      email: String(payload.email),
      nombre: String(payload.nombre),
      rol: payload.rol as SesionUsuario['rol'],
      profesorId: (payload.profesorId as string) ?? null,
    }
  } catch {
    return null
  }
}

/** Lanza si no hay sesión. Usar en páginas y handlers protegidos. */
export async function requerirSesion(): Promise<SesionUsuario> {
  const u = await sesionActual()
  if (!u) throw new NoAutorizado()
  return u
}

export async function requerirRol(
  ...roles: SesionUsuario['rol'][]
): Promise<SesionUsuario> {
  const u = await requerirSesion()
  if (!roles.includes(u.rol)) throw new NoAutorizado('Rol insuficiente')
  return u
}

export class NoAutorizado extends Error {
  constructor(msg = 'No autorizado') {
    super(msg)
    this.name = 'NoAutorizado'
  }
}

/** IP del cliente considerando proxies. */
export async function ipCliente(): Promise<string | null> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return h.get('x-real-ip')
}

export async function userAgentCliente(): Promise<string | null> {
  const h = await headers()
  return h.get('user-agent')
}
