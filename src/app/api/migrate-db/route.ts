import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql, eq } from 'drizzle-orm';
import { players, matches } from '@/lib/db/schema';

// POST /api/migrate-db
// Migrates the existing matches table to support scheduled matches:
//   - Adds `status` column (default 'completed') if not exists
//   - Recreates matches table removing NOT NULL on winner_team (SQLite limitation)
export async function POST() {
  try {
    // Step 1: Add status column if it doesn't exist yet
    // SQLite ignores this if the column already exists when we wrap in try/catch
    try {
      await db.run(sql`ALTER TABLE matches ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'`);
    } catch {
      // Column already exists — skip silently
    }

    // Step 2: Remove NOT NULL from winner_team via table recreation (SQLite limitation)
    // Check if winner_team is still NOT NULL by looking at the table definition
    const tableInfo = await db.all(sql`PRAGMA table_info(matches)`);
    const winnerCol = (tableInfo as Array<{ name: string; notnull: number }>)
      .find((col) => col.name === 'winner_team');

    if (winnerCol?.notnull === 1) {
      // Recreate the table without NOT NULL on winner_team
      await db.run(sql`
        CREATE TABLE IF NOT EXISTS matches_new (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          location TEXT,
          team1_player1_id TEXT NOT NULL,
          team1_player2_id TEXT NOT NULL,
          team2_player1_id TEXT NOT NULL,
          team2_player2_id TEXT NOT NULL,
          winner_team INTEGER,
          status TEXT NOT NULL DEFAULT 'completed',
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      // Copy all existing data
      await db.run(sql`
        INSERT INTO matches_new
          (id, date, location, team1_player1_id, team1_player2_id,
           team2_player1_id, team2_player2_id, winner_team, status, notes, created_at)
        SELECT
          id, date, location, team1_player1_id, team1_player2_id,
          team2_player1_id, team2_player2_id, winner_team,
          COALESCE(status, 'completed'), notes, created_at
        FROM matches
      `);

      // Drop old table and rename new one
      await db.run(sql`DROP TABLE matches`);
      await db.run(sql`ALTER TABLE matches_new RENAME TO matches`);
    }

    // Step 3: Add is_left_handed column to players if not present (Feature B)
    try {
      await db.run(sql`ALTER TABLE players ADD COLUMN is_left_handed INTEGER NOT NULL DEFAULT 0`);
    } catch {
      // Column already exists — skip silently
    }

    // Step 4: Add side columns to matches if not present (Feature C)
    for (const col of ['team1_player1_side', 'team1_player2_side', 'team2_player1_side', 'team2_player2_side']) {
      try {
        await db.run(sql.raw(`ALTER TABLE matches ADD COLUMN ${col} TEXT`));
      } catch {
        // Column already exists — skip silently
      }
    }

    // Step 5: Heuristic backfill for matches with no side data (Feature C)
    // Convention: lefty → revés, righty → drive. Both same-handed → positional
    // (team1Player1 → drive, team1Player2 → revés).
    const allMatches = await db.select().from(matches);
    const allPlayers = await db.select().from(players);
    const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

    function backfillTeamSides(p1Id: string, p2Id: string): { player1: string | null; player2: string | null } {
      const p1 = playerMap[p1Id];
      const p2 = playerMap[p2Id];
      if (!p1 || !p2) return { player1: null, player2: null };
      const p1Lefty = !!p1.isLeftHanded;
      const p2Lefty = !!p2.isLeftHanded;
      if (p1Lefty && !p2Lefty) return { player1: 'reves', player2: 'drive' };
      if (!p1Lefty && p2Lefty) return { player1: 'drive', player2: 'reves' };
      return { player1: 'drive', player2: 'reves' }; // positional fallback
    }

    for (const m of allMatches) {
      const hasAnySide =
        m.team1Player1Side || m.team1Player2Side || m.team2Player1Side || m.team2Player2Side;
      if (hasAnySide) continue; // skip matches that already have side info

      const t1 = backfillTeamSides(m.team1Player1Id, m.team1Player2Id);
      const t2 = backfillTeamSides(m.team2Player1Id, m.team2Player2Id);

      await db.update(matches).set({
        team1Player1Side: t1.player1,
        team1Player2Side: t1.player2,
        team2Player1Side: t2.player1,
        team2Player2Side: t2.player2,
      }).where(eq(matches.id, m.id));
    }

    return NextResponse.json({
      success: true,
      message: 'Migración completada',
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error durante la migración', detail: String(error) }, { status: 500 });
  }
}
