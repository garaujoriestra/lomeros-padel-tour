import { describe, it, expect } from 'vitest';
import { createClient } from '@libsql/client';
import { TOURNAMENT_DDL, TOURNAMENT_DROP } from './schema-ddl';

// Esquema VIEJO (modelo de bloques) tal como está en prod (commit 99d9b33), simplificado a
// lo que importa para la migración: tournaments sin kind/format y la tabla tournament_blocks.
const OLD_DDL = [
  `CREATE TABLE tournaments (id TEXT PRIMARY KEY, name TEXT NOT NULL, date TEXT NOT NULL)`,
  `CREATE TABLE tournament_blocks (id TEXT PRIMARY KEY, tournament_id TEXT, sort_order INTEGER)`,
];

describe('migrate-tournaments-v2 (DROP + recreate)', () => {
  it('reemplaza el modelo viejo (bloques) por el nuevo (kind/format/config) y descarta los datos viejos', async () => {
    const client = createClient({ url: ':memory:' });
    await client.execute('PRAGMA foreign_keys = OFF');
    for (const s of OLD_DDL) await client.execute(s);
    // Dato del modelo viejo que NO se conserva.
    await client.execute({ sql: 'INSERT INTO tournaments (id, name, date) VALUES (?, ?, ?)', args: ['t1', 'Viejo', '2026-01-01'] });

    // Migración v2: las mismas sentencias que ejecuta el endpoint.
    for (const s of TOURNAMENT_DROP) await client.execute(s);
    for (const s of TOURNAMENT_DDL) await client.execute(s);

    // La tabla de bloques desapareció.
    await expect(client.execute('SELECT * FROM tournament_blocks')).rejects.toThrow();

    // El nuevo `tournaments` acepta kind/format/config y el dato viejo se descartó.
    await client.execute({
      sql: 'INSERT INTO tournaments (id, name, date, kind, format) VALUES (?, ?, ?, ?, ?)',
      args: ['t2', 'Nuevo', '2026-07-01', 'pozo', 'americano'],
    });
    const rows = await client.execute('SELECT id, kind, format, config, status FROM tournaments');
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].kind).toBe('pozo');
    expect(rows.rows[0].format).toBe('americano');
    expect(rows.rows[0].config).toBe('{}');   // DEFAULT '{}'
    expect(rows.rows[0].status).toBe('draft'); // DEFAULT 'draft'
  });

  it('es idempotente: ejecutar la migración dos veces no falla', async () => {
    const client = createClient({ url: ':memory:' });
    await client.execute('PRAGMA foreign_keys = OFF');
    for (let pass = 0; pass < 2; pass++) {
      for (const s of TOURNAMENT_DROP) await client.execute(s);
      for (const s of TOURNAMENT_DDL) await client.execute(s);
    }
    const cols = await client.execute('SELECT kind, format FROM tournaments'); // no lanza → existe con columnas nuevas
    expect(cols.rows.length).toBe(0);
  });
});
