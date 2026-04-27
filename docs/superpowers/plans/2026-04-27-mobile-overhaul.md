# Mobile UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the mobile experience of Lomeros Padel Tour — restore navigation on phones, eliminate layout overflows on every public/admin page, raise tap targets, and add the missing viewport meta — while extracting the duplicated `MatchCard` and `Podium` blocks into shared components.

**Architecture:** Bottom tab bar fixed at the bottom on `<md`, paired with a slimmed-down top navbar. Mobile-first responsive cleanup applied per page following a uniform hero-padding/font scale. Two new shared components (`<MatchCard>`, `<Podium>`) replace duplication in 4+ places.

**Tech Stack:** Next.js 16, React 19, Tailwind v4 (no `tailwind.config.js` — uses `@theme` in `globals.css`), Drizzle ORM, shadcn/ui. `html { font-size: 18px; }` is already set in `globals.css` so `1rem = 18px`.

**Verification model:** No automated test infrastructure exists in this repo. Verification is **manual visual** in Chrome DevTools mobile mode at four viewports (iPhone SE 375px, iPhone 14 Pro 393px, Pixel 7 412px, iPad mini 768px). Every visual task ends with a "verify in dev server" step before commit.

**Background reading before starting:** `AGENTS.md` warns that Next 16 has breaking changes from earlier versions — when in doubt about a Next-specific API (e.g. `viewport` export), read `node_modules/next/dist/docs/` rather than rely on training data.

---

## Reference: spec

Full design at `docs/superpowers/specs/2026-04-27-mobile-overhaul-design.md`. Read it before Task 1 — every task references sections (§1, §2, §3.x) of that doc.

---

## Pre-flight

- [ ] **Step 0a: Install dependencies (if not done)**

Run: `npm install`
Expected: clean install, no errors.

- [ ] **Step 0b: Verify dev server starts**

Run: `npm run dev`
Expected: server up at `http://localhost:3000`. Open in browser, confirm home renders. Stop the server (Ctrl+C) — we'll restart it as needed.

- [ ] **Step 0c: Set up DevTools profile**

In Chrome: open DevTools → toggle device toolbar (Cmd+Shift+M). Add custom devices for "iPhone SE (375x667)", "iPhone 14 Pro (393x852)", "Pixel 7 (412x915)", "iPad mini (768x1024)" if not already there. We'll cycle through these for visual verification.

---

## Task 1: Foundations — viewport, globals.css, public layout padding

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/(public)/layout.tsx`

References spec §1.

- [ ] **Step 1: Add viewport export in root layout**

Modify `src/app/layout.tsx`. Add `Viewport` type import and `viewport` export above the existing `metadata` export.

```tsx
import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Lomeros Padel Tour",
  description: "El ranking oficial del grupo Lomeros · LPT",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#052e16",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Patch globals.css — iOS rules**

Modify `src/app/globals.css`. Inside the `@layer base { ... }` block (currently ends at line 130 with `}`), add the two new rules to `html` and a new `input/select/textarea` rule.

Replace the existing `html` rule:
```css
  html {
    @apply font-sans;
    font-size: 18px;
  }
```

with:
```css
  html {
    @apply font-sans;
    font-size: 18px;
    -webkit-text-size-adjust: 100%;
  }
  input,
  select,
  textarea {
    font-size: max(16px, 1rem);
  }
```

(Note: `1rem = 18px` here, so `max(16px, 18px) = 18px` — the rule is defensive in case the root font-size ever changes.)

- [ ] **Step 3: Add bottom padding to public layout**

Modify `src/app/(public)/layout.tsx`. Replace the entire file with:

```tsx
import { Navbar } from '@/components/shared/navbar';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#f0fdf4 0%,#dcfce7 45%,#f0fdf4 80%,#ecfdf5 100%)' }}>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 pt-6 sm:pt-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
        {children}
      </main>
    </div>
  );
}
```

(BottomNav import will be added in Task 3 — keep this minimal change for now so the commit history reads clearly.)

- [ ] **Step 4: Visual verification**

Run: `npm run dev`. Open in Chrome at iPhone SE viewport. Confirm:
- The page no longer renders zoomed-out (text should be normal size, not tiny).
- There is extra blank space at the bottom of the page (~80px) — this is the reserved space for the future tab bar.
- No visual regression on iPad mini and desktop.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css src/app/(public)/layout.tsx
git commit -m "feat(mobile): viewport meta + iOS input zoom fix + reserved bottom-nav space"
```

---

## Task 2: Extract nav-links + tap-target tweaks in navbar

**Files:**
- Create: `src/components/shared/nav-links.ts`
- Modify: `src/components/shared/navbar.tsx`

References spec §2.

- [ ] **Step 1: Create the shared nav-links module**

Create `src/components/shared/nav-links.ts`:

```ts
export interface NavLink {
  href: string;
  label: string;
  icon: string;
}

export const navLinks: NavLink[] = [
  { href: '/', label: 'Inicio', icon: '🏠' },
  { href: '/rankings', label: 'Ranking', icon: '🏆' },
  { href: '/rankings/pairs', label: 'Parejas', icon: '👥' },
  { href: '/matches', label: 'Partidos', icon: '📋' },
  { href: '/info', label: 'Info', icon: 'ℹ️' },
];
```

- [ ] **Step 2: Refactor navbar to consume nav-links and improve tap targets**

Replace the entire content of `src/components/shared/navbar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { navLinks } from './nav-links';

export function Navbar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <nav className="bg-gradient-to-r from-green-950 via-green-900 to-green-950 text-white shadow-2xl sticky top-0 z-50 border-b border-green-800/50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-black text-xl tracking-tight hover:opacity-80 transition-opacity shrink-0">
          <span className="text-2xl">🎾</span>
          <span>LPT<span className="text-green-400 ml-1">·</span></span>
          <span className="hidden lg:block text-xs text-green-300 font-semibold uppercase tracking-widest">Lomeros Padel Tour</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200',
                pathname === link.href
                  ? 'bg-green-400/20 text-white border border-green-400/30 shadow-inner'
                  : 'text-green-200 hover:text-white hover:bg-white/10'
              )}
            >
              {link.icon} {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isAdmin ? (
            <>
              <Link
                href="/admin"
                className="inline-flex items-center min-h-[40px] px-3 rounded-full text-sm font-semibold bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/30 transition-all"
              >
                ⚙️ Admin
              </Link>
              <button
                onClick={handleLogout}
                className="inline-flex items-center min-h-[40px] px-3 rounded-full text-sm font-medium text-green-300 hover:text-white hover:bg-white/10 transition-all"
              >
                Salir
              </button>
            </>
          ) : (
            <Link href="/login">
              <button className="inline-flex items-center min-h-[40px] px-4 rounded-full text-sm font-semibold border border-green-600 text-green-300 hover:bg-green-800 hover:text-white transition-all">
                Admin
              </button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
```

Key changes from original:
- Imports `navLinks` from `./nav-links` (no inline duplication).
- Logo "LPT·" no longer hidden in `<sm` (removed `hidden sm:block`).
- All buttons get `min-h-[40px]` and `text-sm` instead of `text-xs`/`px-3 py-1.5`.

- [ ] **Step 3: Visual verification**

Run dev server. At iPhone SE: confirm logo "🎾 LPT·" is visible and the Admin button is finger-friendly (≥40px tall). At desktop: nav links visible as before, no regression.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/nav-links.ts src/components/shared/navbar.tsx
git commit -m "refactor(mobile): extract navLinks module, raise navbar tap targets"
```

---

## Task 3: BottomNav component + integrate into public layout

**Files:**
- Create: `src/components/shared/bottom-nav.tsx`
- Modify: `src/app/(public)/layout.tsx`

References spec §2.

- [ ] **Step 1: Create the BottomNav component**

Create `src/components/shared/bottom-nav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { navLinks } from './nav-links';

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-green-950/95 backdrop-blur border-t border-green-900/50 pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegación principal"
    >
      <ul className="grid grid-cols-5">
        {navLinks.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 min-h-14 py-1.5 transition-colors',
                  active
                    ? 'bg-green-400/15 text-white'
                    : 'text-green-300 hover:text-white'
                )}
              >
                <span className="text-xl leading-none" aria-hidden="true">
                  {link.icon}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide leading-none">
                  {link.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Add BottomNav to public layout**

Modify `src/app/(public)/layout.tsx`. Replace with:

```tsx
import { Navbar } from '@/components/shared/navbar';
import { BottomNav } from '@/components/shared/bottom-nav';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#f0fdf4 0%,#dcfce7 45%,#f0fdf4 80%,#ecfdf5 100%)' }}>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 pt-6 sm:pt-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 3: Visual verification — the critical fix**

Restart dev server. At iPhone SE viewport:
- Open `/`. Confirm bottom tab bar is visible with 5 icons (🏠 Inicio · 🏆 Ranking · 👥 Parejas · 📋 Partidos · ℹ️ Info), and the home tab is highlighted.
- Tap each tab — navigation works.
- Confirm the page content is not hidden behind the tab bar (the `pb-[calc(5rem+env(safe-area-inset-bottom))]` on `<main>` does the job).

At iPad mini and desktop: bottom bar is hidden (`md:hidden`).

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/bottom-nav.tsx src/app/(public)/layout.tsx
git commit -m "feat(mobile): add bottom tab bar for mobile navigation"
```

---

## Task 4: Extract Podium shared component

**Files:**
- Create: `src/components/shared/podium.tsx`
- Modify: `src/app/(public)/page.tsx` (replace inline podium)
- Modify: `src/app/(public)/rankings/page.tsx` (replace inline podium)

References spec §3.5.

- [ ] **Step 1: Define the Podium component**

Create `src/components/shared/podium.tsx`:

```tsx
import Link from 'next/link';

interface PodiumPlayer {
  id: string;
  name: string;
  nickname?: string | null;
  eloRating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
}

interface PodiumProps {
  /** Expected: at least 3 players (index 0 = gold, 1 = silver, 2 = bronze). Renders nothing if fewer. */
  players: PodiumPlayer[];
  /**
   * 'home' shows V/D pills inside each card (used on the homepage).
   * 'rankings' shows winrate% · matchesPlayed (used on the rankings page).
   */
  variant: 'home' | 'rankings';
}

export function Podium({ players, variant }: PodiumProps) {
  const [first, second, third] = players;
  if (!first || !second || !third) return null;
  const winRate = (p: PodiumPlayer) =>
    p.matchesPlayed > 0 ? Math.round((p.wins / p.matchesPlayed) * 100) : 0;

  const Footer = ({ p }: { p: PodiumPlayer }) =>
    variant === 'home' ? (
      <div className="text-xs flex gap-2 sm:gap-3 pb-3 font-semibold">
        <span>✅ {p.wins}V</span>
        <span>❌ {p.losses}D</span>
      </div>
    ) : (
      <p className="text-xs pb-3 font-semibold">
        {winRate(p)}% · {p.matchesPlayed}P
      </p>
    );

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-3 md:gap-6">
      {/* #2 Silver */}
      <Link href={`/players/${second.id}`} className="flex-1 max-w-[185px] min-w-0 group">
        <div className="bg-gradient-to-b from-slate-200 via-slate-300 to-slate-500 rounded-2xl px-3 sm:px-4 pt-4 sm:pt-5 pb-0 shadow-xl shadow-slate-300/40 flex flex-col items-center gap-1.5 sm:gap-2 group-hover:scale-105 transition-transform">
          <span className="text-2xl sm:text-3xl">🥈</span>
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/30 flex items-center justify-center text-xl sm:text-2xl font-black border-2 border-white/40">
            {second.name.charAt(0)}
          </div>
          <p className="font-black text-xs sm:text-sm text-center text-slate-900 leading-tight w-full truncate">{second.name}</p>
          {second.nickname && <p className="text-slate-600 text-xs truncate w-full text-center">{second.nickname}</p>}
          <p className="text-2xl sm:text-3xl font-black text-slate-800 tabular-nums">{Math.round(second.eloRating)}</p>
          <p className="text-slate-500 text-xs uppercase tracking-widest -mt-1">ELO</p>
          <div className="text-slate-700">
            <Footer p={second} />
          </div>
          <div className="w-full bg-slate-600 rounded-b-xl py-2 sm:py-2.5 text-center font-black text-lg sm:text-xl text-white">2</div>
        </div>
      </Link>

      {/* #1 Gold (taller) */}
      <Link href={`/players/${first.id}`} className="flex-1 max-w-[215px] min-w-0 group -mb-3">
        <div className="bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 rounded-2xl px-3 sm:px-5 pt-5 sm:pt-7 pb-0 shadow-2xl shadow-amber-300/50 flex flex-col items-center gap-1.5 sm:gap-2 ring-2 ring-amber-400/40 group-hover:scale-105 transition-transform">
          <span className="text-4xl sm:text-5xl drop-shadow-lg">👑</span>
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/30 flex items-center justify-center text-2xl sm:text-3xl font-black border-2 border-white/50">
            {first.name.charAt(0)}
          </div>
          <p className="font-black text-sm sm:text-base text-center text-amber-950 leading-tight w-full truncate">{first.name}</p>
          {first.nickname && <p className="text-amber-800 text-xs truncate w-full text-center">{first.nickname}</p>}
          <p className="text-3xl sm:text-4xl font-black text-amber-950 tabular-nums">{Math.round(first.eloRating)}</p>
          <p className="text-amber-700 text-xs uppercase tracking-widest -mt-1">ELO</p>
          <div className="text-amber-900">
            <Footer p={first} />
          </div>
          <div className="w-full bg-amber-700 rounded-b-xl py-2.5 sm:py-3 text-center font-black text-xl sm:text-2xl text-white">1</div>
        </div>
      </Link>

      {/* #3 Bronze */}
      <Link href={`/players/${third.id}`} className="flex-1 max-w-[165px] min-w-0 group">
        <div className="bg-gradient-to-b from-orange-200 via-orange-400 to-orange-600 rounded-2xl px-3 sm:px-4 pt-3 sm:pt-4 pb-0 shadow-xl shadow-orange-200/40 flex flex-col items-center gap-1 sm:gap-1.5 group-hover:scale-105 transition-transform mt-6 sm:mt-8">
          <span className="text-xl sm:text-2xl">🥉</span>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/25 flex items-center justify-center text-lg sm:text-xl font-black border-2 border-white/30">
            {third.name.charAt(0)}
          </div>
          <p className="font-black text-xs sm:text-sm text-center text-orange-950 leading-tight w-full truncate">{third.name}</p>
          {third.nickname && <p className="text-orange-700 text-xs truncate w-full text-center">{third.nickname}</p>}
          <p className="text-xl sm:text-2xl font-black text-orange-950 tabular-nums">{Math.round(third.eloRating)}</p>
          <p className="text-orange-700 text-xs uppercase tracking-widest -mt-1">ELO</p>
          <div className="text-orange-900">
            <Footer p={third} />
          </div>
          <div className="w-full bg-orange-700 rounded-b-xl py-1.5 sm:py-2 text-center font-black text-lg sm:text-xl text-white">3</div>
        </div>
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Replace inline podium in rankings page**

In `src/app/(public)/rankings/page.tsx`, locate the block that starts with `{/* Podium top 3 */}` and ends with the closing `</div>` of `top3.length >= 3 && (...)` (lines ~52-97 of the current file, the entire `<div className="flex items-end justify-center gap-3 md:gap-6">...</div>` plus its `space-y-3` wrapper). Replace it with:

```tsx
          {top3.length >= 3 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center">Podio</p>
              <Podium players={top3} variant="rankings" />
            </div>
          )}
```

Add at the top of the file (with the other imports):
```tsx
import { Podium } from '@/components/shared/podium';
```

- [ ] **Step 3: Replace inline podium in home page**

In `src/app/(public)/page.tsx`, locate the block that starts with `{topPlayers.length >= 3 ? (` (around line 81) and ends with the matching `) : (` (around line 140). Replace the whole `topPlayers.length >= 3 ? (...)` branch with a call to `<Podium>`:

```tsx
          {topPlayers.length >= 3 ? (
            <Podium players={topPlayers} variant="home" />
          ) : (
            // ... keep the existing else branch (the `<div className="grid gap-3">...</div>` for <3 players)
          )}
```

Add at the top:
```tsx
import { Podium } from '@/components/shared/podium';
```

Keep the existing `<` 3 players fallback (the small grid of player cards) untouched.

- [ ] **Step 4: Visual verification**

At iPhone SE: open `/` and `/rankings`. Confirm the podium renders with 3 cards side-by-side, names readable (truncated only when truly too long), ELO numbers don't overflow. Compare to desktop — silhouette should be the same shape, just smaller.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/podium.tsx src/app/(public)/rankings/page.tsx src/app/(public)/page.tsx
git commit -m "refactor(mobile): extract <Podium /> with mobile-first sizing"
```

---

## Task 5: Extract MatchCard shared component

**Files:**
- Create: `src/components/shared/match-card.tsx`

This task only creates the component — Task 6 swaps in the consumers. Splitting them keeps each commit reviewable in isolation.

References spec §3.2.

- [ ] **Step 1: Read the existing card markup for reference**

Open these to confirm the current shape before extracting:
- `src/app/(public)/page.tsx` (recent matches, completed card variant)
- `src/app/(public)/matches/page.tsx` (upcoming and completed variants)

The `<MatchCard>` must support both upcoming (no sets, "Pendiente" badge) and completed (sets + winner badge) shapes.

- [ ] **Step 2: Create the component**

Create `src/components/shared/match-card.tsx`:

```tsx
import Link from 'next/link';

interface MatchPlayer {
  id: string;
  name: string;
  nickname?: string | null;
}

interface MatchSet {
  setNumber: number;
  team1Games: number;
  team2Games: number;
}

export interface MatchCardData {
  id: string;
  date: string;
  location?: string | null;
  status: string;            // 'scheduled' | 'completed' — stored as text in the DB schema
  winnerTeam?: number | null;
}

interface MatchCardProps {
  match: MatchCardData;
  team1: [MatchPlayer | undefined, MatchPlayer | undefined];
  team2: [MatchPlayer | undefined, MatchPlayer | undefined];
  sets?: MatchSet[];
  href?: string;
}

export function MatchCard({ match, team1, team2, sets = [], href }: MatchCardProps) {
  const isUpcoming = match.status === 'scheduled';
  const t1Sets = sets.filter((s) => s.team1Games > s.team2Games).length;
  const t2Sets = sets.filter((s) => s.team2Games > s.team1Games).length;
  const w1 = match.winnerTeam === 1;
  const w2 = match.winnerTeam === 2;

  const headerColors = isUpcoming
    ? 'bg-blue-50/80 border-blue-100 text-blue-700'
    : 'bg-gray-50/80 border-gray-100 text-gray-400';
  const cardBorder = isUpcoming ? 'border-blue-100 hover:border-blue-200' : 'border-gray-100';

  const card = (
    <div className={`bg-white rounded-2xl shadow-md border ${cardBorder} overflow-hidden hover:shadow-lg transition-all`}>
      {/* Header strip: date + location */}
      <div className={`px-4 sm:px-5 py-2.5 border-b flex justify-between items-center text-xs font-semibold ${headerColors}`}>
        <span>📅 {match.date}</span>
        {match.location && <span>📍 {match.location}</span>}
      </div>

      {/* Mobile (<sm): stacked layout. ≥sm: horizontal grid. */}
      <div className="p-4 sm:p-6">
        {/* Mobile stacked */}
        <div className="sm:hidden space-y-3">
          {/* Team 1 */}
          <TeamRow players={team1} winner={w1} loser={w2} align="left" upcoming={isUpcoming} />
          {/* Score / VS */}
          <div className="flex items-center justify-center gap-3">
            {isUpcoming ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-xl font-black text-blue-500">VS</span>
                <span className="text-[10px] font-bold text-blue-400 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 uppercase tracking-wide">
                  Pendiente
                </span>
              </div>
            ) : (
              <ScoreBlock t1Sets={t1Sets} t2Sets={t2Sets} sets={sets} winner1={w1} winner2={w2} compact />
            )}
          </div>
          {/* Team 2 */}
          <TeamRow players={team2} winner={w2} loser={w1} align="right" upcoming={isUpcoming} />
        </div>

        {/* ≥sm horizontal */}
        <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
          {/* Team 1 */}
          <div className={w2 ? 'opacity-35' : ''}>
            <div className="space-y-2">
              {team1.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isUpcoming ? 'bg-blue-300' : w1 ? 'bg-green-500' : 'bg-gray-200'}`} />
                  <p className={`font-bold truncate ${w1 ? 'text-green-700' : 'text-gray-700'}`}>{p?.name ?? '?'}</p>
                </div>
              ))}
              {w1 && (
                <span className="inline-flex items-center gap-1 text-xs font-black text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                  ✓ GANADOR
                </span>
              )}
            </div>
          </div>

          {/* Score / VS */}
          <div className="flex flex-col items-center gap-2 min-w-[80px]">
            {isUpcoming ? (
              <>
                <span className="text-2xl font-black text-blue-500">VS</span>
                <span className="text-xs font-bold text-blue-400 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">Pendiente</span>
              </>
            ) : (
              <ScoreBlock t1Sets={t1Sets} t2Sets={t2Sets} sets={sets} winner1={w1} winner2={w2} compact={false} />
            )}
          </div>

          {/* Team 2 */}
          <div className={`text-right ${w1 ? 'opacity-35' : ''}`}>
            <div className="space-y-2">
              {team2.map((p, i) => (
                <div key={i} className="flex items-center justify-end gap-2">
                  <p className={`font-bold truncate ${w2 ? 'text-green-700' : 'text-gray-700'}`}>{p?.name ?? '?'}</p>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isUpcoming ? 'bg-red-300' : w2 ? 'bg-green-500' : 'bg-gray-200'}`} />
                </div>
              ))}
              {w2 && (
                <div className="flex justify-end">
                  <span className="inline-flex items-center gap-1 text-xs font-black text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                    ✓ GANADOR
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

function TeamRow({
  players,
  winner,
  loser,
  align,
  upcoming,
}: {
  players: [MatchPlayer | undefined, MatchPlayer | undefined];
  winner: boolean;
  loser: boolean;
  align: 'left' | 'right';
  upcoming: boolean;
}) {
  const dotColor = upcoming
    ? align === 'left'
      ? 'bg-blue-300'
      : 'bg-red-300'
    : winner
      ? 'bg-green-500'
      : 'bg-gray-200';
  return (
    <div className={`${loser ? 'opacity-35' : ''}`}>
      <div className={`space-y-1.5 ${align === 'right' ? 'text-right' : ''}`}>
        {players.map((p, i) => (
          <div key={i} className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
            {align === 'left' && <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />}
            <p className={`font-bold truncate ${winner ? 'text-green-700' : 'text-gray-700'}`}>{p?.name ?? '?'}</p>
            {align === 'right' && <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />}
          </div>
        ))}
        {winner && (
          <div className={align === 'right' ? 'flex justify-end' : ''}>
            <span className="inline-flex items-center gap-1 text-xs font-black text-green-600 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
              ✓ GANADOR
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreBlock({
  t1Sets,
  t2Sets,
  sets,
  winner1,
  winner2,
  compact,
}: {
  t1Sets: number;
  t2Sets: number;
  sets: MatchSet[];
  winner1: boolean;
  winner2: boolean;
  compact: boolean;
}) {
  return (
    <div className={`flex flex-col items-center ${compact ? 'gap-1.5' : 'gap-3'}`}>
      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-1 sm:px-4 sm:py-2">
        <span className={`${compact ? 'text-xl' : 'text-2xl'} font-black tabular-nums ${winner1 ? 'text-green-600' : 'text-gray-300'}`}>
          {t1Sets}
        </span>
        <span className="text-gray-200 font-black">—</span>
        <span className={`${compact ? 'text-xl' : 'text-2xl'} font-black tabular-nums ${winner2 ? 'text-green-600' : 'text-gray-300'}`}>
          {t2Sets}
        </span>
      </div>
      {sets.length > 0 && (
        <div className={`flex ${compact ? 'gap-1.5' : 'gap-2'}`}>
          {sets.map((s) => (
            <div key={s.setNumber} className="flex flex-col items-center">
              <span className="text-[10px] text-gray-300 mb-0.5">S{s.setNumber}</span>
              <div className="flex items-center gap-1 font-mono text-xs sm:text-sm bg-white border border-gray-100 rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-1 shadow-sm">
                <span className={s.team1Games > s.team2Games ? 'font-black text-gray-800' : 'text-gray-300'}>{s.team1Games}</span>
                <span className="text-gray-200 text-[10px]">–</span>
                <span className={s.team2Games > s.team1Games ? 'font-black text-gray-800' : 'text-gray-300'}>{s.team2Games}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Confirm it compiles**

Run: `npm run build` (or just leave dev server running and check there are no TS errors in the terminal).
Expected: Clean build. The new component is unused so this is purely a typecheck.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/match-card.tsx
git commit -m "feat(mobile): add <MatchCard /> shared component with stacked mobile layout"
```

---

## Task 6: Use MatchCard in home + matches list

**Files:**
- Modify: `src/app/(public)/page.tsx`
- Modify: `src/app/(public)/matches/page.tsx`

References spec §3.2, §3.3.

- [ ] **Step 1: Wire MatchCard into home page (recent + upcoming matches)**

In `src/app/(public)/page.tsx`:

Add import:
```tsx
import { MatchCard } from '@/components/shared/match-card';
```

Replace the **upcoming matches grid block** (the `<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">...</div>` inside the upcoming section) with:

```tsx
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                team1={[playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]]}
                team2={[playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]]}
                href={`/matches/${match.id}`}
              />
            ))}
          </div>
```

Replace the **recent matches grid block** (the `<div className="grid md:grid-cols-2 gap-4">...</div>` inside the recent section) with:

```tsx
          <div className="grid md:grid-cols-2 gap-4">
            {recentMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                team1={[playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]]}
                team2={[playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]]}
                sets={setsMap[match.id] ?? []}
              />
            ))}
          </div>
```

(Note: the recent block intentionally has no `href` — current code shows the card without a link. Keep that behaviour.)

- [ ] **Step 2: Wire MatchCard into matches list page**

In `src/app/(public)/matches/page.tsx`:

Add import:
```tsx
import { MatchCard } from '@/components/shared/match-card';
```

Replace the **upcoming section's `.map(...)` block** (the entire `<Link key={match.id} href={`/matches/${match.id}`} className="block">...</Link>` rendered inside `upcoming.map(...)`) with:

```tsx
              {upcoming.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  team1={[playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]]}
                  team2={[playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]]}
                  href={`/matches/${match.id}`}
                />
              ))}
```

Replace the **completed section's `.map(...)` block** with:

```tsx
              {completed.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  team1={[playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]]}
                  team2={[playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]]}
                  sets={setsMap[match.id] ?? []}
                  href={`/matches/${match.id}`}
                />
              ))}
```

- [ ] **Step 3: Visual verification**

At iPhone SE: open `/` and `/matches`. Confirm:
- Match cards in the lists are vertical-stacked: team 1 → score → team 2.
- Player names no longer truncate to 2-3 letters.
- The score block in the middle is visually obvious and centered.

At iPad mini: cards switch to horizontal layout — looks like the original.

- [ ] **Step 4: Commit**

```bash
git add src/app/(public)/page.tsx src/app/(public)/matches/page.tsx
git commit -m "refactor(mobile): use <MatchCard /> in home and matches list"
```

---

## Task 7: Apply the hero pattern to all green-gradient page headers

**Files:**
- Modify: `src/app/(public)/rankings/page.tsx`
- Modify: `src/app/(public)/matches/page.tsx`
- Modify: `src/app/(public)/rankings/pairs/page.tsx`
- Modify: `src/app/(public)/info/page.tsx`
- Modify: `src/app/(public)/page.tsx` (home hero)

References spec §3.1, §3.3.

The pattern (apply per file as listed):

| Old | New |
|---|---|
| `p-8` | `p-5 sm:p-7 md:p-10` |
| `rounded-2xl` (heroes) | `rounded-xl sm:rounded-2xl` |
| `rounded-3xl` (heroes) | `rounded-2xl sm:rounded-3xl` |
| `text-4xl` (h1) | `text-2xl sm:text-3xl md:text-4xl` |

- [ ] **Step 1: Rankings hero**

In `src/app/(public)/rankings/page.tsx`, replace the hero `<div>`:
```tsx
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-r from-green-950 to-emerald-900 p-5 sm:p-7 md:p-10 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(74,222,128,0.08)_0%,transparent_70%)]" />
        <div className="relative">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">🏆 CLASIFICACIÓN</h1>
          <p className="text-green-200 mt-1 font-medium text-sm sm:text-base">Ranking individual ordenado por Elo · {ranked.length} jugadores clasificados</p>
        </div>
      </div>
```

- [ ] **Step 2: Matches hero**

In `src/app/(public)/matches/page.tsx`, replace the hero `<div>`:
```tsx
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-r from-green-950 to-emerald-900 p-5 sm:p-7 md:p-10 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(74,222,128,0.08)_0%,transparent_70%)]" />
        <div className="relative flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">⚡ PARTIDOS</h1>
            <p className="text-green-200 mt-1 font-medium text-sm sm:text-base">
              {completed.length} resultado{completed.length !== 1 ? 's' : ''}
              {upcoming.length > 0 && ` · ${upcoming.length} próximo${upcoming.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          {upcoming.length > 0 && (
            <span className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs sm:text-sm font-bold">
              📅 {upcoming.length} pendiente{upcoming.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
```

- [ ] **Step 3: Pairs hero**

In `src/app/(public)/rankings/pairs/page.tsx`, replace the hero `<div>`:
```tsx
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-r from-green-950 to-emerald-900 p-5 sm:p-7 md:p-10 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(74,222,128,0.08)_0%,transparent_70%)]" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-green-400/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
        <div className="relative">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">👥 RANKING PAREJAS</h1>
          <p className="text-green-200 mt-1 font-medium text-sm sm:text-base">Mejores combinaciones ordenadas por Elo de pareja</p>
        </div>
      </div>
```

- [ ] **Step 4: Info hero**

In `src/app/(public)/info/page.tsx`, replace the hero `<div>`:
```tsx
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(74,222,128,0.07)_0%,transparent_60%)]" />
        <div className="relative px-5 sm:px-8 md:px-12 py-10 sm:py-14 md:py-16 max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-6">
            <span>📖</span> Guía del torneo
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight mb-4">
            ¿CÓMO FUNCIONA?
          </h1>
          <p className="text-green-200 text-base sm:text-lg md:text-xl font-medium max-w-2xl">
            Todo lo que necesitas saber sobre el <strong className="text-white">Lomeros Padel Tour</strong> —
            el ranking oficial de nuestro grupo de amigos.
          </p>
        </div>
      </div>
```

- [ ] **Step 5: Home hero**

In `src/app/(public)/page.tsx`, replace the hero `<div>`:
```tsx
      {/* ── HERO ── */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 p-5 sm:p-8 md:p-14 text-white shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-green-400/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-400/10 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(74,222,128,0.07)_0%,transparent_60%)]" />
        <div className="relative text-center space-y-3">
          <div className="text-5xl sm:text-6xl md:text-8xl mb-2 drop-shadow-2xl">🎾</div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight">
            LOMEROS <span className="text-green-400">PADEL TOUR</span>
          </h1>
          <p className="text-green-200 text-sm sm:text-base md:text-lg font-medium tracking-widest uppercase">
            El ranking oficial del grupo · LPT
          </p>
          <div className="flex justify-center gap-4 sm:gap-6 md:gap-16 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/10">
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-5xl font-black text-green-400 tabular-nums">{totalMatches}</p>
              <p className="text-green-300 text-[10px] sm:text-xs md:text-sm mt-1 uppercase tracking-widest">Partidos</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-5xl font-black text-green-400 tabular-nums">{totalPlayers}</p>
              <p className="text-green-300 text-[10px] sm:text-xs md:text-sm mt-1 uppercase tracking-widest">Jugadores</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-5xl font-black text-green-400 tabular-nums">
                {topPlayers[0] ? Math.round(topPlayers[0].eloRating) : '—'}
              </p>
              <p className="text-green-300 text-[10px] sm:text-xs md:text-sm mt-1 uppercase tracking-widest">Elo #1</p>
            </div>
          </div>
        </div>
      </div>
```

(Also fixed: removed the `tracking-wide uppercase tracking-widest` typo in the original — the `tracking-wide` was overridden by `tracking-widest`, but the output had the redundant class. Cleaned up here.)

- [ ] **Step 6: Visual verification**

At iPhone SE: open each page (`/`, `/rankings`, `/matches`, `/rankings/pairs`, `/info`). Confirm:
- Hero title fits on one line (or wraps cleanly) without truncation.
- Padding is visibly tighter than before — content has more breathing room.
- Background gradient and glow effects still render.

At iPad mini and desktop: heroes look the same as before (responsive scale only kicks in `<md`).

- [ ] **Step 7: Commit**

```bash
git add src/app/(public)/rankings/page.tsx src/app/(public)/matches/page.tsx src/app/(public)/rankings/pairs/page.tsx src/app/(public)/info/page.tsx src/app/(public)/page.tsx
git commit -m "style(mobile): responsive padding/typography for green-gradient page headers"
```

---

## Task 8: Player profile page mobile pass

**Files:**
- Modify: `src/app/(public)/players/[id]/page.tsx`

References spec §3.8.

- [ ] **Step 1: Stack profile header on mobile**

In `src/app/(public)/players/[id]/page.tsx`, replace the **profile header `<div>` block** (the one that wraps the avatar+info+stats) — currently approximately lines 78-129. Replace with:

```tsx
      {/* ── PROFILE HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 text-white shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-green-400/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-emerald-400/10 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />
        <div className="relative p-5 sm:p-8 md:p-10">
          <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 sm:gap-6">
            {/* Avatar */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/10 border-2 border-white/20 flex items-center justify-center text-4xl sm:text-5xl font-black text-white shadow-xl shrink-0">
              {player.name.charAt(0)}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0 w-full">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight sm:truncate">{player.name}</h1>
              {player.nickname && (
                <p className="text-green-300 text-base sm:text-lg font-medium mt-0.5">&ldquo;{player.nickname}&rdquo;</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-bold">
                  ELO {Math.round(player.eloRating)}
                  <span className={`ml-1.5 text-xs font-black ${eloChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {eloChange >= 0 ? '+' : ''}{eloChange}
                  </span>
                </span>
                {streak.count > 1 && (
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${streak.type === 'W' ? 'bg-green-500/20 border border-green-400/40 text-green-300' : 'bg-red-500/20 border border-red-400/40 text-red-300'}`}>
                    {streak.type === 'W' ? '🔥' : '❄️'} Racha {streak.count} {streak.type === 'W' ? 'victorias' : 'derrotas'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats row — 2x2 on mobile, 4 cols ≥sm */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/10">
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-4xl font-black text-white tabular-nums">{Math.round(player.eloRating)}</p>
              <p className="text-green-300 text-xs uppercase tracking-widest mt-1">ELO</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-4xl font-black text-white tabular-nums">{player.matchesPlayed}</p>
              <p className="text-green-300 text-xs uppercase tracking-widest mt-1">Partidos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-4xl font-black text-green-400 tabular-nums">{player.wins}</p>
              <p className="text-green-300 text-xs uppercase tracking-widest mt-1">Victorias</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-3xl md:text-4xl font-black text-red-400 tabular-nums">{player.losses}</p>
              <p className="text-green-300 text-xs uppercase tracking-widest mt-1">Derrotas</p>
            </div>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Truncate match history rows**

In the same file, find the match history block (`{completedMatches.length > 0 && (...)`). Replace its inner row markup. Inside `.slice(0, 10).map((match) => { ... return (...)`, replace the returned `<div>` with:

```tsx
                <div key={match.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-sm shrink-0 ${won ? 'bg-gradient-to-br from-green-400 to-green-600' : 'bg-gradient-to-br from-red-400 to-red-500'}`}>
                      {won ? 'V' : 'D'}
                    </div>
                    <span className="text-xs text-gray-400 font-medium shrink-0">{match.date}</span>
                  </div>
                  <span className="text-sm text-gray-600 font-medium truncate text-right">
                    vs {opponents.map((p) => p?.name ?? '?').join(' & ')}
                  </span>
                </div>
```

Key changes: added `gap-3` on the row, `min-w-0` on the left flex group, `shrink-0` on the avatar/date, and `truncate text-right` on the opponents span. Reduced left padding to `px-4 sm:px-5`.

- [ ] **Step 3: Visual verification**

At iPhone SE: open `/players/<any-id>`. Confirm:
- Avatar centered above name, nickname below, badges below that — vertical stack.
- Stats row is 2x2 (ELO + Partidos top, Victorias + Derrotas bottom).
- Match history rows: long opponent names truncate with ellipsis instead of overflowing.

At desktop: layout looks like before (avatar to the left, stats in 4 columns).

- [ ] **Step 4: Commit**

```bash
git add src/app/(public)/players/[id]/page.tsx
git commit -m "style(mobile): stack player profile header and truncate match history rows"
```

---

## Task 9: Match detail page mobile pass

**Files:**
- Modify: `src/app/(public)/matches/[id]/page.tsx`

References spec §3.7.

**Note vs spec:** the spec mentioned reusing `<MatchCard variant="detail" />` here. In practice the visual differs too much (white card on listings vs. green-gradient hero with light text on this page) to share the component cleanly, so we keep the inline markup and just make it responsive in-place. The user-facing outcome is identical: stacked on mobile, horizontal on `≥sm`.

- [ ] **Step 1: Stack the breadcrumb + status badge on mobile**

In `src/app/(public)/matches/[id]/page.tsx`, replace the breadcrumb block at the top of the hero (the `<div className="flex items-center gap-3 mb-6">...</div>`):

```tsx
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-6">
            <div className="flex items-center gap-2 sm:gap-3 text-sm">
              <Link href="/matches" className="text-green-300 hover:text-white transition-colors font-medium">
                ← Partidos
              </Link>
              <span className="text-green-700">·</span>
              <span className="text-green-300">{match.date}</span>
              {match.location && <span className="text-green-400 hidden sm:inline">· 📍 {match.location}</span>}
            </div>
            {match.location && <span className="text-green-400 text-xs sm:hidden">📍 {match.location}</span>}
            <span className={`self-start sm:ml-auto px-3 py-1 rounded-full text-xs font-black ${
              match.status === 'scheduled'
                ? 'bg-blue-500/20 border border-blue-400/30 text-blue-200'
                : 'bg-green-500/20 border border-green-400/30 text-green-200'
            }`}>
              {match.status === 'scheduled' ? '📅 Programado' : '✅ Completado'}
            </span>
          </div>
```

- [ ] **Step 2: Stack the hero match block on mobile**

In the same file, replace the entire conditional block that renders `{match.status === 'completed' ? (...) : (...)}` (the dual-layout section that follows the breadcrumb) with a uniform stacked-on-mobile structure. Replace the outer wrapper `p-8 md:p-10` with `p-5 sm:p-8 md:p-10` (already partially correct, verify).

Replace the **completed branch** with:
```tsx
          {match.status === 'completed' ? (
            <>
              {/* Mobile stacked */}
              <div className="sm:hidden space-y-4">
                <div className={match.winnerTeam === 2 ? 'opacity-50' : ''}>
                  <div className="space-y-1">
                    {[t1p1, t1p2].map((p, i) => (
                      <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                        <p className={`text-lg font-black hover:text-green-300 transition-colors ${match.winnerTeam === 1 ? 'text-white' : 'text-green-200'}`}>
                          {p?.name ?? '?'}
                        </p>
                      </Link>
                    ))}
                    {match.winnerTeam === 1 && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-black text-green-300 bg-green-500/20 border border-green-400/30 rounded-full px-3 py-0.5 mt-1">
                        🏆 GANADOR
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <span className={`text-4xl font-black tabular-nums ${match.winnerTeam === 1 ? 'text-green-400' : 'text-white/30'}`}>{t1Sets}</span>
                  <span className="text-white/30 font-black text-xl">—</span>
                  <span className={`text-4xl font-black tabular-nums ${match.winnerTeam === 2 ? 'text-green-400' : 'text-white/30'}`}>{t2Sets}</span>
                </div>
                <div className="flex justify-center gap-2">
                  {sets.map((s) => (
                    <div key={s.setNumber} className="flex flex-col items-center">
                      <span className="text-green-400/60 text-[10px] mb-0.5">S{s.setNumber}</span>
                      <div className="flex items-center gap-1 font-mono text-xs bg-white/10 rounded-lg px-2 py-1">
                        <span className={s.team1Games > s.team2Games ? 'font-black text-white' : 'text-white/30'}>{s.team1Games}</span>
                        <span className="text-white/20 text-[10px]">–</span>
                        <span className={s.team2Games > s.team1Games ? 'font-black text-white' : 'text-white/30'}>{s.team2Games}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={match.winnerTeam === 1 ? 'opacity-50' : ''}>
                  <div className="space-y-1">
                    {[t2p1, t2p2].map((p, i) => (
                      <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                        <p className={`text-lg font-black hover:text-green-300 transition-colors ${match.winnerTeam === 2 ? 'text-white' : 'text-green-200'}`}>
                          {p?.name ?? '?'}
                        </p>
                      </Link>
                    ))}
                    {match.winnerTeam === 2 && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-black text-green-300 bg-green-500/20 border border-green-400/30 rounded-full px-3 py-0.5 mt-1">
                        🏆 GANADOR
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ≥sm horizontal — original layout */}
              <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-6 items-center">
                <div className={match.winnerTeam === 2 ? 'opacity-40' : ''}>
                  <div className="space-y-2">
                    {[t1p1, t1p2].map((p, i) => (
                      <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                        <p className={`text-xl font-black hover:text-green-300 transition-colors ${match.winnerTeam === 1 ? 'text-white' : 'text-green-200'}`}>
                          {p?.name ?? '?'}
                        </p>
                      </Link>
                    ))}
                    {match.winnerTeam === 1 && (
                      <span className="inline-flex items-center gap-1.5 text-sm font-black text-green-300 bg-green-500/20 border border-green-400/30 rounded-full px-3 py-1 mt-2">
                        🏆 GANADOR
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-5xl font-black tabular-nums ${match.winnerTeam === 1 ? 'text-green-400' : 'text-white/30'}`}>{t1Sets}</span>
                    <span className="text-white/30 font-black text-2xl">—</span>
                    <span className={`text-5xl font-black tabular-nums ${match.winnerTeam === 2 ? 'text-green-400' : 'text-white/30'}`}>{t2Sets}</span>
                  </div>
                  <div className="flex gap-2">
                    {sets.map((s) => (
                      <div key={s.setNumber} className="flex flex-col items-center">
                        <span className="text-green-400/60 text-xs mb-1">S{s.setNumber}</span>
                        <div className="flex items-center gap-1 font-mono text-sm bg-white/10 rounded-lg px-2.5 py-1.5">
                          <span className={s.team1Games > s.team2Games ? 'font-black text-white' : 'text-white/30'}>{s.team1Games}</span>
                          <span className="text-white/20 text-xs">–</span>
                          <span className={s.team2Games > s.team1Games ? 'font-black text-white' : 'text-white/30'}>{s.team2Games}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`text-right ${match.winnerTeam === 1 ? 'opacity-40' : ''}`}>
                  <div className="space-y-2">
                    {[t2p1, t2p2].map((p, i) => (
                      <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                        <p className={`text-xl font-black hover:text-green-300 transition-colors ${match.winnerTeam === 2 ? 'text-white' : 'text-green-200'}`}>
                          {p?.name ?? '?'}
                        </p>
                      </Link>
                    ))}
                    {match.winnerTeam === 2 && (
                      <div className="flex justify-end mt-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-black text-green-300 bg-green-500/20 border border-green-400/30 rounded-full px-3 py-1">
                          🏆 GANADOR
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Scheduled layout */
            <>
              {/* Mobile stacked */}
              <div className="sm:hidden space-y-3">
                <div className="space-y-1">
                  {[t1p1, t1p2].map((p, i) => (
                    <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                      <p className="text-lg font-black text-white hover:text-green-300 transition-colors">{p?.name ?? '?'}</p>
                    </Link>
                  ))}
                </div>
                <div className="text-center">
                  <p className="text-3xl font-black text-blue-300">VS</p>
                  <p className="text-blue-300/60 text-xs mt-1 uppercase tracking-widest">Pendiente</p>
                </div>
                <div className="space-y-1">
                  {[t2p1, t2p2].map((p, i) => (
                    <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                      <p className="text-lg font-black text-white hover:text-green-300 transition-colors">{p?.name ?? '?'}</p>
                    </Link>
                  ))}
                </div>
              </div>

              {/* ≥sm horizontal */}
              <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-6 items-center">
                <div className="space-y-2">
                  {[t1p1, t1p2].map((p, i) => (
                    <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                      <p className="text-xl font-black text-white hover:text-green-300 transition-colors">{p?.name ?? '?'}</p>
                    </Link>
                  ))}
                </div>
                <div className="text-center">
                  <p className="text-4xl font-black text-blue-300">VS</p>
                  <p className="text-blue-300/60 text-xs mt-1 uppercase tracking-widest">Pendiente</p>
                </div>
                <div className="text-right space-y-2">
                  {[t2p1, t2p2].map((p, i) => (
                    <Link key={i} href={p ? `/players/${p.id}` : '#'}>
                      <p className="text-xl font-black text-white hover:text-green-300 transition-colors">{p?.name ?? '?'}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
```

Also adjust the wrapper padding (`p-8 md:p-10`) on the parent of this block to `p-5 sm:p-8 md:p-10` if not already.

- [ ] **Step 3: Stack the pairing recommender cards on mobile**

In the same file, find the recommender section (`{pairingOptions && (...)`). Replace the **inner card layout** — the `<div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">` inside each `pairingOptions.map((opt, idx) => ...)` block. Replace with:

```tsx
                <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                  {/* Team 1 */}
                  <div className="space-y-2">
                    {opt.team1.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-black shrink-0">
                          {p.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-800 text-sm truncate">{p.name}</p>
                          <p className="text-xs text-gray-400">{Math.round(p.eloRating)} ELO</p>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs font-bold text-blue-600 pl-10">Elo equipo: {Math.round(opt.team1Elo)}</p>
                  </div>

                  <div className="text-center sm:px-2">
                    <span className="text-xl font-black text-gray-300">VS</span>
                  </div>

                  {/* Team 2 — DOM order avatar→text. On ≥sm we use `order` to flip to text→avatar (right-aligned). */}
                  <div className="space-y-2 sm:text-right">
                    {opt.team2.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 sm:justify-end">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-xs font-black shrink-0 sm:order-2">
                          {p.name.charAt(0)}
                        </div>
                        <div className="min-w-0 sm:order-1">
                          <p className="font-bold text-gray-800 text-sm truncate sm:text-right">{p.name}</p>
                          <p className="text-xs text-gray-400 sm:text-right">{Math.round(p.eloRating)} ELO</p>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs font-bold text-red-600 pl-10 sm:pl-0 sm:pr-10 sm:text-right">Elo equipo: {Math.round(opt.team2Elo)}</p>
                  </div>
                </div>
```

The change makes the grid become single-column on mobile (`grid sm:grid-cols-[1fr_auto_1fr]` — without `sm:` prefix it's just `grid`, default 1 column), and team 2 puts the avatar on the left in mobile and right in desktop (matching the existing visual asymmetry).

- [ ] **Step 4: Visual verification**

At iPhone SE: open `/matches/<id>` for both a scheduled and completed match. Confirm:
- Breadcrumb on its own line, status badge below.
- Hero shows team 1 → score → team 2 vertically; names readable; sets visible.
- Pairing recommender (scheduled): each option shows team 1 → VS → team 2 vertically.

At desktop: original horizontal layout preserved.

- [ ] **Step 5: Commit**

```bash
git add src/app/(public)/matches/[id]/page.tsx
git commit -m "style(mobile): stack match detail hero, breadcrumb, and pair recommender"
```

---

## Task 10: Pairs page table and top-3 cards

**Files:**
- Modify: `src/app/(public)/rankings/pairs/page.tsx`

References spec §3.6.

- [ ] **Step 1: Tighten top-3 cards**

In `src/app/(public)/rankings/pairs/page.tsx`, find the `pairs.slice(0, 3).map((pair, idx) => ...)` block. Replace the card outer `<div>` opening tag and the stats row inside.

Card outer (currently `p-5`) → `p-4 sm:p-5`:
```tsx
                    <div
                      key={pair.id}
                      className={`bg-gradient-to-br ${gradients[idx] ?? 'from-gray-50 to-gray-50 border-gray-200'} border rounded-2xl p-4 sm:p-5 shadow-md hover:shadow-lg transition-shadow`}
                    >
```

Stats row inside (`flex items-center justify-between pt-3 border-t border-black/5`) — change to allow horizontal squeeze on small screens:
```tsx
                      <div className="flex items-center justify-between gap-1 sm:gap-2 pt-3 border-t border-black/5">
                        <div className="text-center min-w-0">
                          <p className="text-base sm:text-lg font-black text-gray-800 tabular-nums">{pair.matchesPlayed}</p>
                          <p className="text-xs text-gray-400">Partidos</p>
                        </div>
                        <div className="text-center min-w-0">
                          <p className="text-base sm:text-lg font-black text-green-600 tabular-nums">{pair.wins}</p>
                          <p className="text-xs text-gray-400">Victorias</p>
                        </div>
                        <div className="text-center min-w-0">
                          <p className={`text-lg sm:text-xl font-black tabular-nums ${winRate >= 60 ? 'text-green-600' : winRate >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {winRate}%
                          </p>
                          <p className="text-xs text-gray-400">Win rate</p>
                        </div>
                        <div className="text-center min-w-0">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-black ${
                            synergy > 0.05 ? 'bg-green-100 text-green-700' :
                            synergy < -0.05 ? 'bg-red-100 text-red-600' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {synergy > 0 ? '+' : ''}{(synergy * 100).toFixed(0)}%
                          </span>
                          <p className="text-xs text-gray-400 mt-0.5">Sinergia</p>
                        </div>
                      </div>
```

- [ ] **Step 2: Tighten the table on mobile**

In the same file, find the **`<TableCell>` for the "Pareja" column** in the `pairs.map((pair, idx) => ...)` block, and replace its inner content (the `<div className="space-y-0.5">...</div>`) with:

```tsx
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 sm:gap-1.5">
                              <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-[10px] sm:text-xs font-black shrink-0">
                                {p1?.name.charAt(0) ?? '?'}
                              </div>
                              <Link href={`/players/${pair.player1Id}`} className="font-bold text-gray-800 hover:text-green-700 transition-colors text-xs sm:text-sm truncate">
                                {p1?.name ?? '?'}
                              </Link>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-1.5">
                              <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-[10px] sm:text-xs font-black shrink-0">
                                {p2?.name.charAt(0) ?? '?'}
                              </div>
                              <Link href={`/players/${pair.player2Id}`} className="font-bold text-gray-800 hover:text-green-700 transition-colors text-xs sm:text-sm truncate">
                                {p2?.name ?? '?'}
                              </Link>
                            </div>
                          </div>
                        </TableCell>
```

Then reduce the `pl-6 → pl-3 sm:pl-6` and `pr-6 → pr-3 sm:pr-6` on the # and Sinergia columns (header `<TableHead>` and body `<TableCell>`):
- `<TableHead className="w-12 pl-6 ...">` → `<TableHead className="w-10 sm:w-12 pl-3 sm:pl-6 ...">`
- `<TableCell className="pl-6 w-12">` → `<TableCell className="pl-3 sm:pl-6 w-10 sm:w-12">`
- `<TableHead className="text-center ... pr-6 hidden md:table-cell">` → keep as is (already `hidden md:table-cell`).

- [ ] **Step 3: Visual verification**

At iPhone SE: open `/rankings/pairs`. Confirm:
- Top-3 cards are one per row (already correct), inner stats row fits without overflow.
- Table renders without horizontal scroll, both player names per row visible (truncated if very long).

- [ ] **Step 4: Commit**

```bash
git add src/app/(public)/rankings/pairs/page.tsx
git commit -m "style(mobile): tighten pairs cards and table for narrow screens"
```

---

## Task 11: Rankings table polish + Info page sections + glosario

**Files:**
- Modify: `src/app/(public)/rankings/page.tsx`
- Modify: `src/app/(public)/info/page.tsx`

References spec §3.4 and §3.9.

- [ ] **Step 1: Rankings table tweaks**

In `src/app/(public)/rankings/page.tsx`, in the `<TableHeader>` and `<TableBody>` of the full ranking, reduce side padding for mobile:

- `<TableHead className="w-14 pl-6 ...">` → `<TableHead className="w-12 sm:w-14 pl-3 sm:pl-6 ...">`
- `<TableHead className="text-center ... pr-6">` (Win%) → `<TableHead className="text-center ... pr-3 sm:pr-6">`
- `<TableCell className="pl-6 w-14">` → `<TableCell className="pl-3 sm:pl-6 w-12 sm:w-14">`
- `<TableCell className="text-center pr-6">` (Win% body) → `<TableCell className="text-center pr-3 sm:pr-6">`

In the ELO `<TableCell className="text-center">` block (the one with `flex flex-col items-center` containing the elo number + delta), change `text-base` → `text-sm sm:text-base`:

```tsx
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center">
                            <span className="font-black text-sm sm:text-base tabular-nums">{Math.round(player.eloRating)}</span>
                            <span className={`text-xs font-bold tabular-nums ${eloChange >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                              {eloChange >= 0 ? '+' : ''}{eloChange}
                            </span>
                          </div>
                        </TableCell>
```

- [ ] **Step 2: Info page sections + glosario**

In `src/app/(public)/info/page.tsx`:

Replace each `<section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 md:p-10 ...">` with the responsive padding:
```tsx
<section className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm p-5 sm:p-8 md:p-10 space-y-...">
```
(Apply this to each section that uses `p-8 md:p-10` — the "¿Qué es LPT?", "El sistema Elo", and "Glosario" sections, and the "Contacto" section which uses `p-8 md:p-10`.)

In the Glosario section, replace the `<div className="divide-y divide-gray-100">` block's children. Currently each `.map(...)` returns `<div className="py-4 flex gap-4">`. Change to stacked-on-mobile:

```tsx
            <div key={item.term} className="py-4 flex flex-col sm:flex-row sm:gap-4">
              <p className="font-black text-green-700 sm:w-24 sm:shrink-0 mb-1 sm:mb-0">{item.term}</p>
              <p className="text-gray-600 text-sm leading-relaxed">{item.def}</p>
            </div>
```

- [ ] **Step 3: Visual verification**

At iPhone SE:
- `/rankings`: table renders with less side padding, ELO numbers don't crowd.
- `/info`: each section has tighter padding, glosario terms appear above their definitions.

- [ ] **Step 4: Commit**

```bash
git add src/app/(public)/rankings/page.tsx src/app/(public)/info/page.tsx
git commit -m "style(mobile): tighten rankings table padding and stack info glossary"
```

---

## Task 12: Admin layout + sidebar mobile pass

**Files:**
- Modify: `src/components/admin/admin-sidebar.tsx`
- Modify: `src/app/admin/layout.tsx`

References spec §3.11.

- [ ] **Step 1: Make AdminSidebar responsive (horizontal pills on mobile)**

Replace the entire content of `src/components/admin/admin-sidebar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const adminLinks = [
  { href: '/admin', label: '📊 Dashboard' },
  { href: '/admin/players', label: '👤 Jugadores' },
  { href: '/admin/matches', label: '🎾 Partidos' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="md:w-52 md:shrink-0">
      <nav className="flex md:flex-col gap-2 md:gap-1 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0">
        {adminLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'inline-flex items-center min-h-[40px] px-4 md:px-3 md:py-2 rounded-full md:rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 md:shrink',
              pathname === link.href
                ? 'bg-orange-100 text-orange-800'
                : 'bg-white text-gray-700 hover:bg-gray-100 md:bg-transparent'
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

Key changes:
- Mobile: horizontal flex with `overflow-x-auto`, pill-shaped chips with white background, `-mx-4 px-4` to bleed-edge nicely.
- Desktop: identical to before (vertical column with `w-52`, rounded-md sidebar items).

- [ ] **Step 2: Stack admin layout on mobile**

Replace `src/app/admin/layout.tsx`:

```tsx
import { Navbar } from '@/components/shared/navbar';
import { AdminSidebar } from '@/components/admin/admin-sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar isAdmin />
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 flex flex-col md:flex-row gap-4 md:gap-8">
        <AdminSidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Visual verification**

At iPhone SE, log in (`/login` with the admin password) → `/admin`:
- The sidebar appears as 3 horizontal chips above the main content.
- Each chip has `min-h-40px` and is comfortably tappable.
- No horizontal page scroll.
- Switching between Dashboard/Jugadores/Partidos works.

At desktop: layout looks like before (vertical sidebar to the left).

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/admin-sidebar.tsx src/app/admin/layout.tsx
git commit -m "style(mobile): horizontal admin sidebar chips on small screens"
```

---

## Task 13: Admin page-level cleanup (heroes, forms)

**Files:**
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/players/page.tsx`
- Modify: `src/app/admin/matches/page.tsx`
- Modify: `src/components/admin/player-form.tsx`
- Modify: `src/components/admin/match-form.tsx`
- Modify: `src/components/admin/result-form.tsx`

References spec §3.11.

This task is intentionally last — admin is lower-priority than the public app, and we want to confirm the rest is solid before chipping away at it.

- [ ] **Step 1: Read each admin page and its form to identify hard-coded `text-4xl`, `p-8`, multi-column grids**

Open each of the 6 files. Inspect headings (`text-4xl`, `text-3xl`), padding (`p-8`, `p-10`), and form grids (`grid-cols-2`, `grid-cols-3`, `grid-cols-4`).

- [ ] **Step 2: Apply the §3.1 hero pattern to admin page headers**

For each admin page (`admin/page.tsx`, `admin/players/page.tsx`, `admin/matches/page.tsx`):
- `text-4xl` (h1) → `text-2xl sm:text-3xl md:text-4xl`
- `p-8` containers → `p-5 sm:p-7 md:p-10`
- `rounded-2xl` heroes → `rounded-xl sm:rounded-2xl`

For each form (`player-form.tsx`, `match-form.tsx`, `result-form.tsx`):
- Any `grid-cols-2` / `grid-cols-3` / `grid-cols-4` for fields → prefix with `grid-cols-1 sm:grid-cols-2` (or `sm:grid-cols-3`, etc.) so fields stack on mobile.
- Any submit/cancel button at `text-xs px-3 py-1.5` → bump to `min-h-[40px] px-4 text-sm`.

(These are mechanical tweaks — apply per file based on what you actually find. Do not rewrite logic.)

- [ ] **Step 3: Visual verification**

At iPhone SE, logged in:
- `/admin` (dashboard) renders cleanly without overflow.
- `/admin/players` and `/admin/players/new`: form fields stack vertically on mobile.
- `/admin/matches` and `/admin/matches/new`: same.
- Try creating a player and a match — buttons are big enough to tap, form is usable.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/players/page.tsx src/app/admin/matches/page.tsx src/components/admin/player-form.tsx src/components/admin/match-form.tsx src/components/admin/result-form.tsx
git commit -m "style(mobile): responsive admin pages, forms, and tap targets"
```

---

## Task 14: Final verification — build, lint, full mobile sweep

**Files:** None modified — this is QA.

- [ ] **Step 1: Type check + production build**

Run: `npm run build`
Expected: clean build, no TS errors, no missing modules.

If errors appear, fix them (typically caused by the implementer's typos in earlier tasks — TypeScript will tell you exactly where).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean lint, no errors. (Warnings are OK if they pre-existed.)

- [ ] **Step 3: Full visual sweep at iPhone SE (375x667)**

With the dev server running:
1. `/` — hero, podium, upcoming/recent match cards.
2. Tap each bottom-tab → all 5 navigate correctly, active state moves.
3. `/rankings` — hero, podium, table.
4. Tap a player from the ranking → `/players/<id>` — header stacked, stats 2x2, history truncates.
5. `/rankings/pairs` — hero, top-3 cards, table.
6. `/matches` — hero, upcoming + completed cards stacked.
7. Tap a match → `/matches/<id>` — breadcrumb stacked, hero stacked, recommender stacked (if scheduled).
8. `/info` — hero, sections, glosario stacked.
9. `/login` → admin password → `/admin` — sidebar chips horizontal.
10. `/admin/players/new` — form fields stack vertically.

- [ ] **Step 4: Repeat at iPhone 14 Pro (393x852), Pixel 7 (412x915), iPad mini (768x1024)**

Quick sweep at each. iPad mini is the boundary where the layout flips back to desktop — confirm bottom tab bar disappears and top nav links reappear.

- [ ] **Step 5: Cross-checks**

In Chrome DevTools console, on each page, run:
```js
document.documentElement.scrollWidth === window.innerWidth
```
Expected: `true` (no horizontal overflow).

Run Lighthouse mobile on `/` and `/rankings`:
- Accessibility ≥ 90.
- Best practices ≥ 90.

- [ ] **Step 6: Commit anything trivial discovered (or skip if nothing to fix)**

If the sweep uncovered small issues, fix them in a final commit:
```bash
git commit -m "fix(mobile): final sweep adjustments"
```

If everything is clean, skip this step.

---

## Summary of files

**Created (4):**
- `src/components/shared/nav-links.ts`
- `src/components/shared/bottom-nav.tsx`
- `src/components/shared/match-card.tsx`
- `src/components/shared/podium.tsx`

**Modified (15+):**
- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/(public)/layout.tsx`
- `src/components/shared/navbar.tsx`
- `src/components/admin/admin-sidebar.tsx`
- `src/app/admin/layout.tsx`
- `src/app/(public)/page.tsx`
- `src/app/(public)/rankings/page.tsx`
- `src/app/(public)/rankings/pairs/page.tsx`
- `src/app/(public)/matches/page.tsx`
- `src/app/(public)/matches/[id]/page.tsx`
- `src/app/(public)/players/[id]/page.tsx`
- `src/app/(public)/info/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/players/page.tsx`
- `src/app/admin/matches/page.tsx`
- `src/components/admin/player-form.tsx`
- `src/components/admin/match-form.tsx`
- `src/components/admin/result-form.tsx`

**Untouched (intentionally):**
- `src/app/login/page.tsx`
- API routes
- Drizzle schema and rating logic
