import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import * as schema from '@/lib/db/schema';

// @/lib/db crea el cliente libsql a partir de TURSO_DATABASE_URL al importarse.
// Lo apuntamos a una BD en memoria ANTES de importar bank.ts (que sí importa
// @/lib/db) para que no falle. schema.ts no toca el cliente, se importa estático.
process.env.TURSO_DATABASE_URL = ':memory:';
const { applyTokenMovementTx } = await import('./bank');

// Tabla `bets` con `odds REAL NOT NULL` para reproducir el estado de producción
// previo a la migración: el insert de v2 (que NO escribe odds) falla y debe
// arrastrar el rollback del cobro.
async function setupSchema(client: Client) {
  await client.batch([
    `CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', token_balance INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE token_ledger (
       id TEXT PRIMARY KEY, player_id TEXT NOT NULL, amount INTEGER NOT NULL,
       reason TEXT NOT NULL, ref_id TEXT, balance_after INTEGER NOT NULL,
       created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE bets (
       id TEXT PRIMARY KEY, match_id TEXT NOT NULL, player_id TEXT NOT NULL,
       market TEXT NOT NULL, predicted_team INTEGER NOT NULL, predicted_score TEXT,
       amount INTEGER NOT NULL, odds REAL NOT NULL,
       status TEXT NOT NULL DEFAULT 'open', payout INTEGER NOT NULL DEFAULT 0,
       created_at TEXT NOT NULL DEFAULT (datetime('now')), settled_at TEXT)`,
  ], 'write');
}

describe('applyTokenMovementTx (cobro atómico con el alta de la apuesta)', () => {
  const makeDb = (c: Client) => drizzle(c, { schema });
  let client: Client;
  let tdb: ReturnType<typeof makeDb>;
  let dbPath: string;
  let seq = 0;
  const PID = 'player-1';

  beforeEach(async () => {
    // Fichero temporal único: `:memory:` aísla cada conexión del cliente libsql.
    dbPath = join(tmpdir(), `bank-test-${process.pid}-${Date.now()}-${seq++}.db`);
    client = createClient({ url: `file:${dbPath}` });
    tdb = makeDb(client);
    await setupSchema(client);
    await client.execute({ sql: `INSERT INTO players (id, token_balance) VALUES (?, ?)`, args: [PID, 500] });
  });

  afterEach(() => {
    client.close();
    for (const suffix of ['', '-wal', '-shm']) {
      try { rmSync(dbPath + suffix); } catch { /* puede no existir */ }
    }
  });

  async function balance() {
    const r = await client.execute({ sql: `SELECT token_balance FROM players WHERE id = ?`, args: [PID] });
    return Number(r.rows[0].token_balance);
  }
  async function ledgerCount() {
    const r = await client.execute(`SELECT COUNT(*) n FROM token_ledger`);
    return Number(r.rows[0].n);
  }

  it('cobra y crea la apuesta en la misma transacción cuando todo va bien', async () => {
    await tdb.transaction(async (tx) => {
      const newBalance = await applyTokenMovementTx(tx, PID, -100, 'bet_placed');
      expect(newBalance).toBe(400);
      await tx.insert(schema.bets).values({
        matchId: 'm1', playerId: PID, market: 'winner', predictedTeam: 1, amount: 100, odds: 2,
      });
    });
    expect(await balance()).toBe(400);
    expect(await ledgerCount()).toBe(1);
  });

  it('si el insert de la apuesta falla, el rollback deshace el cobro (no se pierden fichas)', async () => {
    await expect(
      tdb.transaction(async (tx) => {
        await applyTokenMovementTx(tx, PID, -100, 'bet_placed');
        // Insert al estilo v2 (sin odds) contra una columna NOT NULL → falla.
        await tx.insert(schema.bets).values({
          matchId: 'm1', playerId: PID, market: 'winner', predictedTeam: 1, amount: 100,
        });
      }),
    ).rejects.toThrow();

    // La clave del bug original: el saldo NO se queda en 400 ni el asiento huérfano.
    expect(await balance()).toBe(500);
    expect(await ledgerCount()).toBe(0);
  });

  it('rechaza con SALDO_INSUFICIENTE sin tocar el saldo', async () => {
    await expect(
      tdb.transaction((tx) => applyTokenMovementTx(tx, PID, -600, 'bet_placed')),
    ).rejects.toThrow('SALDO_INSUFICIENTE');
    expect(await balance()).toBe(500);
    expect(await ledgerCount()).toBe(0);
  });
});
