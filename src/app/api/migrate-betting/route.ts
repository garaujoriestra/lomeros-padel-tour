// src/app/api/migrate-betting/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql, inArray } from 'drizzle-orm';
import { players, tokenLedger } from '@/lib/db/schema';
import { BETTING } from '@/lib/betting/config';

// POST /api/migrate-betting — migración de «La Timba». Idempotente.
export async function POST() {
  try {
    // 1. Columnas nuevas
    try {
      await db.run(sql`ALTER TABLE players ADD COLUMN token_balance INTEGER NOT NULL DEFAULT 500`);
    } catch { /* ya existe */ }
    try {
      await db.run(sql`ALTER TABLE matches ADD COLUMN time TEXT`);
    } catch { /* ya existe */ }

    // 2. Tablas nuevas
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS bets (
        id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        market TEXT NOT NULL,
        predicted_team INTEGER NOT NULL,
        predicted_score TEXT,
        amount INTEGER NOT NULL,
        odds REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        payout INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        settled_at TEXT,
        UNIQUE (match_id, player_id, market)
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS token_ledger (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        ref_id TEXT,
        balance_after INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (reason, ref_id)
      )
    `);
    await db.run(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS token_ledger_reason_ref_idx
      ON token_ledger(reason, ref_id)
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS rewards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        cost INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS redemptions (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        reward_id TEXT NOT NULL REFERENCES rewards(id),
        cost INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS penalties (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        recharge_amount INTEGER NOT NULL DEFAULT 250,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        fulfilled_at TEXT
      )
    `);

    // 3. Backfill: asiento 'initial' para jugadores que aún no lo tengan.
    //    (el ALTER con DEFAULT ya les dio los 500 de saldo)
    const allPlayers = await db.select().from(players);
    const existing = allPlayers.length
      ? await db.select().from(tokenLedger)
          .where(inArray(tokenLedger.playerId, allPlayers.map((p) => p.id)))
      : [];
    const hasInitial = new Set(existing.filter((e) => e.reason === 'initial').map((e) => e.playerId));
    let backfilled = 0;
    for (const p of allPlayers) {
      if (hasInitial.has(p.id)) continue;
      await db.insert(tokenLedger).values({
        playerId: p.id,
        amount: BETTING.initialBalance,
        reason: 'initial',
        balanceAfter: p.tokenBalance,
      });
      backfilled++;
    }

    return NextResponse.json({ success: true, backfilled });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error durante la migración', detail: String(error) }, { status: 500 });
  }
}
