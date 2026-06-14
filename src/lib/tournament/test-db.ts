import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { TOURNAMENT_DDL } from './schema-ddl';

// DB libSQL en memoria con el esquema del torneo aplicado. Solo para tests.
// Desactiva foreign_keys: las tablas referenciadas (players, users) no existen en el harness.
export async function createTestDb() {
  const client = createClient({ url: ':memory:' });
  await client.execute('PRAGMA foreign_keys = OFF');
  for (const stmt of TOURNAMENT_DDL) {
    await client.execute(stmt);
  }
  return drizzle(client, { schema });
}
