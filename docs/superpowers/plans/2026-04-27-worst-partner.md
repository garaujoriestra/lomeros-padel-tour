# Worst Partner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Peor compañero" card to the player profile, symmetric to the existing "Mejor compañero". Extract the shared card markup into a reusable `<PartnerCard>` component.

**Architecture:** Pure UI feature on data already in `pairStats`. New shared component, profile page is updated to compute the worst partner and conditionally render both cards in a 2-column grid.

**Tech Stack:** TypeScript, React 19 server components, Tailwind v4, Drizzle ORM (just for type imports).

**Verification model:** No new tests (UI-only change, no logic extracted). After each task: `npx tsc --noEmit && npm run lint && npm test`. Manual visual sweep post-deploy.

**Background:** spec at `docs/superpowers/specs/2026-04-27-worst-partner-design.md`. Read before starting.

---

## Pre-flight

- [ ] **Step 0a: Confirm branch**

Run: `git branch --show-current`
Expected: `feature/worst-partner`

- [ ] **Step 0b: Confirm baseline checks pass**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 49 tests pass.

---

## Task G.1: Create `<PartnerCard>` shared component

**Files:**
- Create: `src/components/shared/partner-card.tsx`

This component encapsulates the existing "Mejor compañero" card markup and adds the variant for "worst". The existing inline JSX in the profile page will be replaced in Task G.2.

- [ ] **Step 1: Create the component file**

Create `src/components/shared/partner-card.tsx` with EXACT content:

```tsx
import Link from 'next/link';
import type { Player } from '@/lib/db/schema';

interface PartnerCardProps {
  variant: 'best' | 'worst';
  partner: Player;
  pairStat: {
    matchesPlayed: number;
    wins: number;
    losses: number;
  };
}

export function PartnerCard({ variant, partner, pairStat }: PartnerCardProps) {
  const winRate = Math.round((pairStat.wins / pairStat.matchesPlayed) * 100);
  const isBest = variant === 'best';
  const headline = isBest ? '🤝 Mejor compañero' : '😬 Peor compañero';
  const avatarGradient = isBest
    ? 'from-green-400 to-green-600'
    : 'from-red-400 to-red-500';
  const winRateColor = isBest
    ? winRate >= 60 ? 'text-green-600' : 'text-gray-700'
    : winRate < 40 ? 'text-red-500' : 'text-gray-700';

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">{headline}</p>
      <Link href={`/players/${partner.id}`} className="flex items-center justify-between hover:opacity-80 transition-opacity">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white text-xl font-black shadow-sm`}>
            {partner.name.charAt(0)}
          </div>
          <div>
            <p className="font-black text-gray-800">{partner.name}</p>
            <p className="text-xs text-gray-400">{pairStat.matchesPlayed} partidos juntos</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-black tabular-nums ${winRateColor}`}>{winRate}%</p>
          <p className="text-xs text-gray-400">{pairStat.wins}V · {pairStat.losses}D</p>
        </div>
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. Component is exported but not yet imported anywhere — that's fine.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/partner-card.tsx
git commit -m "feat(shared): add PartnerCard component (best/worst variants)"
```

---

## Task G.2: Wire `<PartnerCard>` in player profile + add worst partner

**Files:**
- Modify: `src/app/(public)/players/[id]/page.tsx`

- [ ] **Step 1: Add import**

In `src/app/(public)/players/[id]/page.tsx`, find the existing imports section. Add:

```tsx
import { PartnerCard } from '@/components/shared/partner-card';
```

- [ ] **Step 2: Compute the worst partner alongside the existing best partner**

Find the existing `bestPartner` calculation:

```ts
const bestPartner = pairs
  .filter((p) => p.matchesPlayed >= 2)
  .sort((a, b) => (b.wins / b.matchesPlayed) - (a.wins / a.matchesPlayed))[0];
const bestPartnerPlayer = bestPartner
  ? playerMap[bestPartner.player1Id === id ? bestPartner.player2Id : bestPartner.player1Id]
  : null;
```

Right after, add the symmetric `worstPartner` calculation and the `showWorstCard` flag:

```ts
const worstPartner = pairs
  .filter((p) => p.matchesPlayed >= 2)
  .sort((a, b) => (a.wins / a.matchesPlayed) - (b.wins / b.matchesPlayed))[0];
const worstPartnerPlayer = worstPartner
  ? playerMap[worstPartner.player1Id === id ? worstPartner.player2Id : worstPartner.player1Id]
  : null;

// Only show "worst" card if it's a DIFFERENT player from "best"
const showWorstCard =
  worstPartnerPlayer != null &&
  bestPartnerPlayer != null &&
  worstPartnerPlayer.id !== bestPartnerPlayer.id;
```

- [ ] **Step 3: Replace the inline "Best partner" card block with the grid + components**

Find the existing JSX block:

```tsx
{/* Best partner */}
{bestPartnerPlayer && (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
    <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">🤝 Mejor compañero</p>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xl font-black shadow-sm">
          {bestPartnerPlayer.name.charAt(0)}
        </div>
        <div>
          <p className="font-black text-gray-800">{bestPartnerPlayer.name}</p>
          <p className="text-xs text-gray-400">{bestPartner.matchesPlayed} partidos juntos</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-2xl font-black tabular-nums ${Math.round((bestPartner.wins / bestPartner.matchesPlayed) * 100) >= 60 ? 'text-green-600' : 'text-gray-700'}`}>
          {Math.round((bestPartner.wins / bestPartner.matchesPlayed) * 100)}%
        </p>
        <p className="text-xs text-gray-400">{bestPartner.wins}V · {bestPartner.losses}D</p>
      </div>
    </div>
  </div>
)}
```

Replace it with:

```tsx
{/* Best partner + (optional) Worst partner */}
{bestPartnerPlayer && bestPartner && (
  <div className={`grid gap-4 ${showWorstCard ? 'sm:grid-cols-2' : ''}`}>
    <PartnerCard variant="best" partner={bestPartnerPlayer} pairStat={bestPartner} />
    {showWorstCard && worstPartner && (
      <PartnerCard variant="worst" partner={worstPartnerPlayer} pairStat={worstPartner} />
    )}
  </div>
)}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 49 tests pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/players/[id]/page.tsx"
git commit -m "feat(public): show worst partner card alongside best partner in profile"
```

---

## Task G.3: Final verification

**Files:** none modified — QA only.

- [ ] **Step 1: Final triple check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 49 tests pass.

- [ ] **Step 2: Confirm cumulative diff**

Run: `git diff main..HEAD --stat`
Expected exactly:
- `docs/superpowers/specs/2026-04-27-worst-partner-design.md`
- `docs/superpowers/plans/2026-04-27-worst-partner.md`
- `src/components/shared/partner-card.tsx`
- `src/app/(public)/players/[id]/page.tsx`

4 files. If anything else appears, investigate.

- [ ] **Step 3: No commit needed** unless something needs fixing.

---

## Post-deploy

After merge + push + Vercel auto-deploy completes (~40s):

1. Open production URL.
2. Open a player profile that has 2+ partners with at least 2 matches each → confirm both cards appear in a 2-column grid (desktop) or stacked (mobile).
3. Open a player profile with only 1 partner with 2+ matches → confirm only "Mejor compañero" appears, full width.
4. Open a player with 0 partners with 2+ matches → no partner card at all.
5. Click each card → navigates to that partner's profile.

No DB migration needed.

---

## Summary of files

**Created (1):**
- `src/components/shared/partner-card.tsx`

**Modified (1):**
- `src/app/(public)/players/[id]/page.tsx`

**Untouched:** schema, all API routes, all forms, admin pages, all other public pages, lógica de Elo, helpers de rating.
