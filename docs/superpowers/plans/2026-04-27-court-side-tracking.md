# Court Side Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track which side of the court (drive/revés) each player played in each match. Surface the data in match detail (badges next to names), player profile (new analytics card), and the pair recommender (suggest the side each player should play based on historical winrate).

**Architecture:** 4 nullable text columns on `matches`, idempotent ALTER TABLE migration with one-time heuristic backfill (lefty→revés). Two new pure helper modules in the rating lib (`side-stats.ts`, `recommend-sides.ts`) developed test-first. Existing `recommendPairings` extended to optionally accept side stats and return per-team side recommendations. New focused `/admin/matches/[id]/sides` page lets admin correct backfilled data without touching the rest of the match.

**Tech Stack:** Drizzle ORM (SQLite/Turso), Next.js 16 API routes + App Router pages, React 19 client forms, Vitest for the new tests, Tailwind v4 for badges.

**Verification model:** TDD for the 3 helper tasks (write failing test, then minimal impl). After each task: `npx tsc --noEmit && npm run lint && npm test`. Final manual visual sweep post-deploy.

**Background:** spec at `docs/superpowers/specs/2026-04-27-court-side-tracking-design.md`. Read before starting.

---

## Pre-flight

- [ ] **Step 0a: Confirm branch**

Run: `git branch --show-current`
Expected: `feature/court-side-tracking`

- [ ] **Step 0b: Confirm baseline checks pass**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 23 tests pass.

---

## Task C.1: `side-stats.ts` helper (TDD)

**Files:**
- Create: `src/lib/rating/side-stats.ts`
- Create: `src/lib/rating/side-stats.test.ts`

Pure function: given a playerId and an array of completed matches with side info, returns aggregated stats per side.

- [ ] **Step 1: Write failing tests**

Create `src/lib/rating/side-stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeSideStats, type MatchWithSide } from './side-stats';

function makeMatch(overrides: Partial<MatchWithSide>): MatchWithSide {
  return {
    team1Player1Id: 'p1',
    team1Player2Id: 'p2',
    team2Player1Id: 'p3',
    team2Player2Id: 'p4',
    team1Player1Side: null,
    team1Player2Side: null,
    team2Player1Side: null,
    team2Player2Side: null,
    winnerTeam: 1,
    ...overrides,
  };
}

describe('computeSideStats', () => {
  it('returns zero stats for empty matches array', () => {
    const stats = computeSideStats('p1', []);
    expect(stats.drive).toEqual({ matches: 0, wins: 0, losses: 0, winRate: 0 });
    expect(stats.reves).toEqual({ matches: 0, wins: 0, losses: 0, winRate: 0 });
  });

  it('counts only matches where player participated', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: 'drive', winnerTeam: 1 }),
      makeMatch({ team1Player1Id: 'pX', team1Player1Side: 'drive', winnerTeam: 1 }), // p1 not in this one
    ];
    const stats = computeSideStats('p1', matches);
    expect(stats.drive.matches).toBe(1);
  });

  it('ignores matches where the player has no recorded side', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: null, winnerTeam: 1 }),
    ];
    const stats = computeSideStats('p1', matches);
    expect(stats.drive.matches).toBe(0);
    expect(stats.reves.matches).toBe(0);
  });

  it('ignores matches where winnerTeam is null (not completed)', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: 'drive', winnerTeam: null }),
    ];
    expect(computeSideStats('p1', matches).drive.matches).toBe(0);
  });

  it('counts a win on drive correctly when player is in team1Player1', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: 'drive', winnerTeam: 1 }),
    ];
    const stats = computeSideStats('p1', matches);
    expect(stats.drive).toEqual({ matches: 1, wins: 1, losses: 0, winRate: 1 });
    expect(stats.reves.matches).toBe(0);
  });

  it('counts a loss on revés correctly when player is in team2Player2', () => {
    const matches = [
      makeMatch({ team2Player2Id: 'p1', team2Player2Side: 'reves', winnerTeam: 1 }),
    ];
    const stats = computeSideStats('p1', matches);
    expect(stats.reves).toEqual({ matches: 1, wins: 0, losses: 1, winRate: 0 });
  });

  it('aggregates multiple matches across both sides', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: 'drive', winnerTeam: 1 }), // win drive
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: 'drive', winnerTeam: 2 }), // loss drive
      makeMatch({ team1Player1Id: 'p1', team1Player1Side: 'drive', winnerTeam: 1 }), // win drive
      makeMatch({ team2Player1Id: 'p1', team2Player1Side: 'reves', winnerTeam: 2 }), // win revés
    ];
    const stats = computeSideStats('p1', matches);
    expect(stats.drive).toEqual({ matches: 3, wins: 2, losses: 1, winRate: 2 / 3 });
    expect(stats.reves).toEqual({ matches: 1, wins: 1, losses: 0, winRate: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- side-stats`
Expected: FAIL — `Cannot find module './side-stats'`.

- [ ] **Step 3: Implement `side-stats.ts`**

Create `src/lib/rating/side-stats.ts`:

```ts
export interface SideStats {
  drive: { matches: number; wins: number; losses: number; winRate: number };
  reves: { matches: number; wins: number; losses: number; winRate: number };
}

export interface MatchWithSide {
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  team1Player1Side: string | null;
  team1Player2Side: string | null;
  team2Player1Side: string | null;
  team2Player2Side: string | null;
  winnerTeam: number | null;
}

interface SlotInfo {
  team: 1 | 2;
  side: string | null;
}

function findPlayerSlot(playerId: string, m: MatchWithSide): SlotInfo | null {
  if (m.team1Player1Id === playerId) return { team: 1, side: m.team1Player1Side };
  if (m.team1Player2Id === playerId) return { team: 1, side: m.team1Player2Side };
  if (m.team2Player1Id === playerId) return { team: 2, side: m.team2Player1Side };
  if (m.team2Player2Id === playerId) return { team: 2, side: m.team2Player2Side };
  return null;
}

export function computeSideStats(playerId: string, matches: MatchWithSide[]): SideStats {
  const drive = { matches: 0, wins: 0, losses: 0 };
  const reves = { matches: 0, wins: 0, losses: 0 };

  for (const m of matches) {
    if (m.winnerTeam === null) continue;
    const slot = findPlayerSlot(playerId, m);
    if (!slot) continue;
    if (slot.side !== 'drive' && slot.side !== 'reves') continue;

    const bucket = slot.side === 'drive' ? drive : reves;
    bucket.matches += 1;
    if (m.winnerTeam === slot.team) bucket.wins += 1;
    else bucket.losses += 1;
  }

  return {
    drive: { ...drive, winRate: drive.matches > 0 ? drive.wins / drive.matches : 0 },
    reves: { ...reves, winRate: reves.matches > 0 ? reves.wins / reves.matches : 0 },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- side-stats`
Expected: PASS, 7/7 new tests + 23 pre-existing tests still passing.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add src/lib/rating/side-stats.ts src/lib/rating/side-stats.test.ts
git commit -m "feat(rating): add computeSideStats helper with 7 unit tests"
```

---

## Task C.2: `recommend-sides.ts` helper (TDD)

**Files:**
- Create: `src/lib/rating/recommend-sides.ts`
- Create: `src/lib/rating/recommend-sides.test.ts`

Pure function: given two players with their `SideStats`, returns which one should play drive (using "suma de comodidades" algorithm).

- [ ] **Step 1: Write failing tests**

Create `src/lib/rating/recommend-sides.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { recommendSides } from './recommend-sides';
import type { SideStats } from './side-stats';

function emptyStats(): SideStats {
  return {
    drive: { matches: 0, wins: 0, losses: 0, winRate: 0 },
    reves: { matches: 0, wins: 0, losses: 0, winRate: 0 },
  };
}

function statsWith(driveWinRate: number, driveMatches: number, revesWinRate: number, revesMatches: number): SideStats {
  return {
    drive: { matches: driveMatches, wins: Math.round(driveWinRate * driveMatches), losses: driveMatches - Math.round(driveWinRate * driveMatches), winRate: driveWinRate },
    reves: { matches: revesMatches, wins: Math.round(revesWinRate * revesMatches), losses: revesMatches - Math.round(revesWinRate * revesMatches), winRate: revesWinRate },
  };
}

describe('recommendSides', () => {
  it('returns null when neither player has any data', () => {
    const result = recommendSides(
      { id: 'a', sideStats: emptyStats() },
      { id: 'b', sideStats: emptyStats() },
    );
    expect(result).toBeNull();
  });

  it('clearly recommends A on drive when A is much better at drive', () => {
    // A: 80% drive, 50% revés. B: 60% drive, 70% revés.
    // A_drive_sum = 0.8 + 0.7 = 1.5; B_drive_sum = 0.6 + 0.5 = 1.1 → A drive.
    const result = recommendSides(
      { id: 'a', sideStats: statsWith(0.8, 5, 0.5, 5) },
      { id: 'b', sideStats: statsWith(0.6, 5, 0.7, 5) },
    );
    expect(result).toEqual({ driveSidePlayerId: 'a', revesSidePlayerId: 'b' });
  });

  it('clearly recommends B on drive when B is much better at drive', () => {
    const result = recommendSides(
      { id: 'a', sideStats: statsWith(0.4, 5, 0.7, 5) },
      { id: 'b', sideStats: statsWith(0.9, 5, 0.5, 5) },
    );
    expect(result).toEqual({ driveSidePlayerId: 'b', revesSidePlayerId: 'a' });
  });

  it('returns null on exact tie', () => {
    // A: 0.5/0.5; B: 0.5/0.5. Both sums = 1.0 → tie.
    const result = recommendSides(
      { id: 'a', sideStats: statsWith(0.5, 4, 0.5, 4) },
      { id: 'b', sideStats: statsWith(0.5, 4, 0.5, 4) },
    );
    expect(result).toBeNull();
  });

  it('uses 0.5 default for the side with no data of one player', () => {
    // A: 80% drive, 0 revés (defaults to 0.5). B: 0 drive (default 0.5), 70% revés.
    // A_drive_sum = 0.8 + 0.7 = 1.5; B_drive_sum = 0.5 + 0.5 = 1.0 → A drive.
    const result = recommendSides(
      { id: 'a', sideStats: statsWith(0.8, 5, 0, 0) },
      { id: 'b', sideStats: statsWith(0, 0, 0.7, 5) },
    );
    expect(result).toEqual({ driveSidePlayerId: 'a', revesSidePlayerId: 'b' });
  });

  it('still recommends when only one player has any data', () => {
    // A: 80% drive, 30% revés. B: no data (both 0.5).
    // A_drive_sum = 0.8 + 0.5 = 1.3; B_drive_sum = 0.5 + 0.3 = 0.8 → A drive.
    const result = recommendSides(
      { id: 'a', sideStats: statsWith(0.8, 5, 0.3, 5) },
      { id: 'b', sideStats: emptyStats() },
    );
    expect(result).toEqual({ driveSidePlayerId: 'a', revesSidePlayerId: 'b' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- recommend-sides`
Expected: FAIL — `Cannot find module './recommend-sides'`.

- [ ] **Step 3: Implement `recommend-sides.ts`**

Create `src/lib/rating/recommend-sides.ts`:

```ts
import type { SideStats } from './side-stats';

export interface SideRecommendation {
  driveSidePlayerId: string;
  revesSidePlayerId: string;
}

interface PlayerWithStats {
  id: string;
  sideStats: SideStats;
}

const NEUTRAL = 0.5;

function comfortAt(stats: { matches: number; winRate: number }): number {
  return stats.matches > 0 ? stats.winRate : NEUTRAL;
}

export function recommendSides(playerA: PlayerWithStats, playerB: PlayerWithStats): SideRecommendation | null {
  const aHasAny = playerA.sideStats.drive.matches + playerA.sideStats.reves.matches > 0;
  const bHasAny = playerB.sideStats.drive.matches + playerB.sideStats.reves.matches > 0;
  if (!aHasAny && !bHasAny) return null;

  const aDrive = comfortAt(playerA.sideStats.drive);
  const aReves = comfortAt(playerA.sideStats.reves);
  const bDrive = comfortAt(playerB.sideStats.drive);
  const bReves = comfortAt(playerB.sideStats.reves);

  const aOnDriveSum = aDrive + bReves;
  const bOnDriveSum = bDrive + aReves;

  if (aOnDriveSum > bOnDriveSum) return { driveSidePlayerId: playerA.id, revesSidePlayerId: playerB.id };
  if (bOnDriveSum > aOnDriveSum) return { driveSidePlayerId: playerB.id, revesSidePlayerId: playerA.id };
  return null; // exact tie
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- recommend-sides`
Expected: PASS, 6/6 new tests + previous tests still passing.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add src/lib/rating/recommend-sides.ts src/lib/rating/recommend-sides.test.ts
git commit -m "feat(rating): add recommendSides helper (suma de comodidades) with 6 tests"
```

---

## Task C.3: Extend `recommend-pairs.ts` to return side recommendations

**Files:**
- Modify: `src/lib/rating/recommend-pairs.ts`
- Create: `src/lib/rating/recommend-pairs.test.ts`

The existing `recommendPairings` returns 3 pairing options. Extend it so each option also includes a side recommendation per team when `sideStatsByPlayer` is provided.

- [ ] **Step 1: Read the current `recommend-pairs.ts`**

Open `src/lib/rating/recommend-pairs.ts` to see the current `PairingOption` interface and the `recommendPairings` function signature.

Note the current shape so the modification is additive — do not change the existing fields, only add new ones.

- [ ] **Step 2: Write failing tests**

Create `src/lib/rating/recommend-pairs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { recommendPairings, type PlayerSummary } from './recommend-pairs';
import type { SideStats } from './side-stats';

function player(id: string, elo: number): PlayerSummary {
  return { id, name: `Player ${id}`, eloRating: elo, matchesPlayed: 10, wins: 5, losses: 5 };
}

function emptyStats(): SideStats {
  return {
    drive: { matches: 0, wins: 0, losses: 0, winRate: 0 },
    reves: { matches: 0, wins: 0, losses: 0, winRate: 0 },
  };
}

describe('recommendPairings', () => {
  const four: [PlayerSummary, PlayerSummary, PlayerSummary, PlayerSummary] = [
    player('a', 1500),
    player('b', 1500),
    player('c', 1500),
    player('d', 1500),
  ];

  it('returns 3 pairing options with team1SideRec/team2SideRec=null when no sideStats provided', () => {
    const options = recommendPairings(four);
    expect(options).toHaveLength(3);
    for (const opt of options) {
      expect(opt.team1SideRec).toBeNull();
      expect(opt.team2SideRec).toBeNull();
    }
  });

  it('returns null side recs when sideStatsByPlayer has no data for any of the 4 players', () => {
    const sideStatsByPlayer: Record<string, SideStats> = {
      a: emptyStats(), b: emptyStats(), c: emptyStats(), d: emptyStats(),
    };
    const options = recommendPairings(four, sideStatsByPlayer);
    for (const opt of options) {
      expect(opt.team1SideRec).toBeNull();
      expect(opt.team2SideRec).toBeNull();
    }
  });

  it('returns concrete side recommendations when at least one player in each team has data', () => {
    // a: 80% drive, 50% revés (5 matches each). b: 60% drive, 70% revés. c & d: empty.
    const sideStatsByPlayer: Record<string, SideStats> = {
      a: {
        drive: { matches: 5, wins: 4, losses: 1, winRate: 0.8 },
        reves: { matches: 5, wins: 2, losses: 3, winRate: 0.5 },
      },
      b: {
        drive: { matches: 5, wins: 3, losses: 2, winRate: 0.6 },
        reves: { matches: 5, wins: 3, losses: 2, winRate: 0.7 },
      },
      c: emptyStats(),
      d: emptyStats(),
    };
    const options = recommendPairings(four, sideStatsByPlayer);
    expect(options).toHaveLength(3);

    // For the option where team1=[a,b], a should be recommended for drive (1.5 > 1.1).
    const opt = options.find((o) =>
      (o.team1.some((p) => p.id === 'a') && o.team1.some((p) => p.id === 'b')) ||
      (o.team2.some((p) => p.id === 'a') && o.team2.some((p) => p.id === 'b'))
    );
    expect(opt).toBeDefined();

    // The team containing a+b should have a side rec with a on drive.
    const teamWithAB = opt!.team1.some((p) => p.id === 'a') ? opt!.team1SideRec : opt!.team2SideRec;
    expect(teamWithAB).toEqual({ driveSidePlayerId: 'a', revesSidePlayerId: 'b' });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- recommend-pairs`
Expected: FAIL — likely `team1SideRec is not a property of PairingOption` or similar typing/missing-export errors.

- [ ] **Step 4: Modify `recommend-pairs.ts`**

In `src/lib/rating/recommend-pairs.ts`:

(a) Add imports at the top:
```ts
import { recommendSides, type SideRecommendation } from './recommend-sides';
import type { SideStats } from './side-stats';
```

(b) Extend the `PairingOption` interface (find the current `export interface PairingOption { ... }` and add):
```ts
export interface PairingOption {
  // ... existing fields stay exactly as they are
  team1SideRec: SideRecommendation | null;
  team2SideRec: SideRecommendation | null;
}
```

(c) Modify the `recommendPairings` function signature to accept the optional argument and produce the side recs. Find the current `export function recommendPairings(players: PlayerSummary[]): PairingOption[]` and change to:

```ts
export function recommendPairings(
  players: PlayerSummary[],
  sideStatsByPlayer?: Record<string, SideStats>,
): PairingOption[]
```

(d) Inside the function, where each `PairingOption` is constructed (inside the existing loop or array build), add the side recommendations. The minimal change: after the existing fields are computed for an option, compute the two recs:

```ts
const team1SideRec = sideStatsByPlayer
  ? recommendSides(
      { id: opt.team1[0].id, sideStats: sideStatsByPlayer[opt.team1[0].id] ?? emptySideStats() },
      { id: opt.team1[1].id, sideStats: sideStatsByPlayer[opt.team1[1].id] ?? emptySideStats() },
    )
  : null;
const team2SideRec = sideStatsByPlayer
  ? recommendSides(
      { id: opt.team2[0].id, sideStats: sideStatsByPlayer[opt.team2[0].id] ?? emptySideStats() },
      { id: opt.team2[1].id, sideStats: sideStatsByPlayer[opt.team2[1].id] ?? emptySideStats() },
    )
  : null;
```

Where `emptySideStats` is a small local helper:
```ts
function emptySideStats(): SideStats {
  return {
    drive: { matches: 0, wins: 0, losses: 0, winRate: 0 },
    reves: { matches: 0, wins: 0, losses: 0, winRate: 0 },
  };
}
```

(The exact integration point depends on the current code structure — read the file first to insert these in the right spot. The principle: every constructed `PairingOption` must include `team1SideRec` and `team2SideRec`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass (3 new + 6 + 7 + 23 pre-existing ≈ 39 total).

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add src/lib/rating/recommend-pairs.ts src/lib/rating/recommend-pairs.test.ts
git commit -m "feat(rating): recommendPairings returns side recommendations when stats provided"
```

---

## Task C.4: Schema + migration + heuristic backfill

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/app/api/migrate-db/route.ts`

- [ ] **Step 1: Add the 4 columns to the schema**

In `src/lib/db/schema.ts`, find the `matches` table definition. Add 4 new fields right before `notes`:

```ts
team1Player1Side: text('team1_player1_side'),  // 'drive' | 'reves' | null
team1Player2Side: text('team1_player2_side'),
team2Player1Side: text('team2_player1_side'),
team2Player2Side: text('team2_player2_side'),
notes: text('notes'),
```

- [ ] **Step 2: Read the current `migrate-db` route**

Open `src/app/api/migrate-db/route.ts` to see where existing migration steps live. The Feature B step (added previously) ends with the `is_left_handed` ALTER TABLE try/catch.

- [ ] **Step 3: Add ALTER TABLE steps for the 4 side columns**

Right after the Feature B step and before the final `return NextResponse.json(...)`, insert:

```ts
    // Step N: Add side columns to matches if not present (Feature C)
    for (const col of ['team1_player1_side', 'team1_player2_side', 'team2_player1_side', 'team2_player2_side']) {
      try {
        await db.run(sql.raw(`ALTER TABLE matches ADD COLUMN ${col} TEXT`));
      } catch {
        // Column already exists — skip silently
      }
    }
```

(Note: `sql.raw()` is needed because Drizzle's tagged template doesn't interpolate identifiers from arrays. The column names are hardcoded so injection risk is zero.)

- [ ] **Step 4: Add heuristic backfill after the ALTER steps**

Right after the for-loop above and still before the final return, insert the backfill block. First, add `eq` import if missing at the top:

```ts
import { eq } from 'drizzle-orm';
```

Then add `players` and `matches` to the existing schema imports (they should already be there — verify; if not, fix). Add the backfill block:

```ts
    // Step N+1: Heuristic backfill of side columns for matches with no side data
    // Convention: lefty → revés, righty → drive. Fallback when both same-handed:
    // team1Player1 → drive, team1Player2 → revés (positional).
    const allMatches = await db.select().from(matches);
    const allPlayers = await db.select().from(players);
    const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

    function backfillSides(p1Id: string, p2Id: string): { player1: string | null; player2: string | null } {
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

      const t1 = backfillSides(m.team1Player1Id, m.team1Player2Id);
      const t2 = backfillSides(m.team2Player1Id, m.team2Player2Id);

      await db.update(matches).set({
        team1Player1Side: t1.player1,
        team1Player2Side: t1.player2,
        team2Player1Side: t2.player1,
        team2Player2Side: t2.player2,
      }).where(eq(matches.id, m.id));
    }
```

Verify imports at the top include `players, matches` from schema and `eq` from drizzle-orm.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

```bash
git add src/lib/db/schema.ts src/app/api/migrate-db/route.ts
git commit -m "feat(schema): add 4 side columns to matches + heuristic backfill in migrate-db"
```

---

## Task C.5: API — POST and PUT `/api/matches` accept sides

**Files:**
- Modify: `src/app/api/matches/route.ts`
- Modify: `src/app/api/matches/[id]/route.ts`

- [ ] **Step 1: Read the current handlers**

Open both files to see the current body destructuring. The POST creates new matches; the PUT adds a result to a scheduled match.

- [ ] **Step 2: Add a coercion helper at the top of `src/app/api/matches/route.ts`**

Right after the imports, add:

```ts
function coerceSide(value: unknown): string | null {
  return value === 'drive' || value === 'reves' ? value : null;
}
```

- [ ] **Step 3: Update POST to destructure and persist sides**

Find the POST handler's body destructuring:

```ts
const {
  date,
  location,
  team1Player1Id,
  team1Player2Id,
  team2Player1Id,
  team2Player2Id,
  sets,
} = body;
```

Add the 4 side fields:

```ts
const {
  date,
  location,
  team1Player1Id,
  team1Player2Id,
  team2Player1Id,
  team2Player2Id,
  team1Player1Side,
  team1Player2Side,
  team2Player1Side,
  team2Player2Side,
  sets,
} = body;
```

Then in the `db.insert(matches).values({ ... })` call, add the 4 side fields with coercion:

```ts
.values({
  date,
  location: location?.trim() || null,
  team1Player1Id,
  team1Player2Id,
  team2Player1Id,
  team2Player2Id,
  team1Player1Side: coerceSide(team1Player1Side),
  team1Player2Side: coerceSide(team1Player2Side),
  team2Player1Side: coerceSide(team2Player1Side),
  team2Player2Side: coerceSide(team2Player2Side),
  winnerTeam,
  status: isScheduled ? 'scheduled' : 'completed',
})
```

- [ ] **Step 4: Update PUT to accept sides too**

In `src/app/api/matches/[id]/route.ts`, the PUT handler currently destructures only `sets`. Extend:

```ts
const body = await request.json();
const { sets, team1Player1Side, team1Player2Side, team2Player1Side, team2Player2Side } = body;
```

Add the same coercion helper at the top of THIS file too (paste the same `coerceSide` function — it's a 2-line helper, not worth extracting to a shared module yet):

```ts
function coerceSide(value: unknown): string | null {
  return value === 'drive' || value === 'reves' ? value : null;
}
```

Then in the `.set({ ... })` call where status/winner are updated, add the 4 side fields conditionally — only set them if they were in the body (so a result-form that doesn't send sides doesn't accidentally null them):

```ts
const updateFields: Record<string, unknown> = { winnerTeam, status: 'completed' };
if (team1Player1Side !== undefined) updateFields.team1Player1Side = coerceSide(team1Player1Side);
if (team1Player2Side !== undefined) updateFields.team1Player2Side = coerceSide(team1Player2Side);
if (team2Player1Side !== undefined) updateFields.team2Player1Side = coerceSide(team2Player1Side);
if (team2Player2Side !== undefined) updateFields.team2Player2Side = coerceSide(team2Player2Side);

const [updated] = await db
  .update(matches)
  .set(updateFields)
  .where(eq(matches.id, id))
  .returning();
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

```bash
git add src/app/api/matches/route.ts src/app/api/matches/[id]/route.ts
git commit -m "feat(api): matches POST/PUT accept and persist side fields with coercion"
```

---

## Task C.6: New PATCH `/api/matches/[id]/sides` endpoint

**Files:**
- Create: `src/app/api/matches/[id]/sides/route.ts`

Focused endpoint that updates ONLY the 4 side columns of a match.

- [ ] **Step 1: Create the file**

Create `src/app/api/matches/[id]/sides/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { matches } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function coerceSide(value: unknown): string | null {
  return value === 'drive' || value === 'reves' ? value : null;
}

// PATCH /api/matches/[id]/sides — update only the side columns
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { team1Player1Side, team1Player2Side, team2Player1Side, team2Player2Side } = body;

    const [updated] = await db
      .update(matches)
      .set({
        team1Player1Side: coerceSide(team1Player1Side),
        team1Player2Side: coerceSide(team1Player2Side),
        team2Player1Side: coerceSide(team2Player1Side),
        team2Player2Side: coerceSide(team2Player2Side),
      })
      .where(eq(matches.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al actualizar lados' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

```bash
git add src/app/api/matches/[id]/sides/route.ts
git commit -m "feat(api): add PATCH /api/matches/[id]/sides endpoint"
```

---

## Task C.7: `match-form.tsx` — add side dropdowns

**Files:**
- Modify: `src/components/admin/match-form.tsx`

Add a side dropdown next to each player select within the team builder.

- [ ] **Step 1: Add side state to the form**

Find the existing state declarations:

```ts
const [team1, setTeam1] = useState<[string, string]>(['', '']);
const [team2, setTeam2] = useState<[string, string]>(['', '']);
```

Add right after them:

```ts
const [team1Sides, setTeam1Sides] = useState<[string, string]>(['', '']); // '' | 'drive' | 'reves'
const [team2Sides, setTeam2Sides] = useState<[string, string]>(['', '']);
```

- [ ] **Step 2: Modify the `playerSlot` helper to include the side dropdown**

The current `playerSlot` helper renders 2 player select fields per team. Replace its body to also render a side dropdown next to each select:

```tsx
const playerSlot = (
  team: [string, string],
  setTeam: (v: [string, string]) => void,
  sides: [string, string],
  setSides: (v: [string, string]) => void,
  label: string,
  color: string,
) => (
  <div className="space-y-3">
    <p className={`font-semibold text-sm ${color}`}>{label}</p>
    {[0, 1].map((slot) => (
      <div key={slot} className="space-y-1">
        <Label className="text-xs">Jugador {slot + 1}</Label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select
            className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            value={team[slot]}
            onChange={(e) => {
              const next: [string, string] = [...team] as [string, string];
              next[slot] = e.target.value;
              setTeam(next);
            }}
            required
          >
            <option value="">— Seleccionar —</option>
            {availablePlayers(team[slot]).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.nickname ? ` (${p.nickname})` : ''}
              </option>
            ))}
          </select>
          <select
            className="border rounded-md px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            value={sides[slot]}
            onChange={(e) => {
              const next: [string, string] = [...sides] as [string, string];
              next[slot] = e.target.value;
              setSides(next);
            }}
            aria-label={`Lado del jugador ${slot + 1}`}
          >
            <option value="">Lado —</option>
            <option value="drive">Drive</option>
            <option value="reves">Revés</option>
          </select>
        </div>
      </div>
    ))}
  </div>
);
```

- [ ] **Step 3: Update the call sites of `playerSlot`**

Find the JSX block that calls `playerSlot(team1, setTeam1, ...)` and `playerSlot(team2, setTeam2, ...)`. Replace with:

```tsx
{playerSlot(team1, setTeam1, team1Sides, setTeam1Sides, '🔵 Equipo 1', 'text-blue-700')}
{playerSlot(team2, setTeam2, team2Sides, setTeam2Sides, '🔴 Equipo 2', 'text-red-700')}
```

- [ ] **Step 4: Include sides in the POST payload**

Find the `payload` object inside `handleSubmit`:

```ts
const payload = {
  date,
  location: location.trim() || null,
  team1Player1Id: team1[0],
  team1Player2Id: team1[1],
  team2Player1Id: team2[0],
  team2Player2Id: team2[1],
  ...(mode === 'completed' && {
    sets: sets.map((s, i) => ({
      setNumber: i + 1,
      team1Games: Number(s.team1Games),
      team2Games: Number(s.team2Games),
    })),
  }),
};
```

Add the 4 side fields (mapping empty string to null):

```ts
const payload = {
  date,
  location: location.trim() || null,
  team1Player1Id: team1[0],
  team1Player2Id: team1[1],
  team2Player1Id: team2[0],
  team2Player2Id: team2[1],
  team1Player1Side: team1Sides[0] || null,
  team1Player2Side: team1Sides[1] || null,
  team2Player1Side: team2Sides[0] || null,
  team2Player2Side: team2Sides[1] || null,
  ...(mode === 'completed' && {
    sets: sets.map((s, i) => ({
      setNumber: i + 1,
      team1Games: Number(s.team1Games),
      team2Games: Number(s.team2Games),
    })),
  }),
};
```

- [ ] **Step 5: Add a soft validation warning**

Right after `setLoading(true)` (and before the fetch), add a warning toast if a team has both players on the same side:

```ts
if (team1Sides[0] && team1Sides[1] && team1Sides[0] === team1Sides[1]) {
  toast.warning(`Ambos jugadores del Equipo 1 al ${team1Sides[0] === 'drive' ? 'drive' : 'revés'}. ¿Seguro?`);
}
if (team2Sides[0] && team2Sides[1] && team2Sides[0] === team2Sides[1]) {
  toast.warning(`Ambos jugadores del Equipo 2 al ${team2Sides[0] === 'drive' ? 'drive' : 'revés'}. ¿Seguro?`);
}
```

(`toast.warning` is from sonner — already imported as `toast`.)

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

```bash
git add src/components/admin/match-form.tsx
git commit -m "feat(admin): match-form gets side dropdowns next to each player"
```

---

## Task C.8: `result-form.tsx` — add side dropdowns

**Files:**
- Modify: `src/components/admin/result-form.tsx`
- Modify: `src/app/admin/matches/[id]/result/page.tsx` (pass current sides as props)

- [ ] **Step 1: Read both files**

Open both to confirm the current shape of `ResultFormProps` and how the result page invokes the form.

- [ ] **Step 2: Extend `ResultFormProps`**

In `src/components/admin/result-form.tsx`, find the interface and add the 4 player IDs + their current sides:

```ts
interface ResultFormProps {
  matchId: string;
  team1Name: string;
  team2Name: string;
  date: string;
  location?: string | null;
  team1Player1Name: string;
  team1Player2Name: string;
  team2Player1Name: string;
  team2Player2Name: string;
  initialSides: {
    team1Player1Side: string | null;
    team1Player2Side: string | null;
    team2Player1Side: string | null;
    team2Player2Side: string | null;
  };
}
```

- [ ] **Step 3: Add side state and a new section to the form**

After the existing `useState` for `sets`, add:

```ts
const [team1Sides, setTeam1Sides] = useState<[string, string]>([
  initialSides.team1Player1Side ?? '',
  initialSides.team1Player2Side ?? '',
]);
const [team2Sides, setTeam2Sides] = useState<[string, string]>([
  initialSides.team2Player1Side ?? '',
  initialSides.team2Player2Side ?? '',
]);
```

In the JSX, between the sets card and the buttons row, add a new card for side selection (uses the same dual-dropdown pattern from match-form):

```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🎾 Lado de pista (opcional)</p>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div className="space-y-3">
      <p className="font-semibold text-sm text-blue-700">🔵 {team1Name}</p>
      {[
        { name: team1Player1Name, value: team1Sides[0], onChange: (v: string) => setTeam1Sides([v, team1Sides[1]]) },
        { name: team1Player2Name, value: team1Sides[1], onChange: (v: string) => setTeam1Sides([team1Sides[0], v]) },
      ].map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] gap-2 items-center">
          <span className="text-sm text-gray-700 truncate">{row.name}</span>
          <select
            className="border rounded-md px-2 py-1 text-sm bg-white"
            value={row.value}
            onChange={(e) => row.onChange(e.target.value)}
          >
            <option value="">—</option>
            <option value="drive">Drive</option>
            <option value="reves">Revés</option>
          </select>
        </div>
      ))}
    </div>
    <div className="space-y-3">
      <p className="font-semibold text-sm text-red-700">🔴 {team2Name}</p>
      {[
        { name: team2Player1Name, value: team2Sides[0], onChange: (v: string) => setTeam2Sides([v, team2Sides[1]]) },
        { name: team2Player2Name, value: team2Sides[1], onChange: (v: string) => setTeam2Sides([team2Sides[0], v]) },
      ].map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] gap-2 items-center">
          <span className="text-sm text-gray-700 truncate">{row.name}</span>
          <select
            className="border rounded-md px-2 py-1 text-sm bg-white"
            value={row.value}
            onChange={(e) => row.onChange(e.target.value)}
          >
            <option value="">—</option>
            <option value="drive">Drive</option>
            <option value="reves">Revés</option>
          </select>
        </div>
      ))}
    </div>
  </div>
</div>
```

- [ ] **Step 4: Send sides in the PUT body**

Find the `fetch` call inside `handleSubmit`:

```ts
const res = await fetch(`/api/matches/${matchId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sets: sets.map((s, i) => ({
      setNumber: i + 1,
      team1Games: Number(s.team1Games),
      team2Games: Number(s.team2Games),
    })),
  }),
});
```

Replace the body to also include sides:

```ts
body: JSON.stringify({
  sets: sets.map((s, i) => ({
    setNumber: i + 1,
    team1Games: Number(s.team1Games),
    team2Games: Number(s.team2Games),
  })),
  team1Player1Side: team1Sides[0] || null,
  team1Player2Side: team1Sides[1] || null,
  team2Player1Side: team2Sides[0] || null,
  team2Player2Side: team2Sides[1] || null,
}),
```

- [ ] **Step 5: Update the result page to pass the new props**

In `src/app/admin/matches/[id]/result/page.tsx`, find where `<ResultForm ... />` is rendered. Add the 4 player names and the initialSides object. The page already fetches the match — extend it to also fetch the player names and pass everything:

(Read the current page first to see the exact structure. Most likely you need to look up the 4 players from `playerMap` you already have — if not, add a query to fetch them.)

The render call will look like:
```tsx
<ResultForm
  matchId={match.id}
  team1Name={`${t1p1.name} / ${t1p2.name}`}
  team2Name={`${t2p1.name} / ${t2p2.name}`}
  date={match.date}
  location={match.location}
  team1Player1Name={t1p1.name}
  team1Player2Name={t1p2.name}
  team2Player1Name={t2p1.name}
  team2Player2Name={t2p2.name}
  initialSides={{
    team1Player1Side: match.team1Player1Side,
    team1Player2Side: match.team1Player2Side,
    team2Player1Side: match.team2Player1Side,
    team2Player2Side: match.team2Player2Side,
  }}
/>
```

(Adjust to whatever variable names already exist in that file.)

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

```bash
git add src/components/admin/result-form.tsx src/app/admin/matches/[id]/result/page.tsx
git commit -m "feat(admin): result-form accepts side selections, pre-fills with current values"
```

---

## Task C.9: Sides edit page + form + button in admin list

**Files:**
- Create: `src/components/admin/match-sides-form.tsx`
- Create: `src/app/admin/matches/[id]/sides/page.tsx`
- Modify: `src/app/admin/matches/page.tsx`

- [ ] **Step 1: Create the form component**

Create `src/components/admin/match-sides-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface MatchSidesFormProps {
  matchId: string;
  team1Player1Name: string;
  team1Player2Name: string;
  team2Player1Name: string;
  team2Player2Name: string;
  initialSides: {
    team1Player1Side: string | null;
    team1Player2Side: string | null;
    team2Player1Side: string | null;
    team2Player2Side: string | null;
  };
}

export function MatchSidesForm(props: MatchSidesFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sides, setSides] = useState({
    team1Player1Side: props.initialSides.team1Player1Side ?? '',
    team1Player2Side: props.initialSides.team1Player2Side ?? '',
    team2Player1Side: props.initialSides.team2Player1Side ?? '',
    team2Player2Side: props.initialSides.team2Player2Side ?? '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/matches/${props.matchId}/sides`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team1Player1Side: sides.team1Player1Side || null,
        team1Player2Side: sides.team1Player2Side || null,
        team2Player1Side: sides.team2Player1Side || null,
        team2Player2Side: sides.team2Player2Side || null,
      }),
    });
    if (res.ok) {
      toast.success('Lados actualizados ✓');
      router.push('/admin/matches');
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Error al guardar lados');
      setLoading(false);
    }
  }

  const playerRow = (label: string, sideKey: keyof typeof sides, color: string) => (
    <div className={`grid grid-cols-[1fr_auto] gap-3 items-center py-2 ${color}`}>
      <span className="text-sm font-medium truncate">{label}</span>
      <select
        className="border rounded-md px-3 py-2 text-sm bg-white min-w-[120px]"
        value={sides[sideKey]}
        onChange={(e) => setSides({ ...sides, [sideKey]: e.target.value })}
      >
        <option value="">— Sin registrar</option>
        <option value="drive">🟦 Drive</option>
        <option value="reves">🟪 Revés</option>
      </select>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🔵 Equipo 1</p>
        {playerRow(props.team1Player1Name, 'team1Player1Side', 'text-blue-900')}
        {playerRow(props.team1Player2Name, 'team1Player2Side', 'text-blue-900')}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🔴 Equipo 2</p>
        {playerRow(props.team2Player1Name, 'team2Player1Side', 'text-red-900')}
        {playerRow(props.team2Player2Name, 'team2Player2Side', 'text-red-900')}
      </div>
      <div className="flex gap-3">
        <Button type="submit" disabled={loading} className="flex-1 min-h-[40px] px-4 text-sm bg-green-600 hover:bg-green-700 text-white font-bold">
          {loading ? 'Guardando...' : '✓ Guardar lados'}
        </Button>
        <Button type="button" variant="outline" className="min-h-[40px] px-4 text-sm" onClick={() => router.push('/admin/matches')}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create the page**

Create `src/app/admin/matches/[id]/sides/page.tsx`:

```tsx
import { db } from '@/lib/db';
import { matches, players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { MatchSidesForm } from '@/components/admin/match-sides-form';

export const dynamic = 'force-dynamic';

export default async function MatchSidesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [match] = await db.select().from(matches).where(eq(matches.id, id));
  if (!match) notFound();

  const allPlayers = await db.select().from(players);
  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const t1p1 = playerMap[match.team1Player1Id];
  const t1p2 = playerMap[match.team1Player2Id];
  const t2p1 = playerMap[match.team2Player1Id];
  const t2p2 = playerMap[match.team2Player2Id];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Editar lados de pista</h1>
        <p className="text-gray-500 text-sm">{match.date}{match.location ? ` · ${match.location}` : ''}</p>
      </div>
      <MatchSidesForm
        matchId={match.id}
        team1Player1Name={t1p1?.name ?? '?'}
        team1Player2Name={t1p2?.name ?? '?'}
        team2Player1Name={t2p1?.name ?? '?'}
        team2Player2Name={t2p2?.name ?? '?'}
        initialSides={{
          team1Player1Side: match.team1Player1Side,
          team1Player2Side: match.team1Player2Side,
          team2Player1Side: match.team2Player1Side,
          team2Player2Side: match.team2Player2Side,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Add "Lados" button to admin matches list cards**

In `src/app/admin/matches/page.tsx`, find the buttons row inside both the scheduled and completed match cards. For SCHEDULED cards (the `flex items-center gap-2 shrink-0` containing the "+ Resultado" Link and DeleteMatchButton), add a "Lados" Link before the delete button:

```tsx
<Link href={`/admin/matches/${match.id}/sides`}>
  <Button variant="outline" className="min-h-[40px] px-3 text-xs">🎾 Lados</Button>
</Link>
```

For COMPLETED cards, the current row only has the DeleteMatchButton (no other action). Wrap it so the "Lados" link appears beside it:

```tsx
<div className="flex items-center gap-2 shrink-0">
  <Link href={`/admin/matches/${match.id}/sides`}>
    <Button variant="outline" className="min-h-[40px] px-3 text-xs">🎾 Lados</Button>
  </Link>
  <DeleteMatchButton id={match.id} />
</div>
```

(The exact JSX pattern depends on the current file — read it first. The principle: add the Lados link button next to existing action buttons.)

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

```bash
git add src/components/admin/match-sides-form.tsx src/app/admin/matches/[id]/sides/page.tsx src/app/admin/matches/page.tsx
git commit -m "feat(admin): sides edit page + form + Lados button in matches list"
```

---

## Task C.10: Match detail — D/R badges next to player names

**Files:**
- Modify: `src/app/(public)/matches/[id]/page.tsx`

Add a small badge next to each of the 4 player names in the match detail hero showing their side.

- [ ] **Step 1: Add a small SideBadge helper at the top of the file**

Right after the imports, add:

```tsx
function SideBadge({ side }: { side: string | null }) {
  if (side !== 'drive' && side !== 'reves') return null;
  const colors = side === 'drive'
    ? 'bg-blue-500/20 border border-blue-400/40 text-blue-200'
    : 'bg-purple-500/20 border border-purple-400/40 text-purple-200';
  return (
    <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-bold ${colors}`}>
      {side === 'drive' ? 'D' : 'R'}
    </span>
  );
}
```

- [ ] **Step 2: Render the badge next to each player name in the hero**

The hero JSX renders the 4 player names in 8 places total (4 on mobile-stacked layout × 2 player slots × 2 teams; same for desktop horizontal). For each `<p>` rendering a player name, append the badge:

Mobile completed layout — find each `<p>` for team1's players (e.g. `{t1p1?.name ?? '?'}`) and wrap in a fragment:

```tsx
<p className={...}>
  {t1p1?.name ?? '?'}
  <SideBadge side={match.team1Player1Side} />
</p>
```

Repeat for `t1p2` (with `match.team1Player2Side`), `t2p1` (with `match.team2Player1Side`), `t2p2` (with `match.team2Player2Side`).

Repeat the same 4 additions for the desktop horizontal layout (the `hidden sm:grid` block).

Repeat ALSO for the scheduled branch (both mobile and desktop layouts).

In total: 4 player slots × 2 layouts × 2 statuses (completed and scheduled) = 16 badge insertions. Be systematic.

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

```bash
git add src/app/(public)/matches/[id]/page.tsx
git commit -m "feat(public): match detail shows D/R badges next to each player name"
```

---

## Task C.11: Match detail — recommender uses sideStats and shows side suggestions

**Files:**
- Modify: `src/app/(public)/matches/[id]/page.tsx`

Calculate `sideStatsByPlayer` for the 4 players, pass it to `recommendPairings`, and render side suggestion badges next to each player in each pairing option.

- [ ] **Step 1: Add imports**

Add to the imports at the top of the file:

```tsx
import { computeSideStats, type MatchWithSide } from '@/lib/rating/side-stats';
```

- [ ] **Step 2: Build `sideStatsByPlayer` for the 4 players**

In the page component (after the existing data fetches but before the `pairingOptions` calculation):

```tsx
// Build side stats for the 4 players from their completed matches
const fourPlayerIds = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id];
const playerCompletedMatches = pairingOptions !== null
  ? await db.select().from(matches).where(
      and(eq(matches.status, 'completed'), or(
        inArray(matches.team1Player1Id, fourPlayerIds),
        inArray(matches.team1Player2Id, fourPlayerIds),
        inArray(matches.team2Player1Id, fourPlayerIds),
        inArray(matches.team2Player2Id, fourPlayerIds),
      ))
    )
  : [];

const sideStatsByPlayer: Record<string, ReturnType<typeof computeSideStats>> = {};
for (const pid of fourPlayerIds) {
  sideStatsByPlayer[pid] = computeSideStats(pid, playerCompletedMatches as MatchWithSide[]);
}
```

(`pairingOptions` is the existing variable from the current code — only build sideStats when there are pairings to consider, i.e. for scheduled matches.)

Wait — the order matters. Update so `pairingOptions` is computed AFTER `sideStatsByPlayer`. Look at the current code: `pairingOptions` is built from `recommendPairings([t1p1!, t1p2!, t2p1!, t2p2!])`. Move that line to AFTER the side stats block, and pass the side stats:

```tsx
const pairingOptions = match.status === 'scheduled' && fourPlayers.length === 4
  ? recommendPairings([t1p1!, t1p2!, t2p1!, t2p2!], sideStatsByPlayer)
  : null;
```

(Adjust the imports at the top of the file to include `and`, `or`, `inArray` from drizzle-orm if not already present.)

- [ ] **Step 3: Render side suggestion badges in each pairing option**

In the recommender section (the `pairingOptions.map((opt, idx) => ...)` block), find where each player in `opt.team1` is rendered and add a side suggestion badge if `opt.team1SideRec` exists. Similarly for team2.

Add a small helper above the JSX (or inline):

```tsx
function SideSuggestionBadge({ rec, playerId }: { rec: { driveSidePlayerId: string; revesSidePlayerId: string } | null; playerId: string }) {
  if (!rec) return null;
  if (rec.driveSidePlayerId === playerId) {
    return <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-bold bg-blue-100 text-blue-700">🟦 Drive sugerido</span>;
  }
  if (rec.revesSidePlayerId === playerId) {
    return <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-bold bg-purple-100 text-purple-700">🟪 Revés sugerido</span>;
  }
  return null;
}
```

Then in the rendering of each player inside team1 and team2 of each pairing option, append `<SideSuggestionBadge rec={opt.team1SideRec} playerId={p.id} />` (and `opt.team2SideRec` for team2 players).

(Read the current recommender JSX block to find the exact insertion points — they're `<p>{p.name}</p>` lines within the team1/team2 blocks of each pairing card.)

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

```bash
git add src/app/(public)/matches/[id]/page.tsx
git commit -m "feat(public): match detail recommender shows side suggestions per player"
```

---

## Task C.12: Player profile — "Lado de pista" card

**Files:**
- Modify: `src/app/(public)/players/[id]/page.tsx`

New card between "Mejor compañero" and "Historial de partidos" showing drive vs revés stats.

- [ ] **Step 1: Add imports**

Add to the existing imports:

```tsx
import { computeSideStats, type MatchWithSide } from '@/lib/rating/side-stats';
```

- [ ] **Step 2: Compute side stats**

In the page component, the existing query `playerMatches` already returns all completed matches the player participated in. Filter to the completed ones (already done as `completedMatches`), then:

```tsx
const sideStats = computeSideStats(id, completedMatches as MatchWithSide[]);
const hasSideData = sideStats.drive.matches > 0 || sideStats.reves.matches > 0;
const driveBetter = sideStats.drive.winRate >= sideStats.reves.winRate;
```

- [ ] **Step 3: Add the card to the JSX**

Find the "Mejor compañero" card block in the JSX. Right after its closing `</div>` (before the "Historial de partidos" block), insert the new card:

```tsx
{hasSideData && (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
    <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">🎾 Lado de pista</p>
    <div className="grid grid-cols-2 gap-4">
      <SideStatBlock label="Drive" emoji="🟦" stats={sideStats.drive} highlight={driveBetter && sideStats.drive.matches > 0} />
      <SideStatBlock label="Revés" emoji="🟪" stats={sideStats.reves} highlight={!driveBetter && sideStats.reves.matches > 0} />
    </div>
  </div>
)}
```

- [ ] **Step 4: Define the `SideStatBlock` helper component at the bottom of the file**

After the default-exported page component, add (still in the same file — the codebase uses helper functions colocated in page files):

```tsx
function SideStatBlock({ label, emoji, stats, highlight }: {
  label: string;
  emoji: string;
  stats: { matches: number; wins: number; losses: number; winRate: number };
  highlight: boolean;
}) {
  if (stats.matches === 0) {
    return (
      <div className="rounded-xl border border-gray-100 p-4 text-center text-gray-400">
        <p className="text-2xl mb-1">{emoji}</p>
        <p className="font-black text-xs uppercase tracking-wider mb-1">{label}</p>
        <p className="text-sm">Sin datos</p>
      </div>
    );
  }
  const winPct = Math.round(stats.winRate * 100);
  const colorClass = winPct >= 60 ? 'text-green-600' : winPct >= 40 ? 'text-yellow-600' : 'text-red-500';
  return (
    <div className={`rounded-xl p-4 text-center ${highlight ? 'border-2 border-green-300 bg-green-50/30' : 'border border-gray-100'}`}>
      <p className="text-2xl mb-1">{emoji}</p>
      <p className="font-black text-xs uppercase tracking-wider mb-1 text-gray-600">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${colorClass}`}>{winPct}%</p>
      <p className="text-xs text-gray-400 mt-0.5">{stats.matches}P · {stats.wins}V {stats.losses}D</p>
      {highlight && <p className="text-[10px] text-green-700 font-bold mt-1">↑ Tu mejor lado</p>}
    </div>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

```bash
git add src/app/(public)/players/[id]/page.tsx
git commit -m "feat(public): player profile gets Lado de pista analytics card"
```

---

## Task C.13: Final verification

**Files:** none modified — QA only.

- [ ] **Step 1: Final triple check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, ~33 tests pass (23 original + 7 side-stats + 6 recommend-sides + 3 recommend-pairs).

- [ ] **Step 2: Confirm cumulative diff**

Run: `git diff main..HEAD --stat`
Expected files (8 modified + 5 created + spec/plan docs):

Modified:
- `src/lib/db/schema.ts`
- `src/app/api/migrate-db/route.ts`
- `src/app/api/matches/route.ts`
- `src/app/api/matches/[id]/route.ts`
- `src/lib/rating/recommend-pairs.ts`
- `src/components/admin/match-form.tsx`
- `src/components/admin/result-form.tsx`
- `src/app/admin/matches/[id]/result/page.tsx`
- `src/app/admin/matches/page.tsx`
- `src/app/(public)/matches/[id]/page.tsx`
- `src/app/(public)/players/[id]/page.tsx`

Created:
- `src/lib/rating/side-stats.ts`
- `src/lib/rating/side-stats.test.ts`
- `src/lib/rating/recommend-sides.ts`
- `src/lib/rating/recommend-sides.test.ts`
- `src/lib/rating/recommend-pairs.test.ts`
- `src/app/api/matches/[id]/sides/route.ts`
- `src/app/admin/matches/[id]/sides/page.tsx`
- `src/components/admin/match-sides-form.tsx`
- `docs/superpowers/specs/2026-04-27-court-side-tracking-design.md`
- `docs/superpowers/plans/2026-04-27-court-side-tracking.md`

If anything else appears, investigate before merging.

- [ ] **Step 3: No commit needed** unless something needs fixing.

---

## Post-deploy: apply migration + backfill

After merge + push + Vercel deploy completes (~40s):

```bash
curl -X POST https://lomeros-padel-tour.vercel.app/api/migrate-db
```

This adds the 4 columns AND applies the heuristic backfill to all existing matches. Idempotent — safe to run again, but the backfill only fills matches that have all 4 side columns NULL (skips matches already edited).

Manual sweep:
1. Open `/admin/matches` → confirm "🎾 Lados" button appears next to each match.
2. Click "🎾 Lados" on an old match → verify the form pre-fills with the heuristic-backfilled values.
3. Change one side and save → verify it persists.
4. Open `/admin/matches/new` → create a new match with sides selected → verify it persists.
5. Open the match's detail page → confirm "D" / "R" badges next to player names.
6. Open a player profile (one with side data) → confirm the "Lado de pista" card appears with correct stats.
7. Create a SCHEDULED match → open its detail → confirm the recommender shows side suggestions per player.

---

## Summary of files

**Created (8):**
- `src/lib/rating/side-stats.ts`
- `src/lib/rating/side-stats.test.ts`
- `src/lib/rating/recommend-sides.ts`
- `src/lib/rating/recommend-sides.test.ts`
- `src/lib/rating/recommend-pairs.test.ts`
- `src/app/api/matches/[id]/sides/route.ts`
- `src/app/admin/matches/[id]/sides/page.tsx`
- `src/components/admin/match-sides-form.tsx`

**Modified (11):**
- `src/lib/db/schema.ts`
- `src/lib/rating/recommend-pairs.ts`
- `src/app/api/migrate-db/route.ts`
- `src/app/api/matches/route.ts`
- `src/app/api/matches/[id]/route.ts`
- `src/components/admin/match-form.tsx`
- `src/components/admin/result-form.tsx`
- `src/app/admin/matches/[id]/result/page.tsx`
- `src/app/admin/matches/page.tsx`
- `src/app/(public)/matches/[id]/page.tsx`
- `src/app/(public)/players/[id]/page.tsx`

**Untouched:** Tests for Elo (still 23 pass), Podium, MatchCard, navigation, all rankings pages, info, login, B (lefty) flow.
