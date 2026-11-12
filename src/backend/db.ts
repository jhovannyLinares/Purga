import { DatabaseSync } from 'node:sqlite'
import { MIGRATIONS } from './migrations'

export type Database = DatabaseSync

/** Abre el índice con WAL y claves foráneas, y corre las migraciones que falten. `:memory:` en los tests. */
export function openDatabase(file: string): Database {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  migrate(db)
  return db
}

function migrate(db: Database): void {
  const applied = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
  MIGRATIONS.slice(applied).forEach((sql, index) => {
    transaction(db, () => {
      db.exec(sql)
      db.exec(`PRAGMA user_version = ${applied + index + 1}`)
    })
  })
}

/** Corre `work` en una transacción: todo o nada. */
export function transaction<T>(db: Database, work: () => T): T {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function getSetting(db: Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(db: Database, key: string, value: string): void {
  db.prepare('INSERT INTO setting(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

/** Ahora en ISO; los tests lo fijan con `PURGA_NOW` para que las reglas por días sean deterministas. */
export const nowIso = () => process.env.PURGA_NOW ?? new Date().toISOString()
export const today = () => nowIso().slice(0, 10)

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
