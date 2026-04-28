# Activity Feed + ELO Chart Enhancements + Pareja Inédita Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build out Block 1 of the roadmap: an activity feed in the dashboard, enhancements to the existing ELO chart (date X-axis + rank-change markers + sparkline in profile hero), and the "pareja inédita" feature surfaced both in the player profile and as a badge in the pair recommender.

**Architecture:** Four pure helpers built TDD-first (`relativeTime`, `detectRankChanges`, `findUnplayedPartners`, `buildFeed`), then UI components consumed by the dashboard, profile, and match detail pages. No DB schema changes — everything derives from existing tables (`matches`, `match_sets`, `rating_history`, `pair_stats`, `players`).

**Tech Stack:** Next 16.2.2 (App Router), React 19, drizzle-orm, recharts (already installed), vitest, Tailwind v4.

**Verification model:**
- Unit tests for each new helper (`*.test.ts` colocated).
- Per task: `npx tsc --noEmit && npm run lint && npm test`. No regressions allowed.
- Manual smoke at the end: dashboard, player profile, scheduled match recommender.

**Background:** spec at `docs/superpowers/specs/2026-04-28-activity-feed-and-discovery-design.md`. Read before starting.

**Notable constraints:**
- Codebase is Next 16 with breaking changes (per `AGENTS.md`). When in doubt, check `node_modules/next/dist/docs/`.
- Baseline: 56 tests across 6 files. Track this number.
- Recharts is already installed (`v3.8.1`) and used in `elo-chart.tsx`.
- The existing `EloChart` already exists and is rendered in the player profile (line 210 of `src/app/(public)/players/[id]/page.tsx`). We're enhancing it, not replacing it.

---

## Pre-flight

- [ ] **Step 0a: Create and switch to feature branch**

```bash
cd /Users/gar/Personal/ClaudeCode/lomeros-padel-tour
git checkout -b feature/activity-feed-and-discovery
```

Expected: `Switched to a new branch 'feature/activity-feed-and-discovery'`.

- [ ] **Step 0b: Confirm baseline**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 56 tests pass across 6 files.

---

## Task 1: `relativeTime` helper (TDD)

Spanish relative-time formatter for feed timestamps and similar.

**Files:**
- Create: `src/lib/format/relative-time.ts`
- Create: `src/lib/format/relative-time.test.ts`

- [ ] **Step 1: Write failing test file**

Create `src/lib/format/relative-time.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { relativeTime } from './relative-time';

describe('relativeTime', () => {
  // Reference "now": 2026-04-28T12:00:00Z
  const now = new Date('2026-04-28T12:00:00Z').getTime();

  it('returns "ahora" for less than a minute ago', () => {
    expect(relativeTime(now - 30 * 1000, now)).toBe('ahora');
  });

  it('returns "hace Nmin" for minutes ago', () => {
    expect(relativeTime(now - 5 * 60 * 1000, now)).toBe('hace 5min');
    expect(relativeTime(now - 1 * 60 * 1000, now)).toBe('hace 1min');
  });

  it('returns "hace Nh" for hours ago (less than 24h)', () => {
    expect(relativeTime(now - 2 * 60 * 60 * 1000, now)).toBe('hace 2h');
    expect(relativeTime(now - 23 * 60 * 60 * 1000, now)).toBe('hace 23h');
  });

  it('returns "ayer" for between 24 and 48 hours ago', () => {
    expect(relativeTime(now - 25 * 60 * 60 * 1000, now)).toBe('ayer');
    expect(relativeTime(now - 47 * 60 * 60 * 1000, now)).toBe('ayer');
  });

  it('returns "hace N días" for between 48h and 7 days', () => {
    expect(relativeTime(now - 3 * 24 * 60 * 60 * 1000, now)).toBe('hace 3 días');
    expect(relativeTime(now - 6 * 24 * 60 * 60 * 1000, now)).toBe('hace 6 días');
  });

  it('returns "hace N sem" for between 7 days and 30 days', () => {
    expect(relativeTime(now - 7 * 24 * 60 * 60 * 1000, now)).toBe('hace 1 sem');
    expect(relativeTime(now - 21 * 24 * 60 * 60 * 1000, now)).toBe('hace 3 sem');
  });

  it('returns "hace N meses" for 30+ days', () => {
    expect(relativeTime(now - 31 * 24 * 60 * 60 * 1000, now)).toBe('hace 1 mes');
    expect(relativeTime(now - 90 * 24 * 60 * 60 * 1000, now)).toBe('hace 3 meses');
  });

  it('accepts ISO string input', () => {
    const iso = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(iso, now)).toBe('hace 2h');
  });

  it('uses Date.now() as default reference', () => {
    // Just verify it doesn't throw with default
    expect(() => relativeTime(Date.now() - 1000)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- src/lib/format/relative-time.test.ts`
Expected: FAIL with `Cannot find module './relative-time'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/format/relative-time.ts`:

```ts
type TimeInput = number | string | Date;

function toMs(t: TimeInput): number {
  if (typeof t === 'number') return t;
  if (t instanceof Date) return t.getTime();
  return new Date(t).getTime();
}

export function relativeTime(timestamp: TimeInput, now: TimeInput = Date.now()): string {
  const ms = toMs(now) - toMs(timestamp);
  if (ms < 60 * 1000) return 'ahora';

  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 60) return `hace ${minutes}min`;

  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return `hace ${hours}h`;

  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 2) return 'ayer';
  if (days < 7) return `hace ${days} días`;

  const weeks = Math.floor(days / 7);
  if (days < 30) return `hace ${weeks} sem`;

  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- src/lib/format/relative-time.test.ts`
Expected: 9 tests pass.

- [ ] **Step 5: Run full suite + tsc + lint**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. Tests = baseline + 9 = 65.

- [ ] **Step 6: Commit**

```bash
git add src/lib/format/relative-time.ts src/lib/format/relative-time.test.ts
git commit -m "feat(format): add relativeTime helper for Spanish timestamps

Pure helper that converts a timestamp into '\''ahora'\'', '\''hace 5min'\'',
'\''hace 2h'\'', '\''ayer'\'', '\''hace 3 días'\'', '\''hace 2 sem'\'', '\''hace 1 mes'\''
strings. Used by the upcoming activity feed."
```

---

## Task 2: `detectRankChanges` helper (TDD)

Identifies when a player crossed a notable ranking threshold (top 3 / #1) by replaying `rating_history` events in order.

**Files:**
- Create: `src/lib/feed/rank-changes.ts`
- Create: `src/lib/feed/rank-changes.test.ts`

- [ ] **Step 1: Write failing test file**

Create `src/lib/feed/rank-changes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectRankChanges, type RankChangeEvent } from './rank-changes';

describe('detectRankChanges', () => {
  // Helper to build a rating_history entry
  function entry(playerId: string, eloAfter: number, eloBefore: number, recordedAt: string) {
    return { playerId, eloBefore, eloAfter, recordedAt };
  }

  it('returns empty array for empty history', () => {
    expect(detectRankChanges([], [])).toEqual([]);
  });

  it('detects entering the top 3', () => {
    // 4 players starting at 1500. Player D plays a match and surges past A.
    const allPlayers = [
      { id: 'A', eloRating: 1600 },
      { id: 'B', eloRating: 1550 },
      { id: 'C', eloRating: 1520 },
      { id: 'D', eloRating: 1500 },
    ];
    // Replay history that took them to current state.
    // Initial state: everyone at 1500. Each entry walks them forward.
    const history = [
      entry('A', 1600, 1500, '2026-01-01T10:00:00Z'),
      entry('B', 1550, 1500, '2026-01-02T10:00:00Z'),
      entry('C', 1520, 1500, '2026-01-03T10:00:00Z'),
      // Now ranks are A=1600, B=1550, C=1520, D=1500. D is #4.
      entry('D', 1530, 1500, '2026-01-04T10:00:00Z'),
      // After D's entry: A=1600, B=1550, D=1530, C=1520. D is #3 (entered top 3).
    ];
    const events = detectRankChanges(history, allPlayers);
    const enterTop3 = events.find((e) => e.playerId === 'D' && e.type === 'rank_into_top3');
    expect(enterTop3).toBeDefined();
    expect(enterTop3?.recordedAt).toBe('2026-01-04T10:00:00Z');
  });

  it('detects leaving the top 3', () => {
    const allPlayers = [
      { id: 'A', eloRating: 1600 },
      { id: 'B', eloRating: 1550 },
      { id: 'C', eloRating: 1450 },  // dropped
      { id: 'D', eloRating: 1530 },
    ];
    const history = [
      entry('A', 1600, 1500, '2026-01-01T10:00:00Z'),
      entry('B', 1550, 1500, '2026-01-02T10:00:00Z'),
      entry('C', 1520, 1500, '2026-01-03T10:00:00Z'),
      // C in top 3 with 1520
      entry('D', 1530, 1500, '2026-01-04T10:00:00Z'),
      // C now #4
      entry('C', 1450, 1520, '2026-01-05T10:00:00Z'),
    ];
    const events = detectRankChanges(history, allPlayers);
    // C leaves top 3 on 2026-01-04 (when D overtook them), not on 2026-01-05.
    const leftTop3 = events.find((e) => e.playerId === 'C' && e.type === 'rank_loses_top3');
    expect(leftTop3).toBeDefined();
    expect(leftTop3?.recordedAt).toBe('2026-01-04T10:00:00Z');
  });

  it('detects becoming #1', () => {
    const allPlayers = [
      { id: 'A', eloRating: 1600 },
      { id: 'B', eloRating: 1700 },  // overtook
    ];
    const history = [
      entry('A', 1600, 1500, '2026-01-01T10:00:00Z'),
      entry('B', 1700, 1500, '2026-01-02T10:00:00Z'),
    ];
    const events = detectRankChanges(history, allPlayers);
    const becameOne = events.find((e) => e.playerId === 'B' && e.type === 'rank_into_top1');
    expect(becameOne).toBeDefined();
  });

  it('detects losing #1', () => {
    const allPlayers = [
      { id: 'A', eloRating: 1600 },
      { id: 'B', eloRating: 1700 },
    ];
    const history = [
      entry('A', 1700, 1500, '2026-01-01T10:00:00Z'),  // A becomes #1
      entry('B', 1700, 1500, '2026-01-02T10:00:00Z'),  // tie, but A keeps #1 (later)
      entry('A', 1600, 1700, '2026-01-03T10:00:00Z'),  // A drops, B becomes #1
    ];
    const events = detectRankChanges(history, allPlayers);
    const lostOne = events.find((e) => e.playerId === 'A' && e.type === 'rank_loses_top1');
    expect(lostOne).toBeDefined();
    expect(lostOne?.recordedAt).toBe('2026-01-03T10:00:00Z');
  });

  it('does not emit events for non-threshold changes', () => {
    // Player ranked #5 → #4: not a top-3 crossing.
    const allPlayers = [
      { id: 'A', eloRating: 1700 },
      { id: 'B', eloRating: 1650 },
      { id: 'C', eloRating: 1600 },
      { id: 'D', eloRating: 1550 },
      { id: 'E', eloRating: 1540 },
    ];
    const history = [
      entry('A', 1700, 1500, '2026-01-01T10:00:00Z'),
      entry('B', 1650, 1500, '2026-01-02T10:00:00Z'),
      entry('C', 1600, 1500, '2026-01-03T10:00:00Z'),
      entry('D', 1550, 1500, '2026-01-04T10:00:00Z'),
      entry('E', 1540, 1500, '2026-01-05T10:00:00Z'),  // E is #5, no event
    ];
    const events = detectRankChanges(history, allPlayers);
    expect(events).toHaveLength(0);
  });

  it('processes history in chronological order regardless of input order', () => {
    const allPlayers = [
      { id: 'A', eloRating: 1700 },
      { id: 'B', eloRating: 1500 },
    ];
    // Provide history out of order
    const history = [
      entry('A', 1700, 1500, '2026-01-02T10:00:00Z'),  // A becomes #1 (was tied at 1500 before)
      entry('B', 1500, 1500, '2026-01-01T10:00:00Z'),  // earlier, no-op
    ];
    const events = detectRankChanges(history, allPlayers);
    expect(events.find((e) => e.type === 'rank_into_top1' && e.playerId === 'A')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- src/lib/feed/rank-changes.test.ts`
Expected: FAIL with `Cannot find module './rank-changes'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/feed/rank-changes.ts`:

```ts
export type RankChangeType =
  | 'rank_into_top1'
  | 'rank_loses_top1'
  | 'rank_into_top3'
  | 'rank_loses_top3';

export interface RankChangeEvent {
  playerId: string;
  type: RankChangeType;
  recordedAt: string;
  newElo: number;
}

interface HistoryEntry {
  playerId: string;
  eloBefore: number;
  eloAfter: number;
  recordedAt: string;
}

interface PlayerSeed {
  id: string;
  eloRating: number;
}

const INITIAL_ELO = 1500;

/**
 * Returns 1-based rank of a player given a map of all current ELOs.
 * Ties: stable, but rank is determined by sorted descending order.
 */
function rankOf(playerId: string, eloMap: Map<string, number>): number {
  const sorted = [...eloMap.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.findIndex(([id]) => id === playerId) + 1;
}

export function detectRankChanges(
  history: HistoryEntry[],
  allPlayers: PlayerSeed[],
): RankChangeEvent[] {
  if (history.length === 0) return [];

  // Initialize every player's elo to INITIAL_ELO.
  const eloMap = new Map<string, number>();
  for (const p of allPlayers) eloMap.set(p.id, INITIAL_ELO);

  // Sort history chronologically.
  const sorted = [...history].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  const events: RankChangeEvent[] = [];

  for (const entry of sorted) {
    if (!eloMap.has(entry.playerId)) {
      // Player not in the snapshot — initialize defensively.
      eloMap.set(entry.playerId, INITIAL_ELO);
    }

    // Compute pre-state ranks for ALL players (because applying entry can affect others).
    const preRanks = new Map<string, number>();
    for (const id of eloMap.keys()) preRanks.set(id, rankOf(id, eloMap));

    // Apply the entry.
    eloMap.set(entry.playerId, entry.eloAfter);

    // Compute post-state ranks for ALL players.
    const postRanks = new Map<string, number>();
    for (const id of eloMap.keys()) postRanks.set(id, rankOf(id, eloMap));

    // Emit events for any player whose rank crossed a threshold.
    for (const id of eloMap.keys()) {
      const pre = preRanks.get(id)!;
      const post = postRanks.get(id)!;

      if (pre !== 1 && post === 1) {
        events.push({ playerId: id, type: 'rank_into_top1', recordedAt: entry.recordedAt, newElo: eloMap.get(id)! });
      } else if (pre === 1 && post !== 1) {
        events.push({ playerId: id, type: 'rank_loses_top1', recordedAt: entry.recordedAt, newElo: eloMap.get(id)! });
      }

      if (pre > 3 && post <= 3) {
        events.push({ playerId: id, type: 'rank_into_top3', recordedAt: entry.recordedAt, newElo: eloMap.get(id)! });
      } else if (pre <= 3 && post > 3) {
        events.push({ playerId: id, type: 'rank_loses_top3', recordedAt: entry.recordedAt, newElo: eloMap.get(id)! });
      }
    }
  }

  return events;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- src/lib/feed/rank-changes.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Run full suite + tsc + lint**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. Tests = previous + 7 = 72.

- [ ] **Step 6: Commit**

```bash
git add src/lib/feed/rank-changes.ts src/lib/feed/rank-changes.test.ts
git commit -m "feat(feed): detect notable rank changes (top 1 / top 3)

Pure helper that replays rating_history events chronologically and
emits an event whenever any player crosses into or out of the top 3
or the #1 spot. Initial ELO defaults to 1500 for every player in
the snapshot. Used by the activity feed and the ELO chart markers."
```

---

## Task 3: `findUnplayedPartners` helper (TDD)

Pure helper that returns the players a given player has never been a partner with.

**Files:**
- Create: `src/lib/players/unplayed-partners.ts`
- Create: `src/lib/players/unplayed-partners.test.ts`

- [ ] **Step 1: Write failing test file**

Create `src/lib/players/unplayed-partners.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findUnplayedPartners } from './unplayed-partners';

describe('findUnplayedPartners', () => {
  function p(id: string, name: string, matchesPlayed = 5) {
    return { id, name, matchesPlayed };
  }
  function pair(player1Id: string, player2Id: string, matchesPlayed = 1) {
    return { player1Id, player2Id, matchesPlayed };
  }

  it('returns empty for a player who has paired with everyone', () => {
    const pedro = p('pedro', 'Pedro');
    const juan = p('juan', 'Juan');
    const luis = p('luis', 'Luis');
    const all = [pedro, juan, luis];
    const stats = [pair('pedro', 'juan'), pair('pedro', 'luis')];
    expect(findUnplayedPartners('pedro', all, stats)).toEqual([]);
  });

  it('returns players the target has not paired with', () => {
    const pedro = p('pedro', 'Pedro');
    const juan = p('juan', 'Juan');
    const luis = p('luis', 'Luis');
    const ana = p('ana', 'Ana');
    const all = [pedro, juan, luis, ana];
    const stats = [pair('pedro', 'juan')];
    const result = findUnplayedPartners('pedro', all, stats);
    expect(result.map((r) => r.id).sort()).toEqual(['ana', 'luis']);
  });

  it('handles pair_stats where target is player2', () => {
    const pedro = p('pedro', 'Pedro');
    const juan = p('juan', 'Juan');
    const luis = p('luis', 'Luis');
    const all = [pedro, juan, luis];
    // pedro is player2 in this stat
    const stats = [pair('juan', 'pedro')];
    const result = findUnplayedPartners('pedro', all, stats);
    expect(result.map((r) => r.id)).toEqual(['luis']);
  });

  it('excludes the target player from the result', () => {
    const pedro = p('pedro', 'Pedro');
    const juan = p('juan', 'Juan');
    const all = [pedro, juan];
    const result = findUnplayedPartners('pedro', all, []);
    expect(result.map((r) => r.id)).toEqual(['juan']);  // not pedro himself
  });

  it('excludes players with 0 matchesPlayed (not active)', () => {
    const pedro = p('pedro', 'Pedro');
    const juan = p('juan', 'Juan');
    const ana = p('ana', 'Ana', 0);  // brand new, no matches
    const all = [pedro, juan, ana];
    const result = findUnplayedPartners('pedro', all, []);
    expect(result.map((r) => r.id)).toEqual(['juan']);  // ana excluded
  });

  it('treats matchesPlayed === 0 in pair_stats as "not paired"', () => {
    const pedro = p('pedro', 'Pedro');
    const juan = p('juan', 'Juan');
    const all = [pedro, juan];
    // Row exists but matchesPlayed is 0 (e.g., zombie row)
    const stats = [pair('pedro', 'juan', 0)];
    const result = findUnplayedPartners('pedro', all, stats);
    expect(result.map((r) => r.id)).toEqual(['juan']);
  });

  it('returns players sorted alphabetically by name', () => {
    const pedro = p('pedro', 'Pedro');
    const charlie = p('charlie', 'Charlie');
    const ana = p('ana', 'Ana');
    const beto = p('beto', 'Beto');
    const all = [pedro, charlie, ana, beto];
    const result = findUnplayedPartners('pedro', all, []);
    expect(result.map((r) => r.name)).toEqual(['Ana', 'Beto', 'Charlie']);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- src/lib/players/unplayed-partners.test.ts`
Expected: FAIL with `Cannot find module './unplayed-partners'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/players/unplayed-partners.ts`:

```ts
interface PlayerLike {
  id: string;
  name: string;
  matchesPlayed: number;
}

interface PairStatLike {
  player1Id: string;
  player2Id: string;
  matchesPlayed: number;
}

export function findUnplayedPartners<P extends PlayerLike>(
  playerId: string,
  allPlayers: P[],
  pairStats: PairStatLike[],
): P[] {
  // Set of partner IDs the target has actually played with.
  const playedWith = new Set<string>();
  for (const ps of pairStats) {
    if (ps.matchesPlayed <= 0) continue;
    if (ps.player1Id === playerId) playedWith.add(ps.player2Id);
    else if (ps.player2Id === playerId) playedWith.add(ps.player1Id);
  }

  return allPlayers
    .filter((p) => p.id !== playerId)
    .filter((p) => p.matchesPlayed > 0)
    .filter((p) => !playedWith.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- src/lib/players/unplayed-partners.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Run full suite + tsc + lint**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. Tests = previous + 7 = 79.

- [ ] **Step 6: Commit**

```bash
git add src/lib/players/unplayed-partners.ts src/lib/players/unplayed-partners.test.ts
git commit -m "feat(players): add findUnplayedPartners helper

Returns the active players (matchesPlayed > 0) that a given player has
never been a partner with. Excludes self and inactive players. Result
sorted alphabetically. Used by the profile card and the recommender
INÉDITA badge."
```

---

## Task 4: `buildFeed` helper (TDD)

Combines matches, rank changes, and new players into a single chronological list of feed events.

**Files:**
- Create: `src/lib/feed/build-feed.ts`
- Create: `src/lib/feed/build-feed.test.ts`

- [ ] **Step 1: Write failing test file**

Create `src/lib/feed/build-feed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFeed, type FeedEvent } from './build-feed';

describe('buildFeed', () => {
  function match(id: string, status: 'scheduled' | 'completed', date: string, t1p1 = 'a', t1p2 = 'b', t2p1 = 'c', t2p2 = 'd') {
    return {
      id, status, date,
      team1Player1Id: t1p1, team1Player2Id: t1p2,
      team2Player1Id: t2p1, team2Player2Id: t2p2,
      winnerTeam: status === 'completed' ? 1 : null,
      location: null,
      createdAt: date,
    };
  }
  function player(id: string, createdAt: string) {
    return { id, name: id.toUpperCase(), createdAt };
  }
  function set(matchId: string, setNumber: number, t1: number, t2: number) {
    return { matchId, setNumber, team1Games: t1, team2Games: t2 };
  }
  function rh(playerId: string, recordedAt: string, matchId: string) {
    return { playerId, matchId, recordedAt, eloBefore: 1500, eloAfter: 1520 };
  }

  it('returns empty array for empty inputs', () => {
    expect(buildFeed({ matches: [], matchSets: [], ratingHistory: [], players: [], rankEvents: [] })).toEqual([]);
  });

  it('emits a match_completed event per completed match', () => {
    const events = buildFeed({
      matches: [match('m1', 'completed', '2026-04-01T10:00:00Z')],
      matchSets: [set('m1', 1, 6, 3), set('m1', 2, 7, 5)],
      ratingHistory: [rh('a', '2026-04-01T11:00:00Z', 'm1')],
      players: [],
      rankEvents: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('match_completed');
    expect(events[0].matchId).toBe('m1');
    // timestamp = recordedAt of the rating_history that closed the match
    expect(events[0].timestamp).toBe('2026-04-01T11:00:00Z');
  });

  it('emits a match_scheduled event per scheduled match', () => {
    const events = buildFeed({
      matches: [match('m2', 'scheduled', '2026-04-02T00:00:00Z')],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('match_scheduled');
  });

  it('emits a rank_change event per rank event', () => {
    const events = buildFeed({
      matches: [],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [
        { playerId: 'a', type: 'rank_into_top3', recordedAt: '2026-04-03T10:00:00Z', newElo: 1600 },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('rank_change');
  });

  it('emits a new_player event per recent player', () => {
    const events = buildFeed({
      matches: [],
      matchSets: [],
      ratingHistory: [],
      players: [player('alice', '2026-04-04T10:00:00Z')],
      rankEvents: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('new_player');
  });

  it('orders events newest first', () => {
    const events = buildFeed({
      matches: [
        match('m1', 'completed', '2026-04-01T00:00:00Z'),
        match('m2', 'completed', '2026-04-03T00:00:00Z'),
      ],
      matchSets: [],
      ratingHistory: [
        rh('a', '2026-04-01T10:00:00Z', 'm1'),
        rh('a', '2026-04-03T10:00:00Z', 'm2'),
      ],
      players: [],
      rankEvents: [],
    });
    expect(events.map((e) => e.timestamp)).toEqual([
      '2026-04-03T10:00:00Z',
      '2026-04-01T10:00:00Z',
    ]);
  });

  it('truncates to top 10 events', () => {
    const matches = Array.from({ length: 15 }, (_, i) =>
      match(`m${i}`, 'completed', `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    );
    const ratingHistory = matches.map((m, i) =>
      rh('a', `2026-04-${String(i + 1).padStart(2, '0')}T10:00:00Z`, m.id),
    );
    const events = buildFeed({ matches, matchSets: [], ratingHistory, players: [], rankEvents: [] });
    expect(events).toHaveLength(10);
  });

  it('does not emit a match_completed event without rating_history', () => {
    // Defensive: a completed match with no rating_history (shouldn'\''t happen but…)
    const events = buildFeed({
      matches: [match('m1', 'completed', '2026-04-01T00:00:00Z')],
      matchSets: [],
      ratingHistory: [],
      players: [],
      rankEvents: [],
    });
    expect(events).toHaveLength(0);
  });

  it('mixes all event types in chronological order', () => {
    const events = buildFeed({
      matches: [
        match('m1', 'completed', '2026-04-01T00:00:00Z'),
        match('m2', 'scheduled', '2026-04-04T00:00:00Z'),
      ],
      matchSets: [],
      ratingHistory: [rh('a', '2026-04-01T11:00:00Z', 'm1')],
      players: [player('alice', '2026-04-02T00:00:00Z')],
      rankEvents: [
        { playerId: 'a', type: 'rank_into_top3', recordedAt: '2026-04-03T00:00:00Z', newElo: 1600 },
      ],
    });
    const types = events.map((e) => e.type);
    expect(types).toEqual(['match_scheduled', 'rank_change', 'new_player', 'match_completed']);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- src/lib/feed/build-feed.test.ts`
Expected: FAIL with `Cannot find module './build-feed'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/feed/build-feed.ts`:

```ts
import type { RankChangeEvent } from './rank-changes';

interface MatchLike {
  id: string;
  status: string;
  date: string;
  location: string | null;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  winnerTeam: number | null;
  createdAt: string;
}

interface MatchSetLike {
  matchId: string;
  setNumber: number;
  team1Games: number;
  team2Games: number;
}

interface RatingHistoryLike {
  playerId: string;
  matchId: string;
  recordedAt: string;
}

interface PlayerLike {
  id: string;
  name: string;
  createdAt: string;
}

export type FeedEvent =
  | {
      type: 'match_completed';
      matchId: string;
      timestamp: string;
      match: MatchLike;
      sets: MatchSetLike[];
    }
  | {
      type: 'match_scheduled';
      matchId: string;
      timestamp: string;
      match: MatchLike;
    }
  | {
      type: 'rank_change';
      timestamp: string;
      event: RankChangeEvent;
    }
  | {
      type: 'new_player';
      timestamp: string;
      player: PlayerLike;
    };

interface BuildFeedInput {
  matches: MatchLike[];
  matchSets: MatchSetLike[];
  ratingHistory: RatingHistoryLike[];
  players: PlayerLike[];
  rankEvents: RankChangeEvent[];
}

const MAX_EVENTS = 10;

export function buildFeed(input: BuildFeedInput): FeedEvent[] {
  const events: FeedEvent[] = [];

  // Group sets and rating history by matchId
  const setsByMatch = new Map<string, MatchSetLike[]>();
  for (const s of input.matchSets) {
    const arr = setsByMatch.get(s.matchId) ?? [];
    arr.push(s);
    setsByMatch.set(s.matchId, arr);
  }
  for (const arr of setsByMatch.values()) arr.sort((a, b) => a.setNumber - b.setNumber);

  const closedAtByMatch = new Map<string, string>();
  for (const rh of input.ratingHistory) {
    const existing = closedAtByMatch.get(rh.matchId);
    if (!existing || rh.recordedAt > existing) {
      closedAtByMatch.set(rh.matchId, rh.recordedAt);
    }
  }

  for (const m of input.matches) {
    if (m.status === 'completed') {
      const closedAt = closedAtByMatch.get(m.id);
      if (!closedAt) continue;  // defensive: skip if no rating_history
      events.push({
        type: 'match_completed',
        matchId: m.id,
        timestamp: closedAt,
        match: m,
        sets: setsByMatch.get(m.id) ?? [],
      });
    } else if (m.status === 'scheduled') {
      events.push({
        type: 'match_scheduled',
        matchId: m.id,
        timestamp: m.createdAt,
        match: m,
      });
    }
  }

  for (const rc of input.rankEvents) {
    events.push({ type: 'rank_change', timestamp: rc.recordedAt, event: rc });
  }

  for (const p of input.players) {
    events.push({ type: 'new_player', timestamp: p.createdAt, player: p });
  }

  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return events.slice(0, MAX_EVENTS);
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- src/lib/feed/build-feed.test.ts`
Expected: 9 tests pass.

- [ ] **Step 5: Run full suite + tsc + lint**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. Tests = previous + 9 = 88.

- [ ] **Step 6: Commit**

```bash
git add src/lib/feed/build-feed.ts src/lib/feed/build-feed.test.ts
git commit -m "feat(feed): add buildFeed combining 4 event sources

Pure helper that merges completed/scheduled matches, rank-change events,
and new players into a single chronological feed. Caps at the 10 most
recent events. The match_completed timestamp is the recordedAt of the
rating_history that closed the match (i.e. when the result was entered)."
```

---

## Task 5: `ActivityFeed` + `ActivityFeedItem` components

UI components that render the feed events as cards.

**Files:**
- Create: `src/components/shared/activity-feed-item.tsx`
- Create: `src/components/shared/activity-feed.tsx`

- [ ] **Step 1: Create `ActivityFeedItem`**

Create `src/components/shared/activity-feed-item.tsx`:

```tsx
import Link from 'next/link';
import type { FeedEvent } from '@/lib/feed/build-feed';
import { relativeTime } from '@/lib/format/relative-time';

interface PlayerMap {
  [id: string]: { id: string; name: string };
}

const RANK_LABELS: Record<string, string> = {
  rank_into_top1: 'llega al #1 del ranking',
  rank_loses_top1: 'pierde el #1 del ranking',
  rank_into_top3: 'entra al top 3',
  rank_loses_top3: 'sale del top 3',
};

const RANK_ICONS: Record<string, string> = {
  rank_into_top1: '🥇',
  rank_loses_top1: '📉',
  rank_into_top3: '📈',
  rank_loses_top3: '📉',
};

function teamNames(p1: { name: string } | undefined, p2: { name: string } | undefined) {
  return `${p1?.name ?? '?'} & ${p2?.name ?? '?'}`;
}

export function ActivityFeedItem({ event, playerMap }: { event: FeedEvent; playerMap: PlayerMap }) {
  const time = relativeTime(event.timestamp);

  if (event.type === 'match_completed') {
    const m = event.match;
    const t1 = teamNames(playerMap[m.team1Player1Id], playerMap[m.team1Player2Id]);
    const t2 = teamNames(playerMap[m.team2Player1Id], playerMap[m.team2Player2Id]);
    const winnerNames = m.winnerTeam === 1 ? t1 : m.winnerTeam === 2 ? t2 : null;
    const loserNames = m.winnerTeam === 1 ? t2 : m.winnerTeam === 2 ? t1 : null;
    const setsStr = event.sets.map((s) => `${s.team1Games}-${s.team2Games}`).join(' · ');

    return (
      <Link href={`/matches/${m.id}`} className="block">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 flex items-start gap-3 hover:border-green-200 hover:shadow-sm transition-all">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-lg shrink-0">✅</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 leading-snug">
              <span className="font-bold">{winnerNames}</span> ganan a <span className="font-bold">{loserNames}</span>
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              {setsStr && (
                <span className="font-mono text-xs bg-gray-50 px-2 py-0.5 rounded text-gray-700">{setsStr}</span>
              )}
              <span className="text-xs text-gray-400">· {time}</span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  if (event.type === 'match_scheduled') {
    const m = event.match;
    const t1 = teamNames(playerMap[m.team1Player1Id], playerMap[m.team1Player2Id]);
    const t2 = teamNames(playerMap[m.team2Player1Id], playerMap[m.team2Player2Id]);
    const meta = [m.date, m.location].filter(Boolean).join(' · ');

    return (
      <Link href={`/matches/${m.id}`} className="block">
        <div className="bg-white border border-amber-100 rounded-2xl p-4 flex items-start gap-3 hover:border-amber-200 hover:shadow-sm transition-all">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-lg shrink-0">📅</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 leading-snug">
              Programado: <span className="font-bold">{t1} vs {t2}</span>
            </p>
            <p className="text-xs text-gray-500 mt-1.5">
              {meta} <span className="text-gray-400">· {time}</span>
            </p>
          </div>
        </div>
      </Link>
    );
  }

  if (event.type === 'rank_change') {
    const player = playerMap[event.event.playerId];
    return (
      <Link href={`/players/${event.event.playerId}`} className="block">
        <div className="bg-white border border-blue-100 rounded-2xl p-4 flex items-start gap-3 hover:border-blue-200 hover:shadow-sm transition-all">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-lg shrink-0">{RANK_ICONS[event.event.type]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 leading-snug">
              <span className="font-bold">{player?.name ?? '?'}</span> {RANK_LABELS[event.event.type]}
            </p>
            <p className="text-xs text-gray-400 mt-1.5">{Math.round(event.event.newElo)} ELO · {time}</p>
          </div>
        </div>
      </Link>
    );
  }

  // new_player
  return (
    <Link href={`/players/${event.player.id}`} className="block">
      <div className="bg-white border border-pink-100 rounded-2xl p-4 flex items-start gap-3 hover:border-pink-200 hover:shadow-sm transition-all">
        <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center text-lg shrink-0">👤</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 leading-snug">
            Nuevo jugador en el grupo: <span className="font-bold">{event.player.name}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1.5">{time}</p>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create `ActivityFeed`**

Create `src/components/shared/activity-feed.tsx`:

```tsx
import Link from 'next/link';
import type { FeedEvent } from '@/lib/feed/build-feed';
import { ActivityFeedItem } from './activity-feed-item';

interface ActivityFeedProps {
  events: FeedEvent[];
  playerMap: Record<string, { id: string; name: string }>;
}

export function ActivityFeed({ events, playerMap }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p className="text-3xl mb-2">🎾</p>
        <p className="text-sm">Aún no hay actividad. ¡Que ruede el primer partido!</p>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">⚡ ACTIVIDAD</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-green-300/60 to-transparent" />
        <Link href="/matches" className="text-sm font-bold text-green-700 hover:text-green-900 transition-colors">
          Ver todos →
        </Link>
      </div>
      <div className="space-y-2.5">
        {events.map((e, idx) => (
          <ActivityFeedItem key={`${e.type}-${e.timestamp}-${idx}`} event={e} playerMap={playerMap} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. Tests still 88 (no new tests, UI components only).

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/activity-feed.tsx src/components/shared/activity-feed-item.tsx
git commit -m "feat(feed): add ActivityFeed + ActivityFeedItem components

Card-based UI for the activity feed, one variant per event type
(completed, scheduled, rank change, new player). Each card is a
Link to the most contextually-relevant page. Empty state included."
```

---

## Task 6: Wire feed into the dashboard

Replace the "Últimos partidos" section in `/` with the activity feed. Keep "Próximos partidos" intact.

**Files:**
- Modify: `src/app/(public)/page.tsx`

- [ ] **Step 1: Read current state**

Read the current `src/app/(public)/page.tsx` to understand the data flow. Existing structure (relevant excerpts):

- Lines 11-25: parallel queries for `topPlayers`, `recentMatches`, `upcomingMatches`, total counts.
- Line 27: query for sets of recent matches.
- Line 29: query for `allPlayers`.
- Lines 119-141: "PRÓXIMOS PARTIDOS" section.
- Lines 143-166: "ÚLTIMOS PARTIDOS" section.

We will replace the "ÚLTIMOS PARTIDOS" section with the feed. The feed needs:
- All matches recent (both statuses) — already partially loaded; expand the query.
- All match_sets for those matches.
- Recent rating_history entries (for rank_change detection AND match_completed timestamps).
- Recent new players.

- [ ] **Step 2: Add imports + new queries + feed building**

In `src/app/(public)/page.tsx`:

Replace the import block at the top with:

```tsx
import { db } from '@/lib/db';
import { players, matches, matchSets, ratingHistory } from '@/lib/db/schema';
import { eq, desc, sql, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { Podium } from '@/components/shared/podium';
import { MatchCard } from '@/components/shared/match-card';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { buildFeed } from '@/lib/feed/build-feed';
import { detectRankChanges } from '@/lib/feed/rank-changes';
```

(Adapt to whatever was already there — preserve other existing imports the file uses.)

In the body of the page component, replace the parallel-query block (currently `Promise.all` at the top) with an expanded version. The exact code depends on what's already there; the new shape should be:

```tsx
  const [
    topPlayers,
    recentMatchesAll,         // matches both statuses — last 30 by date
    upcomingMatches,          // unchanged
    totalMatchesRow,
    totalPlayersRow,
    recentHistory,            // last 100 rating_history rows for rank reconstruction
    recentNewPlayers,         // last 5 created players
  ] = await Promise.all([
    db.select().from(players)
      .where(sql`${players.matchesPlayed} > 0`)
      .orderBy(desc(players.eloRating))
      .limit(3),
    db.select().from(matches).orderBy(desc(matches.date)).limit(30),
    db.select().from(matches).where(eq(matches.status, 'scheduled')).orderBy(matches.date).limit(3),
    db.select({ count: sql<number>`count(*)` }).from(matches),
    db.select({ count: sql<number>`count(*)` }).from(players).where(sql`${players.matchesPlayed} > 0`),
    db.select().from(ratingHistory).orderBy(desc(ratingHistory.recordedAt)).limit(100),
    db.select().from(players).orderBy(desc(players.createdAt)).limit(5),
  ]);

  const matchIds = recentMatchesAll.map((m) => m.id);
  const allSets = matchIds.length > 0
    ? await db.select().from(matchSets).where(inArray(matchSets.matchId, matchIds))
    : [];

  const allPlayers = await db.select().from(players);
  const playerMap: Record<string, typeof allPlayers[number]> = {};
  for (const p of allPlayers) playerMap[p.id] = p;

  // Build the feed
  const rankEvents = detectRankChanges(recentHistory, allPlayers);
  const feedEvents = buildFeed({
    matches: recentMatchesAll,
    matchSets: allSets,
    ratingHistory: recentHistory,
    players: recentNewPlayers,
    rankEvents,
  });
```

Notes for the implementer:
- If the existing file destructures `[totalMatchesRow]` style with brackets to grab `count`, preserve that pattern in the new version.
- `setsMap` may no longer be needed if it was only used by the now-removed "Últimos partidos" section.
- `recentMatches` (the previous variable, capped to 4) can be removed entirely if it was only used by the now-removed section.
- Adapt the parallel `Promise.all` to whatever destructuring pattern matches the existing code style.

- [ ] **Step 3: Replace the JSX section**

Remove the entire `{/* ── RECENT MATCHES ── */}` block (the one starting at the comment and ending at the `</section>` for that block).

Insert in its place:

```tsx
      {/* ── ACTIVITY FEED ── */}
      <ActivityFeed events={feedEvents} playerMap={playerMap} />
```

The "Próximos partidos" section above and the empty state below stay untouched.

- [ ] **Step 4: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. Likely warnings: unused imports if `desc` etc. were removed. Clean those up.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 88/88 tests pass.

- [ ] **Step 6: Smoke test (optional but recommended)**

Run: `npm run dev`. Visit `http://localhost:3000`. Verify:
- "Próximos partidos" still shows above (if any scheduled matches exist).
- "Actividad" section appears below with the recent events.
- Cards are clickable and navigate to match detail / player profile correctly.
- If the local DB is empty, verify the empty state appears.

Stop dev server.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(public)/page.tsx'
git commit -m "feat(dashboard): replace recent matches section with activity feed

Próximos partidos still pinned at top. Last completed matches now live
in the new feed alongside scheduled ones, rank changes, and new
players. Caps at 10 events with a Ver todos link to /matches."
```

---

## Task 7: ELO chart — date X-axis + rank-change markers

Modify the existing `EloChart` to use dates on the X-axis and accept rank-event markers. Wire the new data from the profile page.

**Files:**
- Modify: `src/components/charts/elo-chart.tsx`
- Modify: `src/app/(public)/players/[id]/page.tsx`

- [ ] **Step 1: Update `EloChart` props and rendering**

Replace the entire contents of `src/components/charts/elo-chart.tsx` with:

```tsx
'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import type { RankChangeEvent } from '@/lib/feed/rank-changes';

interface EloChartDatum {
  /** ISO date string of the match. */
  date: string;
  /** Player'\''s elo right after the match. */
  elo: number;
}

interface EloChartProps {
  data: EloChartDatum[];
  rankEvents?: RankChangeEvent[];
}

const RANK_DOT_LABELS: Record<RankChangeEvent['type'], string> = {
  rank_into_top1: '🥇 #1',
  rank_loses_top1: '↓ #1',
  rank_into_top3: '↑ Top 3',
  rank_loses_top3: '↓ Top 3',
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  // Spanish short month: "15 mar"
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function EloChart({ data, rankEvents = [] }: EloChartProps) {
  if (data.length < 2) return null;
  const minElo = Math.min(...data.map((d) => d.elo));
  const maxElo = Math.max(...data.map((d) => d.elo));
  const padding = 40;

  // Build a lookup so we can attach dot Y values precisely (using the elo from the matching data point).
  const eloByDate = new Map(data.map((d) => [d.date, d.elo]));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 30, right: 15, left: -15, bottom: 0 }}>
        <defs>
          <linearGradient id="eloGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={shortDate}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis
          domain={[minElo - padding, maxElo + padding]}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: '12px',
            border: 'none',
            boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
            fontSize: 12,
          }}
          formatter={(value) => [`${value} ELO`, '']}
          labelFormatter={(label) => shortDate(String(label))}
          cursor={{ stroke: '#16a34a', strokeWidth: 1, strokeDasharray: '4 4' }}
        />
        <ReferenceLine
          y={1500}
          stroke="#e5e7eb"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{ value: '1500', position: 'insideRight', fontSize: 10, fill: '#d1d5db' }}
        />
        <Area
          type="monotone"
          dataKey="elo"
          stroke="#16a34a"
          strokeWidth={2.5}
          fill="url(#eloGradient)"
          dot={false}
          activeDot={{ r: 5, fill: '#16a34a', stroke: 'white', strokeWidth: 2 }}
        />
        {rankEvents.map((re, idx) => {
          const y = eloByDate.get(re.recordedAt);
          if (y === undefined) return null;
          return (
            <ReferenceDot
              key={`rank-${idx}`}
              x={re.recordedAt}
              y={y}
              r={6}
              fill="#facc15"
              stroke="white"
              strokeWidth={2}
              label={{ value: RANK_DOT_LABELS[re.type], position: 'top', fontSize: 10, fontWeight: 700, fill: '#a16207' }}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

Key changes:
- `data` now uses `{ date: string; elo: number }` (date is an ISO timestamp, NOT a sequential match number).
- New optional `rankEvents` prop that renders `<ReferenceDot>`s on the chart at the rank-change moments.
- `tickFormatter` formats dates as `15 mar` style.
- Margin top increased from 10 to 30 to make room for rank labels.
- Returns `null` when data is too short — moved guard inside the component.

- [ ] **Step 2: Update the profile page to pass dates + rank events**

In `src/app/(public)/players/[id]/page.tsx`, find where `chartData` is built. The existing line is approximately:

```tsx
const chartData = history.map((h, i) => ({ partido: i + 1, elo: Math.round(h.eloAfter) }));
```

Replace with:

```tsx
const chartData = history.map((h) => ({ date: h.recordedAt, elo: Math.round(h.eloAfter) }));
```

Then, ABOVE the existing `chartData` line, add the imports and rank-event computation. At the top of the file, add:

```tsx
import { detectRankChanges } from '@/lib/feed/rank-changes';
```

In the body of `PlayerProfilePage` function, near where `history` is queried (the existing `db.select().from(ratingHistory).where(eq(ratingHistory.playerId, id))` query), add a second query for the global history (used for rank reconstruction):

```tsx
  const globalHistory = await db.select().from(ratingHistory).orderBy(ratingHistory.recordedAt);
  const allPlayersForRank = await db.select().from(players);
  const allRankEvents = detectRankChanges(globalHistory, allPlayersForRank);
  const playerRankEvents = allRankEvents.filter((e) => e.playerId === id);
```

(If the file already loads `players` somewhere or queries `globalHistory`, reuse those — otherwise add as shown.)

Then update the `<EloChart>` invocation:

```tsx
<EloChart data={chartData} rankEvents={playerRankEvents} />
```

- [ ] **Step 3: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 88/88 pass.

- [ ] **Step 5: Smoke test**

Run: `npm run dev`. Visit a player profile (one with multiple matches and ideally with rank changes). Verify:
- Chart X-axis shows dates ("15 mar", "22 mar"…) instead of "P1, P2…".
- Tooltip shows date in label.
- If the player crossed top 3 / #1 in their history, see yellow `ReferenceDot`s with text labels.

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/charts/elo-chart.tsx 'src/app/(public)/players/[id]/page.tsx'
git commit -m "feat(charts): ELO chart uses date X-axis and rank-change markers

X-axis is now ISO dates formatted as '\''15 mar'\'' style instead of
sequential match numbers — gives temporal context (active periods,
gaps, etc.). Yellow ReferenceDots mark moments the player crossed
into/out of top 3 or #1, computed via detectRankChanges."
```

---

## Task 8: `EloSparkline` + render in profile hero

A minimal version of the chart for inline display.

**Files:**
- Create: `src/components/charts/elo-sparkline.tsx`
- Modify: `src/app/(public)/players/[id]/page.tsx`

- [ ] **Step 1: Create `EloSparkline`**

Create `src/components/charts/elo-sparkline.tsx`:

```tsx
'use client';

import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

interface EloSparklineDatum {
  date: string;
  elo: number;
}

interface EloSparklineProps {
  data: EloSparklineDatum[];
  width?: number;
  height?: number;
}

export function EloSparkline({ data, width = 80, height = 28 }: EloSparklineProps) {
  if (data.length < 2) return null;
  const minElo = Math.min(...data.map((d) => d.elo));
  const maxElo = Math.max(...data.map((d) => d.elo));

  return (
    <div style={{ width, height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <YAxis hide domain={[minElo, maxElo]} />
          <Line
            type="monotone"
            dataKey="elo"
            stroke="#16a34a"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Render in the profile hero**

In `src/app/(public)/players/[id]/page.tsx`, locate the section that renders the player'\''s ELO number prominently (the hero with the big elo). Look for the existing JSX that displays `Math.round(player.eloRating)` or similar.

Add the import at the top:

```tsx
import { EloSparkline } from '@/components/charts/elo-sparkline';
```

Wherever the big ELO number is rendered, place the sparkline next to it. Example pattern (adapt to match the actual hero structure):

```tsx
<div className="flex items-center gap-3">
  <span className="text-5xl font-black tabular-nums text-white">{Math.round(player.eloRating)}</span>
  {chartData.length >= 2 && <EloSparkline data={chartData} />}
</div>
```

Important constraints:
- Reuse the existing `chartData` array (computed in Task 7 with `date` field).
- The sparkline returns `null` when data is too short, so guarding with `chartData.length >= 2` is a defensive double-check.
- Ensure layout still works on mobile — the hero is already responsive, just maintain `flex-wrap` or `gap` patterns already in place.

- [ ] **Step 3: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 88/88 pass.

- [ ] **Step 5: Smoke test**

Run: `npm run dev`. Visit a player profile. Verify:
- Mini sparkline visible next to (or near) the big ELO number in the hero.
- For a player with <2 history entries, the sparkline is absent (no broken layout).
- Mobile breakpoint: hero still renders clean, sparkline doesn'\''t overflow.

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/charts/elo-sparkline.tsx 'src/app/(public)/players/[id]/page.tsx'
git commit -m "feat(charts): add EloSparkline mini-chart in profile hero

Tiny line chart (default 80×28) rendered next to the big ELO number
in the player hero. Returns null when there'\''s not enough history.
The big chart card below remains as the detailed view."
```

---

## Task 9: `UnplayedPartnersCard` + render in profile

The "Compañeros pendientes" card.

**Files:**
- Create: `src/components/shared/unplayed-partners-card.tsx`
- Modify: `src/app/(public)/players/[id]/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/shared/unplayed-partners-card.tsx`:

```tsx
import Link from 'next/link';

interface PartnerLike {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface UnplayedPartnersCardProps {
  unplayed: PartnerLike[];
  totalCandidates: number;
}

export function UnplayedPartnersCard({ unplayed, totalCandidates }: UnplayedPartnersCardProps) {
  if (unplayed.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🎲 Compañeros pendientes</p>
        <span className="text-xs text-gray-400">{unplayed.length} de {totalCandidates}</span>
      </div>
      <p className="text-sm text-gray-600 mb-3">Aún no has jugado de pareja con:</p>
      <div className="flex flex-wrap gap-2">
        {unplayed.map((p) => (
          <Link
            key={p.id}
            href={`/players/${p.id}`}
            className="inline-flex items-center gap-2 bg-green-50 hover:bg-green-100 text-green-800 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors"
          >
            {p.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatarUrl} alt={p.name} className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <span className="w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white font-black text-[10px] flex items-center justify-center">
                {p.name.charAt(0).toUpperCase()}
              </span>
            )}
            {p.name}
          </Link>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3 italic">Anímate a probar nuevas parejas — sumáis al historial del grupo.</p>
    </div>
  );
}
```

- [ ] **Step 2: Render in the profile**

In `src/app/(public)/players/[id]/page.tsx`:

Add imports near the others:

```tsx
import { findUnplayedPartners } from '@/lib/players/unplayed-partners';
import { UnplayedPartnersCard } from '@/components/shared/unplayed-partners-card';
```

In the body, after `pairStats` is loaded (the existing query that loads `pairStats` for this player), and after `allPlayersForRank` (loaded in Task 7) is available, compute:

```tsx
  // Unplayed partners
  // allPlayersForRank covers the snapshot we need (full player list).
  const unplayed = findUnplayedPartners(id, allPlayersForRank, pairStats);
  // Total candidates = active players (matchesPlayed > 0), excluding the target.
  const totalCandidates = allPlayersForRank.filter(
    (p) => p.id !== id && p.matchesPlayed > 0,
  ).length;
```

In the JSX, place the card right after the Best/Worst Partner section. The existing markers in the file are something like:

```tsx
{bestPartnerPlayer && bestPartner && (
  <div className={...}>
    <PartnerCard variant="best" ... />
    {showWorstCard && worstPartner && <PartnerCard variant="worst" ... />}
  </div>
)}
```

Right AFTER that closing `)}`, insert:

```tsx
<UnplayedPartnersCard unplayed={unplayed} totalCandidates={totalCandidates} />
```

(If `pairStats` only contains the rows for this player, `findUnplayedPartners` will work correctly — it iterates all stats and picks the ones referencing the target. The existing query already loads pair stats where the target is in either `player1Id` or `player2Id`. Verify this matches the helper'\''s expectations.)

- [ ] **Step 3: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 88/88 pass.

- [ ] **Step 5: Smoke test**

Run: `npm run dev`. Visit a player profile. Verify:
- For a player who has paired with every active player: the card does not appear.
- For a player with pendientes: chips list, contador "X de Y", click leads to other player profile.
- Avatar fallback (initial circle) shows for players without an `avatar_url`.

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/unplayed-partners-card.tsx 'src/app/(public)/players/[id]/page.tsx'
git commit -m "feat(profile): add Compañeros pendientes card

Lists active players the target has never been a partner with as
clickable chips. Hidden when the target has paired with everyone."
```

---

## Task 10: Recommender — INÉDITA badge

Show a gold "✨ INÉDITA" badge on a team in the pairing recommender when that pair has `matchesPlayed === 0`.

**Files:**
- Modify: `src/app/(public)/matches/[id]/page.tsx`

- [ ] **Step 1: Locate the recommender block**

In `src/app/(public)/matches/[id]/page.tsx`, find the section that renders `pairingOptions` (the 3 alternative pairings for a scheduled match). Inside, each option iterates `opt.team1.map(...)` and `opt.team2.map(...)` rendering player chips.

Currently the file also renders historical context (line counts like "5 partidos juntos") below each team using data from `relevantPairs`. We will replace that line with the INÉDITA badge when the pair has 0 matches together.

- [ ] **Step 2: Add a helper that finds matchesPlayed for a team**

Inside `src/app/(public)/matches/[id]/page.tsx`, near other inline helpers / above the default export, add:

```tsx
function pairMatchesPlayed(
  p1Id: string,
  p2Id: string,
  pairs: { player1Id: string; player2Id: string; matchesPlayed: number }[],
): number {
  const found = pairs.find(
    (p) =>
      (p.player1Id === p1Id && p.player2Id === p2Id) ||
      (p.player1Id === p2Id && p.player2Id === p1Id),
  );
  return found?.matchesPlayed ?? 0;
}
```

- [ ] **Step 3: Render the badge per team**

Inside the recommender JSX, for each team in each pairing option, add — right after the team'\''s player chips — a small block:

```tsx
{(() => {
  const [p1, p2] = opt.team1;
  const mp = pairMatchesPlayed(p1.id, p2.id, relevantPairs);
  if (mp === 0) {
    return (
      <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
        ✨ INÉDITA
      </span>
    );
  }
  return (
    <p className="text-xs text-gray-400 mt-1.5">{mp} partido{mp !== 1 ? 's' : ''} juntos</p>
  );
})()}
```

Repeat the same pattern for `opt.team2` (using `opt.team2`'\''s players). Place the team2 badge with `text-right` alignment to match the existing layout if needed.

If there is already a "X partidos juntos" rendering in the file (the previous behavior), REMOVE it — replace with the IIFE above so we have a single source of truth: badge OR partidos-juntos line, not both.

- [ ] **Step 4: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 88/88 pass.

- [ ] **Step 6: Smoke test**

Run: `npm run dev`. Visit a scheduled match'\''s detail page. Verify:
- For pairings where one team has never played together: gold "✨ INÉDITA" badge appears.
- For pairings where both teams have history: "N partidos juntos" line appears as before.
- The 3 options still render and the order isn'\''t changed (recommender scoring untouched).

Stop dev server.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(public)/matches/[id]/page.tsx'
git commit -m "feat(matches): INÉDITA badge in pairing recommender

When a recommender pairing has matchesPlayed === 0 for a team, show
a gold '✨ INÉDITA' badge in place of the 'N partidos juntos' line.
Recommender scoring/ordering is unchanged — info only."
```

---

## Task 11: Final verification + push

- [ ] **Step 1: Full verification**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, **88 tests pass** across the relevant test files (49 existing + 9 relativeTime + 7 rank-changes + 7 unplayed-partners + 9 build-feed + 7 court-positions from prior work = 88).

- [ ] **Step 2: Build**

Run: `TURSO_DATABASE_URL="file:./.skip-db.sqlite" TURSO_AUTH_TOKEN="" npm run build && rm -f .skip-db.sqlite .skip-db.sqlite-journal`
Expected: build succeeds without errors. (We pass a dummy DB URL because the build collects page data and would otherwise fail locally without env vars; production builds on Vercel work because env vars are set.)

- [ ] **Step 3: Manual end-to-end smoke**

Run: `npm run dev`. Walk through:

**Dashboard (`/`):**
- "Próximos partidos" section appears at top (if any scheduled).
- "Actividad" feed appears below with cards.
- Clicking a card navigates correctly.

**Player profile (`/players/[id]`):**
- Hero shows ELO number with mini sparkline next to it (for players with ≥2 history entries).
- "Evolución del rating" card has dates on X-axis and (if applicable) yellow rank-change markers.
- "Compañeros pendientes" card visible (for players who haven'\''t paired with everyone).

**Scheduled match detail (`/matches/[id]` for a scheduled match):**
- Pairing recommender shows the 3 options.
- INÉDITA badge appears on teams with 0 matches played together.

Stop dev server.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feature/activity-feed-and-discovery
```

---

## Self-review checklist (already done by author)

- **Spec coverage:**
  - Activity feed (4 event types, top 10, no pagination, position) → Tasks 4 + 5 + 6.
  - ELO chart enhancements (date axis, rank markers, sparkline) → Tasks 7 + 8.
  - Pareja inédita (profile card + recommender badge) → Tasks 3 + 9 + 10.
  - Helper TDD coverage → Tasks 1 + 2 + 3 + 4.
- **Placeholder scan:** all code blocks contain real, complete code. No "implement later" markers.
- **Type consistency:** `RankChangeEvent` defined in Task 2 used by Tasks 4 + 7; `FeedEvent` from Task 4 used by Task 5; `findUnplayedPartners` from Task 3 used by Task 9.
