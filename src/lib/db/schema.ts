import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── PLAYERS ─────────────────────────────────────────────────────────────────
export const players = sqliteTable('players', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  nickname: text('nickname'),
  avatarUrl: text('avatar_url'),
  eloRating: real('elo_rating').notNull().default(1500),
  matchesPlayed: integer('matches_played').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  isLeftHanded: integer('is_left_handed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── USERS (cuentas de acceso) ───────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  role: text('role').notNull().default('player'), // 'admin' | 'player'
  playerId: text('player_id').references(() => players.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── MATCHES ─────────────────────────────────────────────────────────────────
export const matches = sqliteTable('matches', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  date: text('date').notNull(), // ISO date string YYYY-MM-DD
  location: text('location'),
  // Team 1
  team1Player1Id: text('team1_player1_id').notNull().references(() => players.id),
  team1Player2Id: text('team1_player2_id').notNull().references(() => players.id),
  // Team 2
  team2Player1Id: text('team2_player1_id').notNull().references(() => players.id),
  team2Player2Id: text('team2_player2_id').notNull().references(() => players.id),
  // Result: 1 = team1 wins, 2 = team2 wins, null = pending or aborted
  winnerTeam: integer('winner_team'), // 1 | 2 | null
  // Status: 'scheduled' | 'completed' | 'injury_aborted'
  status: text('status').notNull().default('completed'),
  team1Player1Side: text('team1_player1_side'),  // 'drive' | 'reves' | null
  team1Player2Side: text('team1_player2_side'),
  team2Player1Side: text('team2_player1_side'),
  team2Player2Side: text('team2_player2_side'),
  // Set when status = 'injury_aborted'. References one of the four match players.
  injuredPlayerId: text('injured_player_id').references(() => players.id),
  photoUrl: text('photo_url'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── MATCH SETS ──────────────────────────────────────────────────────────────
export const matchSets = sqliteTable('match_sets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  matchId: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  setNumber: integer('set_number').notNull(), // 1, 2, 3
  team1Games: integer('team1_games').notNull(),
  team2Games: integer('team2_games').notNull(),
});

// ─── PAIR STATS ──────────────────────────────────────────────────────────────
export const pairStats = sqliteTable('pair_stats', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  player1Id: text('player1_id').notNull().references(() => players.id),
  player2Id: text('player2_id').notNull().references(() => players.id),
  matchesPlayed: integer('matches_played').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  pairElo: real('pair_elo').notNull().default(1500),
  synergyScore: real('synergy_score').notNull().default(0),
  lastPlayed: text('last_played'),
});

// ─── RATING HISTORY ──────────────────────────────────────────────────────────
export const ratingHistory = sqliteTable('rating_history', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: text('player_id').notNull().references(() => players.id),
  matchId: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  eloBefore: real('elo_before').notNull(),
  eloAfter: real('elo_after').notNull(),
  eloChange: real('elo_change').notNull(),
  recordedAt: text('recorded_at').notNull().default(sql`(datetime('now'))`),
});

// ─── PLAYER ACHIEVEMENTS ────────────────────────────────────────────────────
export const playerAchievements = sqliteTable('player_achievements', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  achievementId: text('achievement_id').notNull(),
  earnedAt: text('earned_at').notNull(),
  triggerMatchId: text('trigger_match_id').references(() => matches.id, { onDelete: 'set null' }),
});

// ─── TYPES ───────────────────────────────────────────────────────────────────
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type MatchSet = typeof matchSets.$inferSelect;
export type NewMatchSet = typeof matchSets.$inferInsert;
export type PairStat = typeof pairStats.$inferSelect;
export type RatingHistory = typeof ratingHistory.$inferSelect;
export type PlayerAchievement = typeof playerAchievements.$inferSelect;
export type NewPlayerAchievement = typeof playerAchievements.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
