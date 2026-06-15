// Fuente única del DDL del evento (pozo o torneo). Lo usan el endpoint de migración
// y el harness de test en memoria. Idempotente (CREATE TABLE IF NOT EXISTS).
// Modelo nuevo: UN formato por evento (sin tournament_blocks).
export const TOURNAMENT_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    location TEXT,
    notes TEXT,
    kind TEXT NOT NULL,            -- 'pozo' | 'torneo'
    format TEXT NOT NULL,          -- pozo: 'fixed_pairs'|'americano' ; torneo: 'single_elim'|'groups_elim'
    config TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft',
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_courts (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    available_from TEXT NOT NULL,
    available_to TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_participants (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id),
    UNIQUE(tournament_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_groups (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_pairs (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player1_id TEXT NOT NULL REFERENCES players(id),
    player2_id TEXT NOT NULL REFERENCES players(id),
    seed INTEGER,
    label TEXT,
    group_id TEXT REFERENCES tournament_groups(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
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
  )`,
];
