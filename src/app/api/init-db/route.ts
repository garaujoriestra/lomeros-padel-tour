import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// POST /api/init-db - crea las tablas si no existen (solo en desarrollo o primer deploy)
export async function POST() {
  try {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        nickname TEXT,
        avatar_url TEXT,
        elo_rating REAL NOT NULL DEFAULT 1500,
        matches_played INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS matches (
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

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS match_sets (
        id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL,
        set_number INTEGER NOT NULL,
        team1_games INTEGER NOT NULL,
        team2_games INTEGER NOT NULL,
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
      )
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS pair_stats (
        id TEXT PRIMARY KEY,
        player1_id TEXT NOT NULL,
        player2_id TEXT NOT NULL,
        matches_played INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        pair_elo REAL NOT NULL DEFAULT 1500,
        synergy_score REAL NOT NULL DEFAULT 0,
        last_played TEXT
      )
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS rating_history (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        match_id TEXT NOT NULL,
        elo_before REAL NOT NULL,
        elo_after REAL NOT NULL,
        elo_change REAL NOT NULL,
        recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
      )
    `);

    return NextResponse.json({ success: true, message: 'Base de datos inicializada' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al inicializar la DB' }, { status: 500 });
  }
}
