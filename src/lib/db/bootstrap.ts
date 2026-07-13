import type { Client } from '@libsql/client';
import { migrateBranding } from '@/lib/db/migrations/branding';

/**
 * Crea (idempotente) las tablas y columnas auxiliares que el schema drizzle espera
 * pero que /api/init-db y las migraciones HTTP no crean. Asume que las tablas base
 * (players, matches) ya existen. Tolera columnas/tablas ya presentes.
 * Reutilizado por el global-setup de e2e y por /api/dev/seed-staging.
 */
export async function ensureAuxTables(client: Client): Promise<void> {
  const playerColumns = [
    'is_left_handed INTEGER NOT NULL DEFAULT 0',
    'token_balance INTEGER NOT NULL DEFAULT 0',
    'juega_padel INTEGER NOT NULL DEFAULT 1',
  ];
  for (const col of playerColumns) {
    try { await client.execute(`ALTER TABLE players ADD COLUMN ${col}`); } catch { /* ya existe */ }
  }

  const matchColumns = [
    'time TEXT',
    'team1_player1_side TEXT',
    'team1_player2_side TEXT',
    'team2_player1_side TEXT',
    'team2_player2_side TEXT',
    'photo_url TEXT',
  ];
  for (const col of matchColumns) {
    try { await client.execute(`ALTER TABLE matches ADD COLUMN ${col}`); } catch { /* ya existe */ }
  }

  await client.execute(`CREATE TABLE IF NOT EXISTS player_achievements (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    earned_at TEXT NOT NULL,
    trigger_match_id TEXT
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS bets (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
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
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS token_ledger (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref_id TEXT,
    balance_after INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (reason, ref_id)
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS rewards (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL DEFAULT 'lomeros',
    title TEXT NOT NULL,
    description TEXT,
    cost INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS redemptions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    reward_id TEXT NOT NULL,
    cost INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS penalties (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    recharge_amount INTEGER NOT NULL DEFAULT 250,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    fulfilled_at TEXT
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // Planificador semanal: disponibilidad por slots de 30 min (courts es legado inerte de v1).
  await client.execute(`CREATE TABLE IF NOT EXISTS courts (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL DEFAULT 'lomeros',
    owner_player_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS planner_slots (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL DEFAULT 'lomeros',
    week_start TEXT NOT NULL,
    day INTEGER NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    slots TEXT NOT NULL,
    UNIQUE (week_start, day, subject_type, subject_id)
  )`);

  // Fase 3: columnas de branding/pase en groups + billing_events (idempotente).
  await migrateBranding(client);
}
