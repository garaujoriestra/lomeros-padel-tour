# Achievements / Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 14-badge achievement system: stored grants in a new `player_achievements` table, retroactive backfill in the migration, compact grid display on the player profile, and feed events when badges are unlocked post-deploy.

**Architecture:** Pure TDD detector that processes `rating_history` + match-set context and emits achievement grants. Catalog lives in code (`src/lib/achievements/catalog.ts`). Backfill walks all rating_history once during migration. New `processMatchRatings` hook applies the detector to the 4 affected players when a match closes. Feed gets a new `achievement_unlocked` event type with a date cutoff to prevent retroactive grants from spamming.

**Tech Stack:** Next 16.2.2, drizzle-orm, libsql/Turso, vitest, React 19, Tailwind v4.

**Verification model:**
- TDD tests for `detectAllAchievements` (~10 cases).
- Tests for the new `achievement_unlocked` feed event type.
- Per task: `npx tsc --noEmit && npm run lint && npm test`. No regressions allowed.
- Manual smoke at the end (post-deploy + migration): visit a player profile, verify the achievements card; close a new match, verify a new badge appears in the feed.

**Background:** spec at `docs/superpowers/specs/2026-04-28-achievements-design.md`. Read before starting.

**Notable constraints:**
- Codebase is Next 16. Codebase already has the patterns we need (`detectRankChanges` is the closest analog to the new detector — pure helper that walks rating_history). 
- Baseline test count: 88 tests across 10 files. Track this number — 12+ new tests expected by end of plan.
- The migration route already has Step 4d / Step 6 placeholders; we'll insert the new logic as Step 4d (CREATE TABLE) and Step 6 (backfill).

---

## Pre-flight

- [ ] **Step 0a: Create branch + baseline**

```bash
cd /Users/gar/Personal/ClaudeCode/lomeros-padel-tour
git checkout -b feature/achievements
npx tsc --noEmit && npm run lint && npm test
```

Expected: branch created. tsc/lint clean. 88/88 tests pass.

---

## Task 1: Schema — `playerAchievements` table

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add the table definition**

Append to `src/lib/db/schema.ts`, after the `ratingHistory` table definition and before the `// ─── TYPES ───` section:

```ts
// ─── PLAYER ACHIEVEMENTS ─────────────────────────────────────────────────────
export const playerAchievements = sqliteTable('player_achievements', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  achievementId: text('achievement_id').notNull(),
  earnedAt: text('earned_at').notNull(),
  triggerMatchId: text('trigger_match_id').references(() => matches.id, { onDelete: 'set null' }),
});
```

Then add the type export in the `// ─── TYPES ───` section:

```ts
export type PlayerAchievement = typeof playerAchievements.$inferSelect;
export type NewPlayerAchievement = typeof playerAchievements.$inferInsert;
```

- [ ] **Step 2: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 88/88 tests.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(schema): add player_achievements table

New table for stored achievement grants. Foreign keys to players
(CASCADE) and matches (SET NULL on trigger_match_id). Migration
follows in next commit."
```

---

## Task 2: Migration — CREATE TABLE

**Files:**
- Modify: `src/app/api/migrate-db/route.ts`

- [ ] **Step 1: Add CREATE TABLE step**

Open `src/app/api/migrate-db/route.ts`. Find the existing Step 4b block (which adds `photo_url` to matches). Add a new Step 4d block (we skip 4c so the numbering can leave room) immediately after Step 4b:

```ts
    // Step 4d: Create player_achievements table (Block 3 — achievements)
    try {
      await db.run(sql`
        CREATE TABLE IF NOT EXISTS player_achievements (
          id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          achievement_id TEXT NOT NULL,
          earned_at TEXT NOT NULL,
          trigger_match_id TEXT REFERENCES matches(id) ON DELETE SET NULL
        )
      `);
    } catch {
      // Table already exists — skip silently
    }
```

(The `CREATE TABLE IF NOT EXISTS` is itself idempotent, but we wrap in try/catch to match the style of other migration steps.)

- [ ] **Step 2: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 88/88 tests.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/migrate-db/route.ts
git commit -m "feat(migrate): create player_achievements table

Idempotent CREATE TABLE step. Backfill of historical grants
follows in a later step."
```

---

## Task 3: Achievement catalog

**Files:**
- Create: `src/lib/achievements/catalog.ts`

- [ ] **Step 1: Create the catalog**

Create `src/lib/achievements/catalog.ts`:

```ts
export type AchievementCategory = 'milestones' | 'wins' | 'elo' | 'situational';
export type AchievementTier = 'common' | 'rare' | 'mythic';

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
}

export const ACHIEVEMENTS: Achievement[] = [
  // Milestones
  { id: 'first_match',  name: 'Primer partido',   icon: '🎾', description: '1 partido jugado',     category: 'milestones',  tier: 'common' },
  { id: 'matches_10',   name: 'Decena',           icon: '🔟', description: '10 partidos jugados',  category: 'milestones',  tier: 'common' },
  { id: 'matches_50',   name: 'Cincuentón',       icon: '🎯', description: '50 partidos jugados',  category: 'milestones',  tier: 'rare'   },
  { id: 'matches_100',  name: 'El siglo',         icon: '💯', description: '100 partidos jugados', category: 'milestones',  tier: 'mythic' },
  // Wins & streaks
  { id: 'first_win',    name: 'Primera victoria', icon: '🥇', description: 'Primera victoria',         category: 'wins', tier: 'common' },
  { id: 'wins_25',      name: 'Veterano',         icon: '🏆', description: '25 victorias',             category: 'wins', tier: 'rare'   },
  { id: 'streak_3',     name: 'Racha de 3',       icon: '🔥', description: '3 victorias seguidas',     category: 'wins', tier: 'common' },
  { id: 'streak_5',     name: 'Racha de 5',       icon: '🚀', description: '5 victorias seguidas',     category: 'wins', tier: 'rare'   },
  { id: 'streak_10',    name: 'Racha de 10',      icon: '⚡', description: '10 victorias seguidas',    category: 'wins', tier: 'mythic' },
  // ELO & ranking
  { id: 'elo_1600',     name: '1600+',            icon: '📈', description: 'Cruzar 1600 ELO',          category: 'elo',  tier: 'common' },
  { id: 'elo_1800',     name: '1800+',            icon: '💎', description: 'Cruzar 1800 ELO',          category: 'elo',  tier: 'rare'   },
  { id: 'rank_1',       name: '#1 del LPT',       icon: '👑', description: 'Llegar al #1 del ranking', category: 'elo',  tier: 'rare'   },
  // Situational
  { id: 'bagel',        name: 'Bagel',            icon: '🍩', description: 'Ganar un set 6-0',         category: 'situational', tier: 'common' },
  { id: 'double_bagel', name: 'Doble bagel',      icon: '🥶', description: 'Ganar 6-0 / 6-0',          category: 'situational', tier: 'mythic' },
];

export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
```

- [ ] **Step 2: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. Tests still 88.

- [ ] **Step 3: Commit**

```bash
git add src/lib/achievements/catalog.ts
git commit -m "feat(achievements): add 14-badge catalog

Catalog defines name, icon, description, category, and tier for
each badge. ACHIEVEMENT_BY_ID lookup is also exported for o(1)
access from the detector and the UI."
```

---

## Task 4: Detector helper (TDD)

Pure function that walks rating_history + match-set context and emits achievement grants.

**Files:**
- Create: `src/lib/achievements/detect.ts`
- Create: `src/lib/achievements/detect.test.ts`

- [ ] **Step 1: Write failing test file**

Create `src/lib/achievements/detect.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectAllAchievements, type MatchHistoryEntry } from './detect';

describe('detectAllAchievements', () => {
  function entry(
    playerId: string,
    matchId: string,
    recordedAt: string,
    eloBefore: number,
    eloAfter: number,
    isWin: boolean,
    opts: { hasBagelSet?: boolean; isDoubleBagel?: boolean } = {},
  ): MatchHistoryEntry {
    return {
      playerId,
      matchId,
      recordedAt,
      eloBefore,
      eloAfter,
      isWin,
      hasBagelSet: opts.hasBagelSet ?? false,
      isDoubleBagel: opts.isDoubleBagel ?? false,
    };
  }

  it('returns empty for empty input', () => {
    expect(detectAllAchievements({ history: [], rankEvents: [] })).toEqual([]);
  });

  it('emits first_match for the first entry of a player', () => {
    const grants = detectAllAchievements({
      history: [entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1520, true)],
      rankEvents: [],
    });
    expect(grants.find((g) => g.playerId === 'p1' && g.achievementId === 'first_match')).toBeDefined();
  });

  it('emits first_win for the first winning entry', () => {
    const grants = detectAllAchievements({
      history: [
        entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1480, false),  // first match — loss
        entry('p1', 'm2', '2026-01-02T10:00:00Z', 1480, 1500, true),   // first win
      ],
      rankEvents: [],
    });
    const winGrant = grants.find((g) => g.playerId === 'p1' && g.achievementId === 'first_win');
    expect(winGrant).toBeDefined();
    expect(winGrant?.triggerMatchId).toBe('m2');
  });

  it('emits matches_10 when matchesPlayed crosses 10', () => {
    const history: MatchHistoryEntry[] = [];
    for (let i = 1; i <= 10; i++) {
      history.push(entry('p1', `m${i}`, `2026-01-${String(i).padStart(2, '0')}T10:00:00Z`, 1500, 1500, false));
    }
    const grants = detectAllAchievements({ history, rankEvents: [] });
    const tenGrant = grants.find((g) => g.playerId === 'p1' && g.achievementId === 'matches_10');
    expect(tenGrant).toBeDefined();
    expect(tenGrant?.triggerMatchId).toBe('m10');
  });

  it('emits streak_3 after 3 consecutive wins, only once', () => {
    const history: MatchHistoryEntry[] = [
      entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1520, true),
      entry('p1', 'm2', '2026-01-02T10:00:00Z', 1520, 1540, true),
      entry('p1', 'm3', '2026-01-03T10:00:00Z', 1540, 1560, true),
      entry('p1', 'm4', '2026-01-04T10:00:00Z', 1560, 1540, false),  // loss resets
      entry('p1', 'm5', '2026-01-05T10:00:00Z', 1540, 1560, true),
      entry('p1', 'm6', '2026-01-06T10:00:00Z', 1560, 1580, true),
      entry('p1', 'm7', '2026-01-07T10:00:00Z', 1580, 1600, true),  // would be streak 3 again
    ];
    const grants = detectAllAchievements({ history, rankEvents: [] });
    const streakGrants = grants.filter((g) => g.achievementId === 'streak_3');
    expect(streakGrants).toHaveLength(1);
    expect(streakGrants[0].triggerMatchId).toBe('m3');
  });

  it('does not emit streak_3 for fewer than 3 consecutive wins', () => {
    const history: MatchHistoryEntry[] = [
      entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1520, true),
      entry('p1', 'm2', '2026-01-02T10:00:00Z', 1520, 1540, true),
      entry('p1', 'm3', '2026-01-03T10:00:00Z', 1540, 1520, false),
    ];
    const grants = detectAllAchievements({ history, rankEvents: [] });
    expect(grants.find((g) => g.achievementId === 'streak_3')).toBeUndefined();
  });

  it('emits elo_1600 the first time eloAfter crosses 1600', () => {
    const history: MatchHistoryEntry[] = [
      entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1580, true),
      entry('p1', 'm2', '2026-01-02T10:00:00Z', 1580, 1610, true),  // crosses 1600
      entry('p1', 'm3', '2026-01-03T10:00:00Z', 1610, 1590, false),
      entry('p1', 'm4', '2026-01-04T10:00:00Z', 1590, 1620, true),  // crosses again — should NOT emit
    ];
    const grants = detectAllAchievements({ history, rankEvents: [] });
    const eloGrants = grants.filter((g) => g.achievementId === 'elo_1600');
    expect(eloGrants).toHaveLength(1);
    expect(eloGrants[0].triggerMatchId).toBe('m2');
  });

  it('emits rank_1 from a rank_into_top1 event, only once', () => {
    const grants = detectAllAchievements({
      history: [],
      rankEvents: [
        { playerId: 'p1', type: 'rank_into_top1', recordedAt: '2026-01-01T10:00:00Z', newElo: 1700 },
        { playerId: 'p1', type: 'rank_into_top1', recordedAt: '2026-02-01T10:00:00Z', newElo: 1750 },  // second time
      ],
    });
    const rankGrants = grants.filter((g) => g.achievementId === 'rank_1');
    expect(rankGrants).toHaveLength(1);
    expect(rankGrants[0].earnedAt).toBe('2026-01-01T10:00:00Z');
  });

  it('emits bagel when hasBagelSet is true', () => {
    const grants = detectAllAchievements({
      history: [entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1520, true, { hasBagelSet: true })],
      rankEvents: [],
    });
    expect(grants.find((g) => g.achievementId === 'bagel')).toBeDefined();
  });

  it('emits double_bagel when isDoubleBagel is true', () => {
    const grants = detectAllAchievements({
      history: [entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1520, true, { hasBagelSet: true, isDoubleBagel: true })],
      rankEvents: [],
    });
    expect(grants.find((g) => g.achievementId === 'double_bagel')).toBeDefined();
    expect(grants.find((g) => g.achievementId === 'bagel')).toBeDefined();
  });

  it('does not duplicate bagel across multiple matches', () => {
    const grants = detectAllAchievements({
      history: [
        entry('p1', 'm1', '2026-01-01T10:00:00Z', 1500, 1520, true, { hasBagelSet: true }),
        entry('p1', 'm2', '2026-01-02T10:00:00Z', 1520, 1540, true, { hasBagelSet: true }),
      ],
      rankEvents: [],
    });
    const bagels = grants.filter((g) => g.achievementId === 'bagel');
    expect(bagels).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- src/lib/achievements/detect.test.ts`
Expected: FAIL with `Cannot find module './detect'`.

- [ ] **Step 3: Implement the detector**

Create `src/lib/achievements/detect.ts`:

```ts
import type { RankChangeEvent } from '@/lib/feed/rank-changes';

export interface MatchHistoryEntry {
  playerId: string;
  matchId: string;
  recordedAt: string;
  eloBefore: number;
  eloAfter: number;
  isWin: boolean;
  hasBagelSet: boolean;
  isDoubleBagel: boolean;
}

export interface PlayerAchievementGrant {
  playerId: string;
  achievementId: string;
  earnedAt: string;
  triggerMatchId: string | null;
}

interface DetectInput {
  history: MatchHistoryEntry[];
  rankEvents: RankChangeEvent[];
}

interface PlayerState {
  matchesPlayed: number;
  wins: number;
  currentStreak: number;
  hasFirstMatch: boolean;
  hasFirstWin: boolean;
  hasMatches10: boolean;
  hasMatches50: boolean;
  hasMatches100: boolean;
  hasWins25: boolean;
  hasStreak3: boolean;
  hasStreak5: boolean;
  hasStreak10: boolean;
  hasElo1600: boolean;
  hasElo1800: boolean;
  hasRank1: boolean;
  hasBagel: boolean;
  hasDoubleBagel: boolean;
}

function newState(): PlayerState {
  return {
    matchesPlayed: 0,
    wins: 0,
    currentStreak: 0,
    hasFirstMatch: false,
    hasFirstWin: false,
    hasMatches10: false,
    hasMatches50: false,
    hasMatches100: false,
    hasWins25: false,
    hasStreak3: false,
    hasStreak5: false,
    hasStreak10: false,
    hasElo1600: false,
    hasElo1800: false,
    hasRank1: false,
    hasBagel: false,
    hasDoubleBagel: false,
  };
}

export function detectAllAchievements(input: DetectInput): PlayerAchievementGrant[] {
  const grants: PlayerAchievementGrant[] = [];
  const states = new Map<string, PlayerState>();

  function getState(playerId: string): PlayerState {
    let s = states.get(playerId);
    if (!s) {
      s = newState();
      states.set(playerId, s);
    }
    return s;
  }

  function emit(playerId: string, achievementId: string, earnedAt: string, triggerMatchId: string | null) {
    grants.push({ playerId, achievementId, earnedAt, triggerMatchId });
  }

  // Process rating_history chronologically
  const sortedHistory = [...input.history].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  for (const e of sortedHistory) {
    const s = getState(e.playerId);

    // Counters
    s.matchesPlayed += 1;
    if (e.isWin) {
      s.wins += 1;
      s.currentStreak += 1;
    } else {
      s.currentStreak = 0;
    }

    // first_match
    if (!s.hasFirstMatch) {
      s.hasFirstMatch = true;
      emit(e.playerId, 'first_match', e.recordedAt, e.matchId);
    }

    // matches_10 / 50 / 100
    if (!s.hasMatches10 && s.matchesPlayed >= 10) {
      s.hasMatches10 = true;
      emit(e.playerId, 'matches_10', e.recordedAt, e.matchId);
    }
    if (!s.hasMatches50 && s.matchesPlayed >= 50) {
      s.hasMatches50 = true;
      emit(e.playerId, 'matches_50', e.recordedAt, e.matchId);
    }
    if (!s.hasMatches100 && s.matchesPlayed >= 100) {
      s.hasMatches100 = true;
      emit(e.playerId, 'matches_100', e.recordedAt, e.matchId);
    }

    // first_win
    if (e.isWin && !s.hasFirstWin) {
      s.hasFirstWin = true;
      emit(e.playerId, 'first_win', e.recordedAt, e.matchId);
    }

    // wins_25
    if (!s.hasWins25 && s.wins >= 25) {
      s.hasWins25 = true;
      emit(e.playerId, 'wins_25', e.recordedAt, e.matchId);
    }

    // Streaks
    if (!s.hasStreak3 && s.currentStreak >= 3) {
      s.hasStreak3 = true;
      emit(e.playerId, 'streak_3', e.recordedAt, e.matchId);
    }
    if (!s.hasStreak5 && s.currentStreak >= 5) {
      s.hasStreak5 = true;
      emit(e.playerId, 'streak_5', e.recordedAt, e.matchId);
    }
    if (!s.hasStreak10 && s.currentStreak >= 10) {
      s.hasStreak10 = true;
      emit(e.playerId, 'streak_10', e.recordedAt, e.matchId);
    }

    // ELO crossings
    if (!s.hasElo1600 && e.eloAfter >= 1600 && e.eloBefore < 1600) {
      s.hasElo1600 = true;
      emit(e.playerId, 'elo_1600', e.recordedAt, e.matchId);
    }
    if (!s.hasElo1800 && e.eloAfter >= 1800 && e.eloBefore < 1800) {
      s.hasElo1800 = true;
      emit(e.playerId, 'elo_1800', e.recordedAt, e.matchId);
    }

    // Bagel / double bagel
    if (e.hasBagelSet && !s.hasBagel) {
      s.hasBagel = true;
      emit(e.playerId, 'bagel', e.recordedAt, e.matchId);
    }
    if (e.isDoubleBagel && !s.hasDoubleBagel) {
      s.hasDoubleBagel = true;
      emit(e.playerId, 'double_bagel', e.recordedAt, e.matchId);
    }
  }

  // Process rank events: emit rank_1 the first time per player
  const sortedRankEvents = [...input.rankEvents].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  for (const re of sortedRankEvents) {
    if (re.type !== 'rank_into_top1') continue;
    const s = getState(re.playerId);
    if (!s.hasRank1) {
      s.hasRank1 = true;
      emit(re.playerId, 'rank_1', re.recordedAt, null);
    }
  }

  return grants;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- src/lib/achievements/detect.test.ts`
Expected: 11 tests pass.

- [ ] **Step 5: Run full suite + tsc + lint**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. Tests = 88 + 11 = 99.

- [ ] **Step 6: Commit**

```bash
git add src/lib/achievements/detect.ts src/lib/achievements/detect.test.ts
git commit -m "feat(achievements): add detectAllAchievements helper

Pure helper that walks rating_history chronologically, tracks
per-player state (matches, wins, streak, max ELO), and emits
PlayerAchievementGrant records when thresholds are crossed.
Idempotent within a single call (each achievement emitted at
most once per player). Used by both backfill and the post-match
hook."
```

---

## Task 5: Backfill in `migrate-db`

**Files:**
- Modify: `src/app/api/migrate-db/route.ts`

The backfill runs the detector once with the full historical dataset and persists missing grants. Idempotent against already-stored grants.

- [ ] **Step 1: Add imports**

At the top of `src/app/api/migrate-db/route.ts`, add the new imports next to existing ones:

```ts
import { detectAllAchievements, type MatchHistoryEntry } from '@/lib/achievements/detect';
import { detectRankChanges } from '@/lib/feed/rank-changes';
import { matches as matchesTable, matchSets as matchSetsTable, players as playersTable, ratingHistory, playerAchievements } from '@/lib/db/schema';
```

(Note: the existing imports may already include `matches`, `players`, etc. with different aliases — preserve whatever is there. The point is to import `playerAchievements`, `ratingHistory`, `matchSets` and the helpers if they're not already imported.)

- [ ] **Step 2: Add the backfill step at the end of the migration**

In the same file, find the existing Step 5 (heuristic backfill of sides) which is the last data step. Add a new Step 6 immediately AFTER Step 5 and BEFORE the `return NextResponse.json(...)` final response:

```ts
    // Step 6: Backfill achievements retroactively (Block 3 — achievements)
    // Walk rating_history + match_sets globally, run the detector, and persist
    // grants that don't already exist for (player_id, achievement_id).
    const allHistory = await db.select().from(ratingHistory);
    const allSetsRows = await db.select().from(matchSetsTable);
    const allMatchesRows = await db.select().from(matchesTable);

    // Group sets by matchId
    const setsByMatch = new Map<string, { team1Games: number; team2Games: number }[]>();
    for (const s of allSetsRows) {
      const arr = setsByMatch.get(s.matchId) ?? [];
      arr.push({ team1Games: s.team1Games, team2Games: s.team2Games });
      setsByMatch.set(s.matchId, arr);
    }

    // Index winnerTeam per matchId
    const winnerByMatch = new Map<string, number | null>();
    const team1ByMatch = new Map<string, [string, string]>();
    for (const m of allMatchesRows) {
      winnerByMatch.set(m.id, m.winnerTeam);
      team1ByMatch.set(m.id, [m.team1Player1Id, m.team1Player2Id]);
    }

    // Build MatchHistoryEntry[] from rating_history
    const historyForDetector: MatchHistoryEntry[] = allHistory.map((rh) => {
      const winner = winnerByMatch.get(rh.matchId) ?? null;
      const t1 = team1ByMatch.get(rh.matchId);
      const isTeam1 = t1 ? (rh.playerId === t1[0] || rh.playerId === t1[1]) : false;
      const isWin = winner !== null && ((isTeam1 && winner === 1) || (!isTeam1 && winner === 2));

      const sets = setsByMatch.get(rh.matchId) ?? [];
      const winningSets = sets.filter((s) =>
        isTeam1 ? s.team1Games > s.team2Games : s.team2Games > s.team1Games
      );
      const losingSetsForOurTeam = sets.filter((s) =>
        isTeam1 ? s.team2Games > s.team1Games : s.team1Games > s.team2Games
      );

      // hasBagelSet: any set we won 6-0
      const hasBagelSet = winningSets.some((s) =>
        isTeam1 ? s.team1Games === 6 && s.team2Games === 0 : s.team2Games === 6 && s.team1Games === 0
      );

      // isDoubleBagel: we won the match, won 2 sets, both 6-0, lost 0 sets
      const wonAllSetsBagel = winningSets.length >= 2 &&
        winningSets.every((s) => isTeam1 ? s.team1Games === 6 && s.team2Games === 0 : s.team2Games === 6 && s.team1Games === 0);
      const isDoubleBagel = isWin && wonAllSetsBagel && losingSetsForOurTeam.length === 0;

      return {
        playerId: rh.playerId,
        matchId: rh.matchId,
        recordedAt: rh.recordedAt,
        eloBefore: rh.eloBefore,
        eloAfter: rh.eloAfter,
        isWin,
        hasBagelSet,
        isDoubleBagel,
      };
    });

    // Compute rank events from full history + current player snapshot
    const allPlayersSnapshot = await db.select().from(playersTable);
    const rankEvents = detectRankChanges(allHistory, allPlayersSnapshot);

    // Run detector
    const candidateGrants = detectAllAchievements({ history: historyForDetector, rankEvents });

    // Idempotency: load existing grants
    const existingGrants = await db.select().from(playerAchievements);
    const existingKey = new Set(existingGrants.map((g) => `${g.playerId}:${g.achievementId}`));

    const grantsToInsert = candidateGrants.filter(
      (g) => !existingKey.has(`${g.playerId}:${g.achievementId}`)
    );

    for (const g of grantsToInsert) {
      await db.insert(playerAchievements).values({
        playerId: g.playerId,
        achievementId: g.achievementId,
        earnedAt: g.earnedAt,
        triggerMatchId: g.triggerMatchId,
      });
    }
```

(Adapt variable names like `matchesTable` / `playersTable` to whatever aliases are already in use in the file. The key is that the imports refer to the right schema tables.)

- [ ] **Step 3: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 99/99 tests.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/migrate-db/route.ts
git commit -m "feat(migrate): backfill achievements from rating history

Step 6 of the migration runs detectAllAchievements over the full
rating_history + match_sets + rank events, then persists any
grants that aren't already stored. Idempotent — re-running the
migration adds zero rows. Veterans of the LPT will see their
constellation of historical badges from day 1."
```

---

## Task 6: Hook in `processMatchRatings`

When a match is closed, run the detector for the 4 affected players against the freshly-updated history and persist new grants.

**Files:**
- Modify: `src/lib/rating/process-match.ts`

- [ ] **Step 1: Add imports + the helper function**

At the top of `src/lib/rating/process-match.ts`, add (next to existing imports):

```ts
import { matches as matchesTable, matchSets as matchSetsTable, playerAchievements } from '@/lib/db/schema';
import { detectAllAchievements, type MatchHistoryEntry } from '@/lib/achievements/detect';
import { detectRankChanges } from '@/lib/feed/rank-changes';
import { inArray } from 'drizzle-orm';
```

(Adapt aliases to whatever's already in the file. `matches` and `matchSets` may already be imported; if so, alias the new imports differently or reuse.)

At the bottom of the file, AFTER the `processMatchRatings` function, add the achievements applier helper:

```ts
async function applyAchievementsForMatch(matchId: string) {
  // Load history + sets + matches + players. We need globals to compute
  // bagel/doubleBagel and rank changes correctly.
  const allHistory = await db.select().from(ratingHistory);
  const allSetsRows = await db.select().from(matchSetsTable);
  const allMatchesRows = await db.select().from(matchesTable);
  const allPlayersSnapshot = await db.select().from(players);

  // Group sets by matchId
  const setsByMatch = new Map<string, { team1Games: number; team2Games: number }[]>();
  for (const s of allSetsRows) {
    const arr = setsByMatch.get(s.matchId) ?? [];
    arr.push({ team1Games: s.team1Games, team2Games: s.team2Games });
    setsByMatch.set(s.matchId, arr);
  }

  // Index winnerTeam + team1 ids per matchId
  const winnerByMatch = new Map<string, number | null>();
  const team1ByMatch = new Map<string, [string, string]>();
  for (const m of allMatchesRows) {
    winnerByMatch.set(m.id, m.winnerTeam);
    team1ByMatch.set(m.id, [m.team1Player1Id, m.team1Player2Id]);
  }

  const historyForDetector: MatchHistoryEntry[] = allHistory.map((rh) => {
    const winner = winnerByMatch.get(rh.matchId) ?? null;
    const t1 = team1ByMatch.get(rh.matchId);
    const isTeam1 = t1 ? (rh.playerId === t1[0] || rh.playerId === t1[1]) : false;
    const isWin = winner !== null && ((isTeam1 && winner === 1) || (!isTeam1 && winner === 2));

    const sets = setsByMatch.get(rh.matchId) ?? [];
    const winningSets = sets.filter((s) =>
      isTeam1 ? s.team1Games > s.team2Games : s.team2Games > s.team1Games
    );
    const losingSetsForOurTeam = sets.filter((s) =>
      isTeam1 ? s.team2Games > s.team1Games : s.team1Games > s.team2Games
    );

    const hasBagelSet = winningSets.some((s) =>
      isTeam1 ? s.team1Games === 6 && s.team2Games === 0 : s.team2Games === 6 && s.team1Games === 0
    );
    const wonAllSetsBagel = winningSets.length >= 2 &&
      winningSets.every((s) => isTeam1 ? s.team1Games === 6 && s.team2Games === 0 : s.team2Games === 6 && s.team1Games === 0);
    const isDoubleBagel = isWin && wonAllSetsBagel && losingSetsForOurTeam.length === 0;

    return {
      playerId: rh.playerId,
      matchId: rh.matchId,
      recordedAt: rh.recordedAt,
      eloBefore: rh.eloBefore,
      eloAfter: rh.eloAfter,
      isWin,
      hasBagelSet,
      isDoubleBagel,
    };
  });

  const rankEvents = detectRankChanges(allHistory, allPlayersSnapshot);
  const candidateGrants = detectAllAchievements({ history: historyForDetector, rankEvents });

  // Find the 4 player ids of the match we just closed
  const thisMatch = allMatchesRows.find((m) => m.id === matchId);
  if (!thisMatch) return;
  const affectedPlayers = new Set<string>([
    thisMatch.team1Player1Id,
    thisMatch.team1Player2Id,
    thisMatch.team2Player1Id,
    thisMatch.team2Player2Id,
  ]);

  // Filter to grants for the 4 affected players (others' grants don't change here)
  const candidatesForAffected = candidateGrants.filter((g) => affectedPlayers.has(g.playerId));

  // Idempotency
  const existingGrants = await db
    .select()
    .from(playerAchievements)
    .where(inArray(playerAchievements.playerId, [...affectedPlayers]));
  const existingKey = new Set(existingGrants.map((g) => `${g.playerId}:${g.achievementId}`));

  const grantsToInsert = candidatesForAffected.filter(
    (g) => !existingKey.has(`${g.playerId}:${g.achievementId}`)
  );

  for (const g of grantsToInsert) {
    await db.insert(playerAchievements).values({
      playerId: g.playerId,
      achievementId: g.achievementId,
      earnedAt: g.earnedAt,
      triggerMatchId: g.triggerMatchId,
    });
  }
}
```

- [ ] **Step 2: Call the applier from `processMatchRatings`**

Find the LAST line of `processMatchRatings` (the closing brace of the for-loop over pairs). Inside the function body, AFTER the closing brace of the pair loop and BEFORE the function's outer closing brace, add:

```ts
  // Apply achievements for the 4 players based on the freshly-updated state.
  await applyAchievementsForMatch(match.id);
```

- [ ] **Step 3: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 99/99 tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rating/process-match.ts
git commit -m "feat(rating): apply achievements after match closure

After ELO and pair_stats are updated, run the achievements
detector for the 4 affected players and persist any new grants.
Idempotent — already-earned achievements are skipped."
```

---

## Task 7: `<AchievementsCard>` component

**Files:**
- Create: `src/components/shared/achievements-card.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/shared/achievements-card.tsx`:

```tsx
import { ACHIEVEMENTS, type Achievement } from '@/lib/achievements/catalog';

interface EarnedGrant {
  achievementId: string;
  earnedAt: string;
}

interface AchievementsCardProps {
  earned: EarnedGrant[];
}

function formatEarnedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AchievementsCard({ earned }: AchievementsCardProps) {
  const earnedMap = new Map(earned.map((g) => [g.achievementId, g.earnedAt]));
  const earnedCount = earned.length;
  const total = ACHIEVEMENTS.length;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🏆 Logros</p>
        <span className="text-xs text-gray-400">{earnedCount} / {total}</span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {ACHIEVEMENTS.map((a: Achievement) => {
          const earnedAt = earnedMap.get(a.id);
          const isEarned = earnedAt !== undefined;
          const tooltip = isEarned
            ? `${a.name} — ${a.description} · Desbloqueado el ${formatEarnedDate(earnedAt)}`
            : `${a.name} — ${a.description} (bloqueado)`;
          return (
            <div
              key={a.id}
              title={tooltip}
              className={`aspect-square rounded-xl flex items-center justify-center text-2xl ${
                isEarned
                  ? 'bg-gradient-to-br from-yellow-100 to-yellow-300 ring-1 ring-yellow-400/50'
                  : 'bg-gray-100 opacity-40 grayscale'
              }`}
            >
              {a.icon}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 99/99 tests.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/achievements-card.tsx
git commit -m "feat(achievements): add AchievementsCard component

Compact 7-column grid showing all 14 achievements. Earned ones
get a yellow gradient + ring. Locked ones are greyed out with
opacity. Tooltip via title attribute shows name, description,
and earned date when applicable."
```

---

## Task 8: Wire `<AchievementsCard>` into the player profile

**Files:**
- Modify: `src/app/(public)/players/[id]/page.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/app/(public)/players/[id]/page.tsx`, add:

```tsx
import { playerAchievements } from '@/lib/db/schema';
import { AchievementsCard } from '@/components/shared/achievements-card';
```

(Adapt — `playerAchievements` may need to be added to the existing schema import, e.g. `import { ..., playerAchievements } from '@/lib/db/schema';`.)

- [ ] **Step 2: Load grants**

In the body of the page component, after the existing data queries and before the `return` statement, add:

```tsx
  const earnedGrants = await db
    .select()
    .from(playerAchievements)
    .where(eq(playerAchievements.playerId, id))
    .orderBy(desc(playerAchievements.earnedAt));
```

(If `desc` is not yet imported from `drizzle-orm`, add it.)

- [ ] **Step 3: Render the card**

Find where `<UnplayedPartnersCard>` is rendered. Immediately AFTER it, insert:

```tsx
      <AchievementsCard
        earned={earnedGrants.map((g) => ({ achievementId: g.achievementId, earnedAt: g.earnedAt }))}
      />
```

- [ ] **Step 4: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 99/99 tests.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(public)/players/[id]/page.tsx'
git commit -m "feat(profile): render AchievementsCard in player profile

Loads playerAchievements rows for the target player and renders
them as a compact 14-cell grid. Locked badges are visible but
greyed out — clear progress indicator."
```

---

## Task 9: Feed — add `achievement_unlocked` event type

**Files:**
- Modify: `src/lib/feed/build-feed.ts`
- Modify: `src/lib/feed/build-feed.test.ts`

The feed needs a new event type. Backfilled grants (with `earnedAt` from history) must be excluded via a date cutoff so they don't flood the feed on day 1.

- [ ] **Step 1: Write failing test**

Open `src/lib/feed/build-feed.test.ts`. Add this test inside the `describe('buildFeed', ...)` block, alongside the existing tests:

```ts
  it('emits an achievement_unlocked event for grants after the cutoff', () => {
    const events = buildFeed({
      matches: [],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [],
      achievements: [
        { playerId: 'p1', achievementId: 'streak_3', earnedAt: '2026-04-29T10:00:00Z' },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('achievement_unlocked');
  });

  it('drops achievement events earned before the cutoff', () => {
    const events = buildFeed({
      matches: [],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [],
      achievements: [
        { playerId: 'p1', achievementId: 'first_match', earnedAt: '2026-01-01T00:00:00Z' },
      ],
    });
    expect(events).toHaveLength(0);
  });

  it('attaches the resolved Achievement object to the event', () => {
    const events = buildFeed({
      matches: [],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [],
      achievements: [
        { playerId: 'p1', achievementId: 'streak_3', earnedAt: '2026-04-29T10:00:00Z' },
      ],
    });
    expect(events[0].type).toBe('achievement_unlocked');
    if (events[0].type === 'achievement_unlocked') {
      expect(events[0].playerId).toBe('p1');
      expect(events[0].achievement.id).toBe('streak_3');
      expect(events[0].achievement.name).toBe('Racha de 3');
    }
  });

  it('drops unknown achievementIds defensively', () => {
    const events = buildFeed({
      matches: [],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [],
      achievements: [
        { playerId: 'p1', achievementId: 'nonexistent_id', earnedAt: '2026-04-29T10:00:00Z' },
      ],
    });
    expect(events).toHaveLength(0);
  });
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- src/lib/feed/build-feed.test.ts`
Expected: FAIL — the new tests reference an `achievements` field on `BuildFeedInput` that doesn't exist yet, plus an `achievement_unlocked` event type.

- [ ] **Step 3: Update `build-feed.ts`**

Open `src/lib/feed/build-feed.ts`.

Add imports at the top (next to existing imports):

```ts
import { ACHIEVEMENT_BY_ID, type Achievement } from '@/lib/achievements/catalog';
```

Add the new event variant to the `FeedEvent` union:

```ts
  | {
      type: 'achievement_unlocked';
      timestamp: string;
      playerId: string;
      achievement: Achievement;
    };
```

Add the `achievements` field to `BuildFeedInput`:

```ts
interface BuildFeedInput {
  matches: MatchLike[];
  matchSets: MatchSetLike[];
  ratingHistory: RatingHistoryLike[];
  players: PlayerLike[];
  rankEvents: RankChangeEvent[];
  achievements: { playerId: string; achievementId: string; earnedAt: string }[];
}
```

Add the cutoff constant near the top of the file:

```ts
/** Hard-coded cutoff: only achievement events earned after this date appear in the feed.
 *  Block 3 deploy date — anything before this came from the historical backfill. */
const ACHIEVEMENT_FEED_CUTOFF = '2026-04-29T00:00:00Z';
```

Inside `buildFeed`, after the existing event-building loops (rank events, players) and BEFORE the `events.sort(...)`, add:

```ts
  for (const a of input.achievements) {
    if (a.earnedAt < ACHIEVEMENT_FEED_CUTOFF) continue;
    const achievement = ACHIEVEMENT_BY_ID[a.achievementId];
    if (!achievement) continue;  // unknown id — defensive
    events.push({
      type: 'achievement_unlocked',
      timestamp: a.earnedAt,
      playerId: a.playerId,
      achievement,
    });
  }
```

Also update the existing tests in the same file: every `buildFeed({...})` call now must include `achievements: []` to satisfy TypeScript. Find every existing test that passes a `BuildFeedInput` literal and add `achievements: []` next to the other fields.

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- src/lib/feed/build-feed.test.ts`
Expected: all existing + 4 new tests pass.

- [ ] **Step 5: Run full suite + tsc + lint**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. Tests = 99 + 4 = 103.

- [ ] **Step 6: Commit**

```bash
git add src/lib/feed/build-feed.ts src/lib/feed/build-feed.test.ts
git commit -m "feat(feed): add achievement_unlocked event type with date cutoff

New event variant for the feed. Backfilled grants (whose earnedAt
predates the deploy) are filtered out via a hard-coded cutoff so
they don't flood the feed when the migration runs. Unknown
achievementIds are dropped defensively."
```

---

## Task 10: `<ActivityFeedItem>` — render `achievement_unlocked`

**Files:**
- Modify: `src/components/shared/activity-feed-item.tsx`

- [ ] **Step 1: Add the new branch**

Open `src/components/shared/activity-feed-item.tsx`. The component has multiple `if (event.type === 'X')` branches. Find the last branch (currently the `// new_player` one with `return (...)` directly).

BEFORE that final `// new_player` return, add a new branch for `achievement_unlocked`:

```tsx
  if (event.type === 'achievement_unlocked') {
    const player = playerMap[event.playerId];
    return (
      <Link href={`/players/${event.playerId}`} className="block">
        <div className="bg-white border border-yellow-200 rounded-2xl p-4 flex items-start gap-3 hover:border-yellow-300 hover:shadow-sm transition-all">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-100 to-yellow-300 flex items-center justify-center text-lg shrink-0">
            {event.achievement.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 leading-snug">
              <span className="font-bold">{player?.name ?? '?'}</span> desbloquea{' '}
              <span className="font-bold">{event.achievement.name}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1.5">{event.achievement.description} · {time}</p>
          </div>
        </div>
      </Link>
    );
  }
```

- [ ] **Step 2: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 103/103 tests.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/activity-feed-item.tsx
git commit -m "feat(feed): render achievement_unlocked events

Yellow-themed card matching the achievements card aesthetic.
Shows '<Player> desbloquea <Name>' with the icon and the
achievement description. Click navigates to the player profile."
```

---

## Task 11: Wire achievements into the dashboard feed

**Files:**
- Modify: `src/app/(public)/page.tsx`

The dashboard already builds the feed via `buildFeed`. Add a query for recent achievement grants and pass them to `buildFeed`.

- [ ] **Step 1: Add the import**

Add `playerAchievements` to the existing schema import in `src/app/(public)/page.tsx`:

```tsx
import { players, matches, matchSets, ratingHistory, playerAchievements } from '@/lib/db/schema';
```

- [ ] **Step 2: Add the query to the parallel block**

Find the `Promise.all` block where the dashboard fetches its data. Add a new query inside the array:

```tsx
    db.select().from(playerAchievements).orderBy(desc(playerAchievements.earnedAt)).limit(20),
```

Add a corresponding destructured variable to the result, e.g.:

```tsx
  const [
    topPlayers,
    recentMatchesAll,
    upcomingMatches,
    totalMatchesRow,
    totalPlayersRow,
    recentHistory,
    recentNewPlayers,
    recentAchievements,   // <- new
  ] = await Promise.all([
    // ... existing queries ...
    db.select().from(playerAchievements).orderBy(desc(playerAchievements.earnedAt)).limit(20),
  ]);
```

- [ ] **Step 3: Pass to `buildFeed`**

Find the existing call to `buildFeed({...})`. Add the `achievements` field:

```tsx
  const feedEvents = buildFeed({
    matches: recentMatchesAll,
    matchSets: allSets,
    ratingHistory: recentHistory,
    players: recentNewPlayers,
    rankEvents,
    achievements: recentAchievements.map((a) => ({
      playerId: a.playerId,
      achievementId: a.achievementId,
      earnedAt: a.earnedAt,
    })),
  });
```

- [ ] **Step 4: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 103/103 tests.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(public)/page.tsx'
git commit -m "feat(dashboard): pass achievements to the activity feed

Loads the 20 most recent player_achievements rows and feeds
them through buildFeed. The cutoff filter inside buildFeed
ensures only post-deploy grants surface."
```

---

## Task 12: Final verification + push + migration

- [ ] **Step 1: Full verification**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, **103/103 tests** pass (88 baseline + 11 detector + 4 feed).

- [ ] **Step 2: Build**

Run: `TURSO_DATABASE_URL="file:./.skip-db.sqlite" TURSO_AUTH_TOKEN="" npm run build && rm -f .skip-db.sqlite .skip-db.sqlite-journal`
Expected: build succeeds.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feature/achievements
```

- [ ] **Step 4: After deploy lands — run the migration**

Wait for Vercel to deploy main (post-merge). Then:

```bash
curl -X POST https://lomeros-padel-tour.vercel.app/api/migrate-db
```

Expected: `{"success":true,"message":"Migración completada"}`

This step:
1. Creates the `player_achievements` table.
2. Backfills all historical achievement grants from rating_history.

After success, visit a player profile: should see the achievements card with several yellow-filled badges (depending on player history).

- [ ] **Step 5: Manual smoke test**

In the deployed app:
- Open a veteran player's profile (someone with 25+ matches): the AchievementsCard should show many earned badges.
- Open a fresh player's profile (someone with 1-2 matches): only `first_match` (and maybe `first_win`) should be earned.
- Hover/tap an earned badge: tooltip shows name + description + earned date.
- Hover/tap a locked badge: tooltip shows name + description + "(bloqueado)".
- The dashboard feed should NOT show backfilled achievement events (they're pre-cutoff).
- After closing a NEW match that triggers a badge unlock, the achievement should appear in the feed.

---

## Self-review (already done by author)

- **Spec coverage:**
  - Schema (player_achievements) → Tasks 1, 2.
  - Catalog → Task 3.
  - Detector with TDD → Task 4.
  - Backfill in migrate-db → Task 5.
  - Hook in process-match → Task 6.
  - AchievementsCard → Task 7.
  - Profile wiring → Task 8.
  - Feed event type + cutoff + tests → Task 9.
  - Feed item rendering → Task 10.
  - Dashboard wiring → Task 11.
  - Verify + push + migration → Task 12.
- **Placeholder scan:** all code blocks contain real, complete code.
- **Type consistency:**
  - `PlayerAchievementGrant` defined in Task 4 (detect.ts), consumed in Tasks 5 (backfill) and 6 (hook).
  - `Achievement` from catalog (Task 3) imported in Tasks 4 (detector types), 7 (UI card), 9 (feed event).
  - `MatchHistoryEntry` defined in Task 4, used in Tasks 5 + 6.
  - `FeedEvent` extended in Task 9, consumed by `<ActivityFeedItem>` in Task 10.
  - `BuildFeedInput.achievements` added in Task 9, populated by Task 11.
