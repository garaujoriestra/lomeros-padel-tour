import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// POST /api/migrate-tournaments — crea las tablas del constructor de torneos.
// Idempotente: CREATE TABLE IF NOT EXISTS.
export async function POST() {
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      location TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS tournament_courts (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      available_from TEXT NOT NULL,
      available_to TEXT NOT NULL
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS tournament_participants (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id),
      UNIQUE(tournament_id, player_id)
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS tournament_blocks (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      "order" INTEGER NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      config TEXT NOT NULL DEFAULT '{}'
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS tournament_groups (
      id TEXT PRIMARY KEY,
      block_id TEXT NOT NULL REFERENCES tournament_blocks(id) ON DELETE CASCADE,
      name TEXT NOT NULL
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS tournament_pairs (
      id TEXT PRIMARY KEY,
      block_id TEXT NOT NULL REFERENCES tournament_blocks(id) ON DELETE CASCADE,
      player1_id TEXT NOT NULL REFERENCES players(id),
      player2_id TEXT NOT NULL REFERENCES players(id),
      seed INTEGER,
      label TEXT,
      group_id TEXT REFERENCES tournament_groups(id) ON DELETE SET NULL
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS tournament_matches (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      block_id TEXT NOT NULL REFERENCES tournament_blocks(id) ON DELETE CASCADE,
      court_id TEXT REFERENCES tournament_courts(id) ON DELETE SET NULL,
      round INTEGER NOT NULL DEFAULT 0,
      phase_tag TEXT,
      scheduled_start TEXT,
      scheduled_end TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      slot_a1 TEXT, slot_a2 TEXT, slot_b1 TEXT, slot_b2 TEXT,
      team_a_score INTEGER,
      team_b_score INTEGER,
      sets_json TEXT,
      winner TEXT
    )`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error en migrate-tournaments', detail: String(error) }, { status: 500 });
  }
}
