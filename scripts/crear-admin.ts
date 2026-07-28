/**
 * Crea un usuario administrador, sin cargar datos de prueba.
 *
 *   npx tsx scripts/crear-admin.ts
 *   npx tsx scripts/crear-admin.ts correo@empresa.cl "Nombre Apellido" "clave-larga"
 *
 * Pensado para el primer arranque en producción: deja la base limpia, con un
 * solo usuario desde el cual crear todo lo demás.
 */
import 'dotenv/config'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../src/db/schema'

const { usuarios } = schema

async function main() {
  const [emailArg, nombreArg, claveArg] = process.argv.slice(2)

  let email = emailArg
  let nombre = nombreArg
  let clave = claveArg

  if (!email || !nombre || !clave) {
    const rl = createInterface({ input: stdin, output: stdout })
    email = email || (await rl.question('Correo del administrador: '))
    nombre = nombre || (await rl.question('Nombre completo: '))
    clave = clave || (await rl.question('Contraseña (mínimo 10 caracteres): '))
    rl.close()
  }

  email = email.trim().toLowerCase()
  nombre = nombre.trim()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('\nEl correo no tiene un formato válido.')
    process.exit(1)
  }
  if (nombre.length < 3) {
    console.error('\nEl nombre es demasiado corto.')
    process.exit(1)
  }
  if (clave.length < 10) {
    console.error('\nLa contraseña debe tener al menos 10 caracteres.')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool, { schema })

  const [existente] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1)
  const passwordHash = await bcrypt.hash(clave, 10)

  if (existente) {
    await db
      .update(usuarios)
      .set({ passwordHash, nombre, rol: 'ADMIN', activo: true })
      .where(eq(usuarios.id, existente.id))
    console.log(`\nUsuario actualizado: ${email}`)
    console.log('Se le reasignó el rol de administrador y se cambió la contraseña.')
  } else {
    await db.insert(usuarios).values({ email, passwordHash, nombre, rol: 'ADMIN' })
    console.log(`\nAdministrador creado: ${email}`)
  }

  console.log('\nYa puede iniciar sesión y crear clientes, tipos de curso y relatores.\n')
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
