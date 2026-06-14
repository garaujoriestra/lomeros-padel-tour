import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// POST /api/migrate-bets-odds-nullable
// En v2 (pari-mutuel) la columna `bets.odds` quedó obsoleta y el código ya no la
// escribe. La tabla en producción seguía con `odds REAL NOT NULL`, así que TODO
// insert de apuesta fallaba con "NOT NULL constraint failed: bets.odds" (después
// de haber cobrado las fichas). SQLite no permite quitar el NOT NULL in situ:
// recreamos la tabla con `odds` nullable preservando las filas. Idempotente.
export async function POST() {
  try {
    const tableInfo = await db.all(sql`PRAGMA table_info(bets)`);
    const oddsCol = (tableInfo as Array<{ name: string; notnull: number }>)
      .find((col) => col.name === 'odds');

    if (oddsCol?.notnull !== 1) {
      return NextResponse.json({ success: true, message: 'odds ya es nullable; nada que hacer' });
    }

    await db.run(sql`PRAGMA foreign_keys=OFF`);
    await db.run(sql`
      CREATE TABLE bets_new (
        id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        market TEXT NOT NULL,
        predicted_team INTEGER NOT NULL,
        predicted_score TEXT,
        amount INTEGER NOT NULL,
        odds REAL,
        status TEXT NOT NULL DEFAULT 'open',
        payout INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        settled_at TEXT,
        UNIQUE (match_id, player_id, market)
      )
    `);
    await db.run(sql`
      INSERT INTO bets_new
        (id, match_id, player_id, market, predicted_team, predicted_score,
         amount, odds, status, payout, created_at, settled_at)
      SELECT
        id, match_id, player_id, market, predicted_team, predicted_score,
        amount, odds, status, payout, created_at, settled_at
      FROM bets
    `);
    await db.run(sql`DROP TABLE bets`);
    await db.run(sql`ALTER TABLE bets_new RENAME TO bets`);
    await db.run(sql`PRAGMA foreign_keys=ON`);

    return NextResponse.json({ success: true, message: 'bets.odds ahora es nullable' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error en la migración', detail: String(error) }, { status: 500 });
  }
}
