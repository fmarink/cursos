import 'dotenv/config'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool)
  console.log('Aplicando migraciones...')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Migraciones aplicadas.')
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
