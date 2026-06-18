import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { TOURNAMENT_DDL } from './schema-ddl';

// DB libSQL en memoria con el esquema del torneo aplicado. Solo para tests.
// Desactiva foreign_keys: las tablas referenciadas (players, users) no existen en el harness.
// Tabla mínima de players para que seedPlayers() en tests pueda insertar sin error.
// FK está OFF, así que no hace falta que existan jugadores reales para el resto de tablas.
const TEST_STUB_DDL = [
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'player'
  )`,
];

export async function createTestDb() {
  const client = createClient({ url: ':memory:' });
  await client.execute('PRAGMA foreign_keys = OFF');
  for (const stmt of TEST_STUB_DDL) {
    await client.execute(stmt);
  }
  for (const stmt of TOURNAMENT_DDL) {
    await client.execute(stmt);
  }
  const db = drizzle(client, { schema });
  return { db, client };
}
