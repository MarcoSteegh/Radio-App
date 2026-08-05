import { readdir } from 'fs/promises'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'
import { pool } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function getAppliedMigrations() {
  try {
    const [rows] = await pool.query('SELECT version FROM schema_migrations ORDER BY version')
    return new Set(rows.map((r) => r.version))
  } catch {
    return new Set()
  }
}

async function loadMigrations() {
  const migrationsDir = join(__dirname, 'migrations')
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.js'))
    .sort()

  const migrations = []
  for (const file of files) {
    const mod = await import(pathToFileURL(join(migrationsDir, file)).href)
    migrations.push(mod.default)
  }
  return migrations
}

export async function runMigrations() {
  const applied = await getAppliedMigrations()
  const migrations = await loadMigrations()

  let ran = 0
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue

    console.log(`[migrate] Running ${migration.name}...`)
    const statements = Array.isArray(migration.up) ? migration.up : [migration.up]
    for (const sql of statements) {
      await pool.query(sql)
    }
    await pool.query(
      'INSERT INTO schema_migrations (version) VALUES (?)',
      [migration.name],
    )
    ran++
  }

  if (ran > 0) {
    console.log(`[migrate] Applied ${ran} migration(s)`)
  } else {
    console.log('[migrate] Database is up to date')
  }
}
