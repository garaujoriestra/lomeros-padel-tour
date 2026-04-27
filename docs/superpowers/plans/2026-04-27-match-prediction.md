# Match Prediction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show team win probability on scheduled matches in the match detail hero and on each pair recommender option, using the existing `expectedScore` Elo function.

**Architecture:** Pure UI feature. No new helper modules — `expectedScore` already exists in `src/lib/rating/elo.ts`. Extends `PairingOption` with `team1WinProb` and renders the percentage in two locations.

**Tech Stack:** TypeScript, React 19 server components, Vitest (TDD for the recommender extension).

**Verification model:** TDD on the recommender change (1 new test). After each task: `npx tsc --noEmit && npm run lint && npm test`. Manual visual check post-deploy.

**Background:** spec at `docs/superpowers/specs/2026-04-27-match-prediction-design.md`. Read before starting.

---

## Pre-flight

- [ ] **Step 0a: Confirm branch**

Run: `git branch --show-current`
Expected: `feature/match-prediction`

- [ ] **Step 0b: Confirm baseline checks pass**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 48 tests pass.

---

## Task F.1: Extend `recommend-pairs.ts` with `team1WinProb` (TDD)

**Files:**
- Modify: `src/lib/rating/recommend-pairs.ts`
- Modify: `src/lib/rating/recommend-pairs.test.ts`

- [ ] **Step 1: Add the failing test**

Open `src/lib/rating/recommend-pairs.test.ts`. Inside the existing `describe('recommendPairings', () => { ... })` block, add this new test (anywhere is fine — at the end of the block is the cleanest place):

```ts
  it('computes team1WinProb correctly', () => {
    // Equal teams (1500 each) → both pairings yield 0.5 each side.
    const equal = recommendPairings(four);
    for (const opt of equal) {
      expect(opt.team1WinProb).toBeCloseTo(0.5, 5);
    }

    // Stronger pair on team1 → team1WinProb > 0.5.
    const skewed: [PlayerSummary, PlayerSummary, PlayerSummary, PlayerSummary] = [
      player('a', 1700),
      player('b', 1700),
      player('c', 1300),
      player('d', 1300),
    ];
    const result = recommendPairings(skewed);
    // Find the option where a+b are on the same team — that team has avg Elo 1700 vs 1300.
    // expectedScore(1700, 1300) = 1 / (1 + 10^((1300-1700)/400)) ≈ 0.909
    const abTogether = result.find(
      (o) => o.team1.some((p) => p.id === 'a') && o.team1.some((p) => p.id === 'b'),
    );
    expect(abTogether).toBeDefined();
    expect(abTogether!.team1WinProb).toBeCloseTo(0.909, 2);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- recommend-pairs`
Expected: FAIL — `team1WinProb` does not exist on `PairingOption` (TS error or runtime undefined).

- [ ] **Step 3: Update `src/lib/rating/recommend-pairs.ts`**

(a) Add the `expectedScore` import. Find the existing imports at the top of the file. Add:

```ts
import { expectedScore } from './elo';
```

(b) Extend the `PairingOption` interface. Find:

```ts
export interface PairingOption {
  team1: [PlayerSummary, PlayerSummary];
  team2: [PlayerSummary, PlayerSummary];
  team1Elo: number;
  team2Elo: number;
  eloDiff: number;
  fairnessScore: number;
  label: string;
  team1SideRec: SideRecommendation | null;
  team2SideRec: SideRecommendation | null;
}
```

Add the new field at the end:

```ts
export interface PairingOption {
  team1: [PlayerSummary, PlayerSummary];
  team2: [PlayerSummary, PlayerSummary];
  team1Elo: number;
  team2Elo: number;
  eloDiff: number;
  fairnessScore: number;
  label: string;
  team1SideRec: SideRecommendation | null;
  team2SideRec: SideRecommendation | null;
  team1WinProb: number; // 0-1, expected probability that team1 wins
}
```

(c) Inside the `combos.map(...)` callback, where each option is constructed, compute `team1WinProb` and include it in the returned object. Find the existing return statement (it currently returns the option with all the fields including `team1SideRec`/`team2SideRec`). Add `team1WinProb: expectedScore(team1Elo, team2Elo)` to the returned object.

The full updated map block (read the current file to find the exact location and integrate cleanly):

```ts
const options: PairingOption[] = combos.map(([t1, t2]) => {
  const team1Elo = (t1[0].eloRating + t1[1].eloRating) / 2;
  const team2Elo = (t2[0].eloRating + t2[1].eloRating) / 2;
  const eloDiff = Math.abs(team1Elo - team2Elo);

  const team1SideRec = sideStatsByPlayer
    ? recommendSides(
        { id: t1[0].id, sideStats: sideStatsByPlayer[t1[0].id] ?? emptySideStats() },
        { id: t1[1].id, sideStats: sideStatsByPlayer[t1[1].id] ?? emptySideStats() },
      )
    : null;
  const team2SideRec = sideStatsByPlayer
    ? recommendSides(
        { id: t2[0].id, sideStats: sideStatsByPlayer[t2[0].id] ?? emptySideStats() },
        { id: t2[1].id, sideStats: sideStatsByPlayer[t2[1].id] ?? emptySideStats() },
      )
    : null;

  return {
    team1: t1,
    team2: t2,
    team1Elo,
    team2Elo,
    eloDiff,
    fairnessScore: 0,
    label: '',
    team1SideRec,
    team2SideRec,
    team1WinProb: expectedScore(team1Elo, team2Elo),
  };
});
```

(The exact integration depends on what's there now — preserve all existing logic. Only add the `team1WinProb` line in the returned object.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 49 tests total (48 + 1 new).

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add src/lib/rating/recommend-pairs.ts src/lib/rating/recommend-pairs.test.ts
git commit -m "feat(rating): add team1WinProb to PairingOption using expectedScore"
```

---

## Task F.2: Display predictions in match detail page

**Files:**
- Modify: `src/app/(public)/matches/[id]/page.tsx`

This task does two things: shows the % under "Pendiente" in the scheduled hero (mobile + desktop layouts), and shows the % in each recommender option card.

- [ ] **Step 1: Add the import**

Open `src/app/(public)/matches/[id]/page.tsx`. At the top, find the imports section. Add:

```ts
import { expectedScore } from '@/lib/rating/elo';
```

- [ ] **Step 2: Add a small `PredictionLine` helper component**

After the existing `SideBadge` and `SideSuggestionBadge` helpers at the top of the file (added in earlier Feature C tasks), add:

```tsx
function PredictionLine({
  team1Elo,
  team2Elo,
  variant,
}: {
  team1Elo: number;
  team2Elo: number;
  variant: 'hero' | 'recommender';
}) {
  const team1Pct = Math.round(expectedScore(team1Elo, team2Elo) * 100);
  const team2Pct = 100 - team1Pct;
  if (variant === 'hero') {
    return (
      <p className="text-xs sm:text-sm text-white/70 mt-1 font-bold tabular-nums">
        <span className="text-blue-300">🔵 {team1Pct}%</span>
        <span className="mx-1.5 text-white/40">–</span>
        <span className="text-red-300">{team2Pct}% 🔴</span>
      </p>
    );
  }
  return (
    <p className="text-xs font-bold tabular-nums mt-1">
      <span className="text-blue-600">🔵 {team1Pct}%</span>
      <span className="mx-1.5 text-gray-300">–</span>
      <span className="text-red-600">{team2Pct}% 🔴</span>
    </p>
  );
}
```

- [ ] **Step 3: Render the prediction in the scheduled hero — MOBILE layout**

In the scheduled branch of the hero, find the mobile (`sm:hidden`) center column. It currently renders:

```tsx
<div className="text-center">
  <p className="text-3xl font-black text-blue-300">VS</p>
  <p className="text-blue-300/60 text-xs mt-1 uppercase tracking-widest">Pendiente</p>
</div>
```

Replace with (adds the `<PredictionLine>` after "Pendiente", only when all 4 players are loaded):

```tsx
<div className="text-center">
  <p className="text-3xl font-black text-blue-300">VS</p>
  <p className="text-blue-300/60 text-xs mt-1 uppercase tracking-widest">Pendiente</p>
  {t1p1 && t1p2 && t2p1 && t2p2 && (
    <PredictionLine
      team1Elo={(t1p1.eloRating + t1p2.eloRating) / 2}
      team2Elo={(t2p1.eloRating + t2p2.eloRating) / 2}
      variant="hero"
    />
  )}
</div>
```

- [ ] **Step 4: Render the prediction in the scheduled hero — DESKTOP layout**

In the scheduled branch's `hidden sm:grid` block, find the center column. It currently renders:

```tsx
<div className="text-center">
  <p className="text-4xl font-black text-blue-300">VS</p>
  <p className="text-blue-300/60 text-xs mt-1 uppercase tracking-widest">Pendiente</p>
</div>
```

Replace with the same pattern (adding the PredictionLine):

```tsx
<div className="text-center">
  <p className="text-4xl font-black text-blue-300">VS</p>
  <p className="text-blue-300/60 text-xs mt-1 uppercase tracking-widest">Pendiente</p>
  {t1p1 && t1p2 && t2p1 && t2p2 && (
    <PredictionLine
      team1Elo={(t1p1.eloRating + t1p2.eloRating) / 2}
      team2Elo={(t2p1.eloRating + t2p2.eloRating) / 2}
      variant="hero"
    />
  )}
</div>
```

- [ ] **Step 5: Render the prediction in each recommender option card**

Find the recommender section (`{pairingOptions && (...)}`). Inside the `pairingOptions.map((opt, idx) => ...)` block, find the top row of each card where the eloDiff is shown (something like):

```tsx
<div className="text-right">
  <p className="text-xs text-gray-400">Diferencia de Elo</p>
  <p className={`text-lg font-black tabular-nums ${...}`}>
    ±{Math.round(opt.eloDiff)}
  </p>
</div>
```

Right after the closing `</p>` of the eloDiff line and BEFORE the closing `</div>` of that text-right column, add the PredictionLine:

```tsx
<div className="text-right">
  <p className="text-xs text-gray-400">Diferencia de Elo</p>
  <p className={`text-lg font-black tabular-nums ${...}`}>
    ±{Math.round(opt.eloDiff)}
  </p>
  <PredictionLine
    team1Elo={opt.team1Elo}
    team2Elo={opt.team2Elo}
    variant="recommender"
  />
</div>
```

(Use `opt.team1Elo` and `opt.team2Elo` directly — the option already has them; we don't need to re-derive them.)

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 49 tests pass.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(public)/matches/[id]/page.tsx"
git commit -m "feat(public): show win probability in scheduled hero + recommender options"
```

---

## Task F.3: Final verification

**Files:** none modified — QA only.

- [ ] **Step 1: Final triple check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 49 tests.

- [ ] **Step 2: Confirm cumulative diff**

Run: `git diff main..HEAD --stat`
Expected exactly:
- `docs/superpowers/specs/2026-04-27-match-prediction-design.md`
- `docs/superpowers/plans/2026-04-27-match-prediction.md`
- `src/lib/rating/recommend-pairs.ts`
- `src/lib/rating/recommend-pairs.test.ts`
- `src/app/(public)/matches/[id]/page.tsx`

5 files. If anything else appears, investigate.

- [ ] **Step 3: No commit needed** unless something needs fixing.

---

## Post-deploy

After merge + push + Vercel deploy completes (~40s):

1. Open the production URL.
2. Find a SCHEDULED match (or create one from admin if needed).
3. Open its detail page.
4. Confirm under the "Pendiente" badge in the hero you see "🔵 X% – Y% 🔴".
5. If the recommender renders (4 valid players), confirm each option card shows its own probability line under the eloDiff.
6. Verify the most-balanced option's probability is closest to 50% / 50%.

No DB migration needed.

---

## Summary of files

**Modified (3 source + 2 docs):**
- `src/lib/rating/recommend-pairs.ts`
- `src/lib/rating/recommend-pairs.test.ts`
- `src/app/(public)/matches/[id]/page.tsx`
- `docs/superpowers/specs/2026-04-27-match-prediction-design.md` (committed in spec phase)
- `docs/superpowers/plans/2026-04-27-match-prediction.md` (this file)

**Created:** none.

**Untouched:** schema, all API routes, all forms, admin pages, all other public pages, lógica de Elo (elo.ts), recommend-sides, side-stats, head-to-head, completed matches.
