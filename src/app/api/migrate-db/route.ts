import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

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

    return NextResponse.json({
      success: true,
      message: 'Migración completada',
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error durante la migración', detail: String(error) }, { status: 500 });
  }
}
