# Loading States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `loading.tsx` files per public route to give instant visual feedback during navigation, fixing the "page seems frozen for a few seconds after click" complaint.

**Architecture:** Mobile-first skeletons that mimic the silhouette of each real page. Four shared primitives in `src/components/shared/skeletons.tsx` (`SkeletonBox`, `SkeletonText`, `SkeletonHero`, `SkeletonMatchCard`). Six route-specific `loading.tsx` files compose those primitives into the layout of each page. Pure server components, no client JS, animation via Tailwind's `animate-pulse`.

**Tech Stack:** Next.js 16 (App Router file conventions — `loading.tsx` is automatically used as the navigation suspense fallback), React 19, Tailwind v4 (`animate-pulse` is built-in), `cn()` utility from `src/lib/utils`.

**Verification model:** No automated tests for visual elements (per project convention). Each task ends with a `tsc --noEmit && lint && test` triple-check, and the final task is a manual visual sweep with Network throttle.

**Background:** spec at `docs/superpowers/specs/2026-04-27-loading-states-design.md`. Read it before starting.

---

## Pre-flight

- [ ] **Step 0a: Confirm branch**

Run: `git branch --show-current`
Expected: `feature/loading-states` (the spec was committed on this branch).

- [ ] **Step 0b: Confirm baseline checks pass**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 23 tests pass.

---

## Task 1: Shared skeleton primitives

**Files:**
- Create: `src/components/shared/skeletons.tsx`

References spec section "Primitivas compartidas".

- [ ] **Step 1: Create the primitives module**

Create `src/components/shared/skeletons.tsx`:

```tsx
import { cn } from '@/lib/utils';

/**
 * Plain animated grey block. Used for any rectangular placeholder.
 * Pass `className` to control size (e.g. `className="h-32"`).
 */
export function SkeletonBox({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-gray-200 rounded-lg', className)} />;
}

/**
 * Animated grey line of text (default 16px tall). Use width via `className`.
 */
export function SkeletonText({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-gray-200 rounded h-4', className)} />;
}

/**
 * Reproduces the green-gradient hero shape used across pages.
 * `tall=false` matches the small heroes on rankings/matches/pairs (`md:p-10`).
 * `tall=true` matches the home/info hero (`md:p-14`).
 *
 * Note: the player-profile and match-detail heroes have custom internal
 * structure (avatar + stats grid / breadcrumb + score) and inline their
 * own hero block in their loading.tsx — they don't use this primitive.
 */
export function SkeletonHero({ tall = false }: { tall?: boolean }) {
  const padding = tall ? 'p-5 sm:p-8 md:p-14' : 'p-5 sm:p-7 md:p-10';
  const rounded = tall ? 'rounded-2xl sm:rounded-3xl' : 'rounded-xl sm:rounded-2xl';
  return (
    <div
      className={`relative overflow-hidden ${rounded} bg-gradient-to-r from-green-950 to-emerald-900 ${padding} text-white shadow-xl`}
    >
      <div className="space-y-3">
        <div className="animate-pulse bg-green-800/50 rounded h-8 sm:h-9 md:h-10 w-3/4 max-w-md" />
        <div className="animate-pulse bg-green-800/40 rounded h-4 w-1/2 max-w-xs" />
      </div>
    </div>
  );
}

/**
 * Reproduces a <MatchCard /> placeholder in both mobile-stacked and
 * desktop-horizontal layouts. Mirrors the exact breakpoints and dimensions
 * of the real component so the visual swap is silent.
 */
export function SkeletonMatchCard() {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      {/* Header strip */}
      <div className="px-4 sm:px-5 py-2.5 border-b bg-gray-50/80 flex justify-between items-center">
        <SkeletonText className="w-20 h-3" />
        <SkeletonText className="w-16 h-3" />
      </div>
      <div className="p-4 sm:p-6">
        {/* Mobile (<sm): stacked */}
        <div className="sm:hidden space-y-3">
          <SkeletonTeamRow side="left" />
          <div className="flex items-center justify-center">
            <SkeletonBox className="h-8 w-24" />
          </div>
          <SkeletonTeamRow side="right" />
        </div>
        {/* Desktop (≥sm): horizontal grid */}
        <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
          <SkeletonTeamRow side="left" />
          <SkeletonBox className="h-12 w-20" />
          <SkeletonTeamRow side="right" />
        </div>
      </div>
    </div>
  );
}

function SkeletonTeamRow({ side }: { side: 'left' | 'right' }) {
  const justify = side === 'right' ? 'justify-end' : '';
  const dot = <div className="w-2 h-2 rounded-full bg-gray-200 shrink-0" />;
  return (
    <div className={`space-y-1.5 ${side === 'right' ? 'text-right' : ''}`}>
      <div className={`flex items-center gap-2 ${justify}`}>
        {side === 'left' && dot}
        <SkeletonText className="w-32 max-w-full" />
        {side === 'right' && dot}
      </div>
      <div className={`flex items-center gap-2 ${justify}`}>
        {side === 'left' && dot}
        <SkeletonText className="w-28 max-w-full" />
        {side === 'right' && dot}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/skeletons.tsx
git commit -m "feat(skeletons): shared primitives — Box, Text, Hero, MatchCard"
```

---

## Task 2: Fallback `(public)/loading.tsx`

**Files:**
- Create: `src/app/(public)/loading.tsx`

This generic skeleton is the cascading fallback for any public route that doesn't have its own `loading.tsx`. In practice it serves the home page (`/`) and info (`/info`) — both use the **tall** hero variant, hence `tall={true}`.

- [ ] **Step 1: Create the file**

Create `src/app/(public)/loading.tsx`:

```tsx
import { SkeletonHero, SkeletonBox } from '@/components/shared/skeletons';

export default function PublicLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando" className="space-y-6">
      <SkeletonHero tall />
      <SkeletonBox className="h-32" />
      <SkeletonBox className="h-32" />
      <SkeletonBox className="h-32" />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/(public)/loading.tsx
git commit -m "feat(loading): generic public route fallback"
```

---

## Task 3: Rankings `loading.tsx`

**Files:**
- Create: `src/app/(public)/rankings/loading.tsx`

Mimics: hero + podio (3 cards: silver, gold taller, bronze) + tabla (8 rows).

- [ ] **Step 1: Create the file**

```tsx
import { SkeletonHero, SkeletonText } from '@/components/shared/skeletons';

export default function RankingsLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando ranking" className="space-y-8">
      <SkeletonHero />

      {/* Podium */}
      <div className="space-y-3">
        <div className="flex justify-center">
          <SkeletonText className="w-12 h-3" />
        </div>
        <div className="flex items-end justify-center gap-2 sm:gap-3 md:gap-6">
          {/* Silver */}
          <div className="flex-1 max-w-[185px] min-w-0 bg-gradient-to-b from-slate-200 via-slate-300 to-slate-500 rounded-2xl px-3 sm:px-4 pt-4 sm:pt-5 pb-0 shadow-xl flex flex-col items-center gap-1.5 sm:gap-2">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/40" />
            <div className="animate-pulse bg-white/50 rounded h-3 w-16" />
            <div className="animate-pulse bg-white/50 rounded h-7 w-12" />
            <div className="w-full h-8 bg-slate-600 rounded-b-xl" />
          </div>
          {/* Gold (taller) */}
          <div className="flex-1 max-w-[215px] min-w-0 -mb-3 bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 rounded-2xl px-3 sm:px-5 pt-5 sm:pt-7 pb-0 shadow-2xl flex flex-col items-center gap-1.5 sm:gap-2 ring-2 ring-amber-400/40">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/40" />
            <div className="animate-pulse bg-amber-900/30 rounded h-4 w-20" />
            <div className="animate-pulse bg-amber-900/30 rounded h-8 w-14" />
            <div className="w-full h-10 bg-amber-700 rounded-b-xl" />
          </div>
          {/* Bronze */}
          <div className="flex-1 max-w-[165px] min-w-0 mt-6 sm:mt-8 bg-gradient-to-b from-orange-200 via-orange-400 to-orange-600 rounded-2xl px-3 sm:px-4 pt-3 sm:pt-4 pb-0 shadow-xl flex flex-col items-center gap-1 sm:gap-1.5">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/40" />
            <div className="animate-pulse bg-orange-900/30 rounded h-3 w-14" />
            <div className="animate-pulse bg-orange-900/30 rounded h-6 w-10" />
            <div className="w-full h-7 bg-orange-700 rounded-b-xl" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-md overflow-hidden border-0">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b">
          <SkeletonText className="w-48 h-3" />
        </div>
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 sm:px-6 py-3">
              <SkeletonText className="w-4 h-4 shrink-0" />
              <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse shrink-0" />
              <SkeletonText className="flex-1 max-w-32" />
              <SkeletonText className="w-12 h-5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/(public)/rankings/loading.tsx
git commit -m "feat(loading): rankings — hero + podium + table skeleton"
```

---

## Task 4: Rankings/pairs `loading.tsx`

**Files:**
- Create: `src/app/(public)/rankings/pairs/loading.tsx`

Mimics: hero + 3 pair cards in grid + table (6 rows).

- [ ] **Step 1: Create the file**

```tsx
import { SkeletonHero, SkeletonText } from '@/components/shared/skeletons';

export default function PairsLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando parejas" className="space-y-8">
      <SkeletonHero />

      {/* Top-3 cards */}
      <div className="space-y-3">
        <div className="flex justify-center">
          <SkeletonText className="w-32 h-3" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-md space-y-3">
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
                <div className="text-right space-y-1">
                  <div className="animate-pulse bg-gray-200 rounded h-7 w-14" />
                  <div className="animate-pulse bg-gray-200 rounded h-3 w-16" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse shrink-0" />
                  <SkeletonText className="w-24" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse shrink-0" />
                  <SkeletonText className="w-28" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-1 sm:gap-2 pt-3 border-t border-black/5">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="text-center min-w-0 space-y-1">
                    <div className="animate-pulse bg-gray-200 rounded h-5 w-8 mx-auto" />
                    <div className="animate-pulse bg-gray-200 rounded h-3 w-12 mx-auto" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-md overflow-hidden border-0">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b">
          <SkeletonText className="w-48 h-3" />
        </div>
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 sm:px-6 py-3">
              <SkeletonText className="w-4 h-4 shrink-0" />
              <div className="flex-1 space-y-1 min-w-0">
                <SkeletonText className="w-24" />
                <SkeletonText className="w-28" />
              </div>
              <SkeletonText className="w-12 h-5" />
              <SkeletonText className="w-10 h-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/(public)/rankings/pairs/loading.tsx
git commit -m "feat(loading): rankings/pairs — hero + 3 pair cards + table skeleton"
```

---

## Task 5: Matches `loading.tsx`

**Files:**
- Create: `src/app/(public)/matches/loading.tsx`

Mimics: hero + 4 stacked match cards.

- [ ] **Step 1: Create the file**

```tsx
import { SkeletonHero, SkeletonMatchCard } from '@/components/shared/skeletons';

export default function MatchesLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando partidos" className="space-y-8">
      <SkeletonHero />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonMatchCard key={i} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/(public)/matches/loading.tsx
git commit -m "feat(loading): matches — hero + 4 match cards skeleton"
```

---

## Task 6: Match detail `loading.tsx`

**Files:**
- Create: `src/app/(public)/matches/[id]/loading.tsx`

Mimics: tall hero with stacked match content + 2 secondary blocks for recommender / pair history.

- [ ] **Step 1: Create the file**

```tsx
import { SkeletonBox, SkeletonText } from '@/components/shared/skeletons';

export default function MatchDetailLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando detalle de partido" className="space-y-8">
      {/* Custom hero — tall green block with breadcrumb + 2 teams + score */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 text-white shadow-2xl">
        <div className="relative p-5 sm:p-8 md:p-10 space-y-4 sm:space-y-6">
          {/* Breadcrumb */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="animate-pulse bg-green-800/50 rounded h-4 w-20" />
              <div className="animate-pulse bg-green-800/50 rounded h-4 w-24" />
            </div>
            <div className="self-start sm:ml-auto animate-pulse bg-green-800/50 rounded-full h-6 w-28" />
          </div>

          {/* Mobile stacked */}
          <div className="sm:hidden space-y-4">
            <div className="space-y-1">
              <div className="animate-pulse bg-green-800/50 rounded h-5 w-32" />
              <div className="animate-pulse bg-green-800/50 rounded h-5 w-28" />
            </div>
            <div className="flex items-center justify-center gap-3">
              <div className="animate-pulse bg-green-800/50 rounded h-10 w-8" />
              <div className="animate-pulse bg-green-800/50 rounded h-6 w-3" />
              <div className="animate-pulse bg-green-800/50 rounded h-10 w-8" />
            </div>
            <div className="space-y-1">
              <div className="animate-pulse bg-green-800/50 rounded h-5 w-32" />
              <div className="animate-pulse bg-green-800/50 rounded h-5 w-28" />
            </div>
          </div>

          {/* Desktop horizontal */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-6 items-center">
            <div className="space-y-2">
              <div className="animate-pulse bg-green-800/50 rounded h-6 w-40" />
              <div className="animate-pulse bg-green-800/50 rounded h-6 w-36" />
            </div>
            <div className="flex items-center gap-3">
              <div className="animate-pulse bg-green-800/50 rounded h-12 w-10" />
              <div className="animate-pulse bg-green-800/50 rounded h-6 w-3" />
              <div className="animate-pulse bg-green-800/50 rounded h-12 w-10" />
            </div>
            <div className="space-y-2 text-right">
              <div className="animate-pulse bg-green-800/50 rounded h-6 w-40 ml-auto" />
              <div className="animate-pulse bg-green-800/50 rounded h-6 w-36 ml-auto" />
            </div>
          </div>
        </div>
      </div>

      {/* Secondary section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <SkeletonText className="w-48 h-5" />
        </div>
        <SkeletonBox className="h-40" />
        <SkeletonBox className="h-40" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/(public)/matches/[id]/loading.tsx
git commit -m "feat(loading): match detail — stacked hero + secondary blocks skeleton"
```

---

## Task 7: Player profile `loading.tsx`

**Files:**
- Create: `src/app/(public)/players/[id]/loading.tsx`

Mimics: tall hero with avatar + name + badges + 2x2 stats → win rate bar → recent form → chart placeholder → match history.

- [ ] **Step 1: Create the file**

```tsx
import { SkeletonBox, SkeletonText } from '@/components/shared/skeletons';

export default function PlayerLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando perfil de jugador" className="space-y-6">
      {/* Profile header — green gradient with stacked avatar+info on mobile */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 text-white shadow-2xl">
        <div className="relative p-5 sm:p-8 md:p-10">
          <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 sm:gap-6">
            {/* Avatar */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/20 border-2 border-white/30 shrink-0" />
            {/* Info */}
            <div className="flex-1 min-w-0 w-full space-y-2">
              <div className="animate-pulse bg-green-800/50 rounded h-7 sm:h-9 md:h-10 w-3/4 mx-auto sm:mx-0" />
              <div className="animate-pulse bg-green-800/50 rounded h-4 w-1/3 mx-auto sm:mx-0" />
              <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                <div className="animate-pulse bg-green-800/50 rounded-full h-6 w-24" />
                <div className="animate-pulse bg-green-800/50 rounded-full h-6 w-32" />
              </div>
            </div>
          </div>

          {/* Stats row 2x2 / 4 cols */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/10">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="text-center space-y-1">
                <div className="animate-pulse bg-green-800/50 rounded h-8 sm:h-9 md:h-10 w-12 mx-auto" />
                <div className="animate-pulse bg-green-800/50 rounded h-3 w-16 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Win rate bar */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
        <div className="flex justify-between items-center">
          <SkeletonText className="w-20 h-4" />
          <SkeletonText className="w-12 h-6" />
        </div>
        <SkeletonBox className="h-3" />
      </div>

      {/* Recent form */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <SkeletonText className="w-32 h-3" />
        <div className="flex gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-xl bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>

      {/* Elo chart */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between">
          <SkeletonText className="w-40 h-4" />
          <SkeletonText className="w-24 h-4" />
        </div>
        <SkeletonBox className="h-48" />
      </div>

      {/* Match history */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <SkeletonText className="w-40 h-3" />
        </div>
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-gray-200 animate-pulse shrink-0" />
                <SkeletonText className="w-16 h-3 shrink-0" />
              </div>
              <SkeletonText className="w-32 max-w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/(public)/players/[id]/loading.tsx
git commit -m "feat(loading): player profile — header + stats + chart + history skeleton"
```

---

## Task 8: Final verification

**Files:** none modified (visual sweep + final triple check).

- [ ] **Step 1: Triple check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean. 23 tests pass.

- [ ] **Step 2: Visual sweep with Network throttling**

Run: `npm run dev` (in foreground, Ctrl+C to stop after).

In Chrome DevTools:
1. Open the dev server URL (typically `http://localhost:3000`).
2. Switch to mobile mode (iPhone SE 375x667 is fine).
3. Network tab → throttle to "Slow 3G".
4. Click each public route in turn (Inicio → Ranking → Parejas → Partidos → click a player → click a match → Info).

For each transition, confirm:
- The skeleton appears **at the moment of click** (no white flash, no frozen state).
- The skeleton silhouette approximately matches the page that loads after.
- The animation `animate-pulse` is visibly active.
- When the real content arrives, there is no big visual jump (heights/widths are similar).

Stop the dev server when done.

- [ ] **Step 3: No commit needed unless something broke**

If the visual sweep uncovered an issue (e.g. a skeleton with wrong dimensions causing a noticeable jump), fix it and commit:

```bash
git add <fixed file>
git commit -m "fix(loading): adjust <which skeleton> to match real layout"
```

If the sweep was clean, skip this step.

---

## Summary of files

**Created (7):**
- `src/components/shared/skeletons.tsx`
- `src/app/(public)/loading.tsx`
- `src/app/(public)/rankings/loading.tsx`
- `src/app/(public)/rankings/pairs/loading.tsx`
- `src/app/(public)/matches/loading.tsx`
- `src/app/(public)/matches/[id]/loading.tsx`
- `src/app/(public)/players/[id]/loading.tsx`

**Modified:** none.

**Untouched:** `/info` (static), `/login` (instant), `/admin/*` (out of scope), all data/logic/schema.
