# Head-to-Head Per Rival Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a player's head-to-head record vs every opponent in their profile, as a compact table sorted by matches played.

**Architecture:** Pure aggregation over the existing `matches` table — no schema, migration, or API changes. One new helper module (`head-to-head.ts`) developed test-first, plus one section added to the player profile.

**Tech Stack:** TypeScript, React 19 server components, Vitest (TDD), Tailwind v4.

**Verification model:** TDD for the helper. After each task: `npx tsc --noEmit && npm run lint && npm test`. Manual visual check post-deploy.

**Background:** spec at `docs/superpowers/specs/2026-04-27-head-to-head-design.md`. Read before starting.

---

## Pre-flight

- [ ] **Step 0a: Confirm branch**

Run: `git branch --show-current`
Expected: `feature/head-to-head`

- [ ] **Step 0b: Confirm baseline checks pass**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 40 tests pass.

---

## Task E.1: `head-to-head.ts` helper (TDD)

**Files:**
- Create: `src/lib/rating/head-to-head.ts`
- Create: `src/lib/rating/head-to-head.test.ts`

Pure function: given a playerId, an array of completed matches, and the player roster, returns aggregated head-to-head stats vs every opponent who has played in at least one opposing-team match.

- [ ] **Step 1: Write failing tests**

Create `src/lib/rating/head-to-head.test.ts` with this EXACT content:

```ts
import { describe, it, expect } from 'vitest';
import { computeAllRivalries, type MatchForRivalry } from './head-to-head';

const players = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Carol' },
  { id: 'p4', name: 'Dave' },
  { id: 'p5', name: 'Eve' },
];

function makeMatch(overrides: Partial<MatchForRivalry>): MatchForRivalry {
  return {
    team1Player1Id: 'p1',
    team1Player2Id: 'p2',
    team2Player1Id: 'p3',
    team2Player2Id: 'p4',
    winnerTeam: 1,
    ...overrides,
  };
}

describe('computeAllRivalries', () => {
  it('returns empty array for empty matches', () => {
    expect(computeAllRivalries('p1', [], players)).toEqual([]);
  });

  it('returns empty array when player did not play any match', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p2', team2Player1Id: 'p3' }),
    ];
    expect(computeAllRivalries('p99', matches, players)).toEqual([]);
  });

  it('does not count teammates as rivals', () => {
    // p1 and p2 are teammates against p3+p4. The result should include p3 and p4 (rivals)
    // but NOT p2 (teammate).
    const matches: MatchForRivalry[] = [
      {
        team1Player1Id: 'p1', team1Player2Id: 'p2',
        team2Player1Id: 'p3', team2Player2Id: 'p4',
        winnerTeam: 1,
      },
    ];
    const result = computeAllRivalries('p1', matches, players);
    expect(result.find((r) => r.opponentId === 'p2')).toBeUndefined();
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.opponentId).sort()).toEqual(['p3', 'p4']);
  });

  it('counts a single win against a single rival correctly', () => {
    const matches = [
      makeMatch({
        team1Player1Id: 'p1', team1Player2Id: 'p2',
        team2Player1Id: 'p3', team2Player2Id: 'p4',
        winnerTeam: 1,
      }),
    ];
    const result = computeAllRivalries('p1', matches, players);
    const vsP3 = result.find((r) => r.opponentId === 'p3');
    expect(vsP3).toEqual({
      opponentId: 'p3',
      opponentName: 'Carol',
      matches: 1,
      wins: 1,
      losses: 0,
      winRate: 1,
    });
  });

  it('counts a single loss against a rival correctly', () => {
    const matches = [
      makeMatch({
        team1Player1Id: 'p1', team1Player2Id: 'p2',
        team2Player1Id: 'p3', team2Player2Id: 'p4',
        winnerTeam: 2,
      }),
    ];
    const result = computeAllRivalries('p1', matches, players);
    const vsP3 = result.find((r) => r.opponentId === 'p3');
    expect(vsP3).toEqual({
      opponentId: 'p3',
      opponentName: 'Carol',
      matches: 1,
      wins: 0,
      losses: 1,
      winRate: 0,
    });
  });

  it('aggregates multiple matches against the same rival', () => {
    const matches = [
      makeMatch({ team1Player1Id: 'p1', team2Player1Id: 'p3', winnerTeam: 1 }), // win vs p3
      makeMatch({ team1Player1Id: 'p1', team2Player1Id: 'p3', winnerTeam: 2 }), // loss vs p3
      makeMatch({ team1Player1Id: 'p1', team2Player1Id: 'p3', winnerTeam: 1 }), // win vs p3
    ];
    const result = computeAllRivalries('p1', matches, players);
    const vsP3 = result.find((r) => r.opponentId === 'p3');
    expect(vsP3?.matches).toBe(3);
    expect(vsP3?.wins).toBe(2);
    expect(vsP3?.losses).toBe(1);
    expect(vsP3?.winRate).toBeCloseTo(2 / 3, 5);
  });

  it('sorts rivalries by matches played DESC, then by name ASC for ties', () => {
    // Setup so that p4 plays opposing 4 times, p3 = 3, p5 = 1, p2 never (always teammate).
    const matches: MatchForRivalry[] = [
      { team1Player1Id: 'p1', team1Player2Id: 'p2', team2Player1Id: 'p3', team2Player2Id: 'p4', winnerTeam: 1 },
      { team1Player1Id: 'p1', team1Player2Id: 'p2', team2Player1Id: 'p3', team2Player2Id: 'p4', winnerTeam: 2 },
      { team1Player1Id: 'p1', team1Player2Id: 'p2', team2Player1Id: 'p3', team2Player2Id: 'p4', winnerTeam: 1 },
      { team1Player1Id: 'p1', team1Player2Id: 'p2', team2Player1Id: 'p5', team2Player2Id: 'p4', winnerTeam: 1 },
    ];
    const result = computeAllRivalries('p1', matches, players);
    expect(result.map((r) => r.opponentId)).toEqual(['p4', 'p3', 'p5']);
    expect(result.find((r) => r.opponentId === 'p2')).toBeUndefined();
  });

  it('ignores matches where winnerTeam is null (scheduled)', () => {
    const matches = [
      makeMatch({ winnerTeam: null }),
    ];
    const result = computeAllRivalries('p1', matches, players);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- head-to-head`
Expected: FAIL — `Cannot find module './head-to-head'`.

- [ ] **Step 3: Implement `head-to-head.ts`**

Create `src/lib/rating/head-to-head.ts` with this EXACT content:

```ts
export interface RivalryStats {
  opponentId: string;
  opponentName: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface MatchForRivalry {
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  winnerTeam: number | null;
}

interface PlayerForRivalry {
  id: string;
  name: string;
}

function findPlayerTeam(playerId: string, m: MatchForRivalry): 1 | 2 | null {
  if (m.team1Player1Id === playerId || m.team1Player2Id === playerId) return 1;
  if (m.team2Player1Id === playerId || m.team2Player2Id === playerId) return 2;
  return null;
}

function opposingPlayerIds(playerTeam: 1 | 2, m: MatchForRivalry): string[] {
  return playerTeam === 1
    ? [m.team2Player1Id, m.team2Player2Id]
    : [m.team1Player1Id, m.team1Player2Id];
}

interface Tally { matches: number; wins: number; losses: number; }

export function computeAllRivalries(
  playerId: string,
  matches: MatchForRivalry[],
  allPlayers: PlayerForRivalry[],
): RivalryStats[] {
  const tally = new Map<string, Tally>();

  for (const m of matches) {
    if (m.winnerTeam === null) continue;
    const playerTeam = findPlayerTeam(playerId, m);
    if (!playerTeam) continue;

    const won = m.winnerTeam === playerTeam;
    for (const oppId of opposingPlayerIds(playerTeam, m)) {
      const t = tally.get(oppId) ?? { matches: 0, wins: 0, losses: 0 };
      t.matches += 1;
      if (won) t.wins += 1;
      else t.losses += 1;
      tally.set(oppId, t);
    }
  }

  const playerNameMap = new Map(allPlayers.map((p) => [p.id, p.name]));

  const result: RivalryStats[] = [];
  for (const [opponentId, t] of tally) {
    result.push({
      opponentId,
      opponentName: playerNameMap.get(opponentId) ?? '?',
      matches: t.matches,
      wins: t.wins,
      losses: t.losses,
      winRate: t.wins / t.matches,
    });
  }

  // Sort: matches DESC, then name ASC for ties
  result.sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches;
    return a.opponentName.localeCompare(b.opponentName);
  });

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 47 tests total (40 + 7 new).

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add src/lib/rating/head-to-head.ts src/lib/rating/head-to-head.test.ts
git commit -m "feat(rating): add computeAllRivalries helper with 7 unit tests"
```

---

## Task E.2: Profile head-to-head card

**Files:**
- Modify: `src/app/(public)/players/[id]/page.tsx`

Add the new section between "Lado de pista" and "Historial de partidos".

- [ ] **Step 1: Add imports**

Open `src/app/(public)/players/[id]/page.tsx`. Find the existing import line for `computeSideStats`:

```tsx
import { computeSideStats, type MatchWithSide } from '@/lib/rating/side-stats';
```

Add a new line right below it:

```tsx
import { computeAllRivalries, type RivalryStats } from '@/lib/rating/head-to-head';
```

- [ ] **Step 2: Compute rivalries**

In the page component, after the existing `sideStats` computation (and after `allPlayers` and `completedMatches` are already in scope), add:

```ts
const rivalries = computeAllRivalries(id, completedMatches, allPlayers);
```

The existing `completedMatches` variable is already filtered to completed matches and has all the required fields. The existing `allPlayers` is already an array of `{ id, name, ... }`.

- [ ] **Step 3: Insert the new card in the JSX**

Find the "Lado de pista" card block (look for `🎾 Lado de pista`). It looks like:

```tsx
{hasSideData && (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
    <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">🎾 Lado de pista</p>
    <div className="grid grid-cols-2 gap-4">
      <SideStatBlock ... />
      <SideStatBlock ... />
    </div>
  </div>
)}
```

Right AFTER its closing `)}` (and BEFORE the "Historial de partidos" section), insert:

```tsx
{rivalries.length > 0 && (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
    <div className="px-5 py-4 border-b border-gray-50">
      <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🤜 Head-to-head</p>
    </div>
    <div className="divide-y divide-gray-50">
      {rivalries.map((r) => (
        <RivalryRow key={r.opponentId} rivalry={r} />
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Add the `RivalryRow` helper**

After the default-exported page component (after the closing `}` of `export default async function PlayerProfilePage`), and after the existing `SideStatBlock` helper at the bottom of the file, add:

```tsx
function RivalryRow({ rivalry }: { rivalry: RivalryStats }) {
  const winPct = Math.round(rivalry.winRate * 100);
  const colorClass = winPct >= 60 ? 'text-green-600' : winPct >= 40 ? 'text-yellow-600' : 'text-red-500';
  return (
    <Link href={`/players/${rivalry.opponentId}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white text-sm font-black shrink-0">
          {rivalry.opponentName.charAt(0)}
        </div>
        <span className="text-sm font-bold text-gray-800 truncate">{rivalry.opponentName}</span>
      </div>
      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        <span className="text-xs text-gray-400 tabular-nums">{rivalry.matches}P</span>
        <span className="text-xs font-bold text-green-600 tabular-nums">{rivalry.wins}V</span>
        <span className="text-xs font-bold text-red-400 tabular-nums">{rivalry.losses}D</span>
        <span className={`text-sm font-black tabular-nums w-12 text-right ${colorClass}`}>{winPct}%</span>
      </div>
    </Link>
  );
}
```

The `Link` import should already exist at the top of the file (it's imported for other uses). If for some reason it's not, add `import Link from 'next/link';`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 47 tests pass.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/players/[id]/page.tsx"
git commit -m "feat(public): player profile gets head-to-head card"
```

---

## Task E.3: Final verification

**Files:** none modified — QA only.

- [ ] **Step 1: Final triple check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 47 tests pass.

- [ ] **Step 2: Confirm cumulative diff**

Run: `git diff main..HEAD --stat`
Expected exactly:
- `docs/superpowers/specs/2026-04-27-head-to-head-design.md`
- `docs/superpowers/plans/2026-04-27-head-to-head.md`
- `src/lib/rating/head-to-head.ts`
- `src/lib/rating/head-to-head.test.ts`
- `src/app/(public)/players/[id]/page.tsx`

5 files. If anything else appears, investigate before merging.

- [ ] **Step 3: No commit needed** unless something needs fixing.

---

## Post-deploy

After merge + push + Vercel auto-deploy completes (~40s):

1. Open the production URL.
2. Navigate to a player profile (one with several completed matches).
3. Confirm the "🤜 Head-to-head" card appears between "Lado de pista" and "Historial de partidos".
4. Verify rows are sorted by matches played (most → least).
5. Click a rival's row → confirm it navigates to that rival's profile.

No DB migration needed — this feature reads from existing data.

---

## Summary of files

**Created (2):**
- `src/lib/rating/head-to-head.ts`
- `src/lib/rating/head-to-head.test.ts`

**Modified (1):**
- `src/app/(public)/players/[id]/page.tsx`

**Untouched:** schema, all API routes, all forms, admin pages, all other public pages, lógica de Elo, Podium, MatchCard, recommend-pairs.
