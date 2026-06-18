import { sqliteTable, text, integer, real, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { LOMEROS_GROUP_ID } from '@/lib/groups/constants';

// ─── GROUPS (tenant raíz) ────────────────────────────────────────────────────
// Fase 1A: solo se crean las tablas `groups` y `memberships`. La columna
// `group_id` en las tablas raíz tenant (players/matches/rewards/tournaments) se
// crea por MIGRACIÓN (física) pero NO se declara en este schema Drizzle hasta el
// paso 1B: añadirla aquí ahora obligaría a Drizzle a hacer SELECT/INSERT de
// group_id, y entre el deploy y el curl de migración eso tumbaría las lecturas
// del núcleo (columna inexistente). En 1B la columna ya existe en prod → sin ventana.
export const groups = sqliteTable('groups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── PLAYERS ─────────────────────────────────────────────────────────────────
export const players = sqliteTable('players', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // TEMPORAL 1B: default = Lomeros para no romper inserts/build. El .default se elimina en 1B-5.
  groupId: text('group_id').notNull().default(LOMEROS_GROUP_ID).references(() => groups.id),
  name: text('name').notNull(),
  nickname: text('nickname'),
  avatarUrl: text('avatar_url'),
  eloRating: real('elo_rating').notNull().default(1500),
  matchesPlayed: integer('matches_played').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  isLeftHanded: integer('is_left_handed', { mode: 'boolean' }).notNull().default(false),
  tokenBalance: integer('token_balance').notNull().default(0),
  juegaPadel: integer('juega_padel', { mode: 'boolean' }).notNull().default(true),
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

// ─── MEMBERSHIPS (rol + enlace user↔ficha, por grupo) ────────────────────────
export const memberships = sqliteTable('memberships', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('player'), // 'admin' | 'player'
  playerId: text('player_id').references(() => players.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ([
  unique().on(t.userId, t.groupId),
]));

// ─── MATCHES ─────────────────────────────────────────────────────────────────
export const matches = sqliteTable('matches', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // TEMPORAL 1B: default = Lomeros para no romper inserts/build. El .default se elimina en 1B-5.
  groupId: text('group_id').notNull().default(LOMEROS_GROUP_ID).references(() => groups.id),
  date: text('date').notNull(), // ISO date string YYYY-MM-DD
  time: text('time'), // "HH:MM" hora local (Europe/Madrid), null en partidos antiguos
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

// ─── PUSH SUBSCRIPTIONS ──────────────────────────────────────────────────────
export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── NOTIFICATION LOG (idempotencia de recordatorios) ────────────────────────
export const notificationLog = sqliteTable('notification_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  matchId: text('match_id').notNull(),
  kind: text('kind').notNull(), // 'reminder_day' | 'reminder_eve'
  sentAt: text('sent_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ([
  unique().on(t.matchId, t.kind),
]));

// ─── BETS (apuestas «La Timba») ──────────────────────────────────────────────
export const bets = sqliteTable('bets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  matchId: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  market: text('market').notNull(),            // 'winner' | 'exact_score'
  predictedTeam: integer('predicted_team').notNull(), // 1 | 2
  predictedScore: text('predicted_score'),     // '2-0' | '2-1' | null (solo exact_score)
  amount: integer('amount').notNull(),
  odds: real('odds'), // obsoleta en v2 (pari-mutuel); nullable, no se escribe
  status: text('status').notNull().default('open'), // 'open' | 'won' | 'lost' | 'refunded'
  payout: integer('payout').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  settledAt: text('settled_at'),
}, (t) => ([
  unique().on(t.matchId, t.playerId, t.market),
]));

// ─── TOKEN LEDGER (libro contable de tokens) ─────────────────────────────────
export const tokenLedger = sqliteTable('token_ledger', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(), // con signo
  reason: text('reason').notNull(),
  // 'buyin' | 'rebuy' | 'bet_placed' | 'bet_cancelled' | 'bet_won' | 'bet_refunded' |
  // 'redemption' | 'redemption_refunded' | 'settlement_reversal' | 'adjustment'
  refId: text('ref_id'), // id de bet/redemption/penalty según reason
  balanceAfter: integer('balance_after').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ([
  // Un único asiento por (reason, refId): guarda estructural contra dobles
  // pagos. Los refId NULL (initial, bet_placed, adjustment) no chocan.
  unique().on(t.reason, t.refId),
]));

// ─── REWARDS (catálogo de premios) ───────────────────────────────────────────
export const rewards = sqliteTable('rewards', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // TEMPORAL 1B: default = Lomeros para no romper inserts/build. El .default se elimina en 1B-5.
  groupId: text('group_id').notNull().default(LOMEROS_GROUP_ID).references(() => groups.id),
  title: text('title').notNull(),
  description: text('description'),
  cost: integer('cost').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── REDEMPTIONS (canjes) ────────────────────────────────────────────────────
export const redemptions = sqliteTable('redemptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  rewardId: text('reward_id').notNull().references(() => rewards.id),
  cost: integer('cost').notNull(), // precio congelado al canjear
  status: text('status').notNull().default('pending'), // 'pending' | 'fulfilled' | 'cancelled'
  requestedAt: text('requested_at').notNull().default(sql`(datetime('now'))`),
  resolvedAt: text('resolved_at'),
});

// ─── PENALTIES (bancarrotas) ─────────────────────────────────────────────────
export const penalties = sqliteTable('penalties', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  description: text('description'), // null hasta que el admin la asigne
  status: text('status').notNull().default('pending'), // 'pending' | 'fulfilled'
  rechargeAmount: integer('recharge_amount').notNull().default(250),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  fulfilledAt: text('fulfilled_at'),
});

// ─── TOURNAMENTS (torneos puntuales, independientes del ranking) ─────────────
export const tournaments = sqliteTable('tournaments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // TEMPORAL 1B: default = Lomeros para no romper inserts/build. El .default se elimina en 1B-5.
  groupId: text('group_id').notNull().default(LOMEROS_GROUP_ID).references(() => groups.id),
  name: text('name').notNull(),
  date: text('date').notNull(), // ISO date YYYY-MM-DD
  location: text('location'),
  notes: text('notes'),
  kind: text('kind').notNull(),   // 'pozo' | 'torneo'
  format: text('format').notNull(), // pozo: 'fixed_pairs'|'americano' ; torneo: 'single_elim'|'groups_elim'
  config: text('config').notNull().default('{}'),
  status: text('status').notNull().default('draft'), // 'draft' | 'scheduled' | 'running' | 'completed'
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const tournamentCourts = sqliteTable('tournament_courts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  order: integer('sort_order').notNull(), // 1 = pista más alta (top del pozo)
  availableFrom: text('available_from').notNull(), // "HH:MM"
  availableTo: text('available_to').notNull(),     // "HH:MM"
});

export const tournamentParticipants = sqliteTable('tournament_participants', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => players.id),
}, (t) => ({
  uniqParticipant: unique().on(t.tournamentId, t.playerId),
}));

export const tournamentGroups = sqliteTable('tournament_groups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
});

export const tournamentPairs = sqliteTable('tournament_pairs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  player1Id: text('player1_id').notNull().references(() => players.id),
  player2Id: text('player2_id').notNull().references(() => players.id),
  seed: integer('seed'),
  label: text('label'),
  groupId: text('group_id').references(() => tournamentGroups.id, { onDelete: 'set null' }),
});

export const tournamentMatches = sqliteTable('tournament_matches', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  courtId: text('court_id').references(() => tournamentCourts.id, { onDelete: 'set null' }),
  round: integer('round').notNull().default(0),
  phaseTag: text('phase_tag'), // 'pozo' | 'group:A' | 'ko:semi' | ...
  scheduledStart: text('scheduled_start'), // "HH:MM" o null
  scheduledEnd: text('scheduled_end'),
  status: text('status').notNull().default('pending'), // 'pending' | 'in_progress' | 'completed'
  // Cuatro huecos de participante (JSON de SlotRef): { type, ... }
  slotA1: text('slot_a1'),
  slotA2: text('slot_a2'),
  slotB1: text('slot_b1'),
  slotB2: text('slot_b2'),
  teamAScore: integer('team_a_score'),
  teamBScore: integer('team_b_score'),
  setsJson: text('sets_json'),
  winner: text('winner'), // 'A' | 'B' | null
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
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type NotificationLogRow = typeof notificationLog.$inferSelect;
export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;
export type TokenLedgerRow = typeof tokenLedger.$inferSelect;
export type Reward = typeof rewards.$inferSelect;
export type Redemption = typeof redemptions.$inferSelect;
export type Penalty = typeof penalties.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;
export type TournamentCourt = typeof tournamentCourts.$inferSelect;
export type NewTournamentCourt = typeof tournamentCourts.$inferInsert;
export type TournamentParticipant = typeof tournamentParticipants.$inferSelect;
export type NewTournamentParticipant = typeof tournamentParticipants.$inferInsert;
export type TournamentGroup = typeof tournamentGroups.$inferSelect;
export type NewTournamentGroup = typeof tournamentGroups.$inferInsert;
export type TournamentPair = typeof tournamentPairs.$inferSelect;
export type NewTournamentPair = typeof tournamentPairs.$inferInsert;
export type TournamentMatch = typeof tournamentMatches.$inferSelect;
export type NewTournamentMatch = typeof tournamentMatches.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
