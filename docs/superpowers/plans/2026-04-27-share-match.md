# Share Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a dynamic OpenGraph image for each match detail page (so WhatsApp/social previews are rich) and add a "📤 Compartir resultado" button on completed matches that triggers the Web Share API with WhatsApp click-to-chat fallback.

**Architecture:** Two new files (OG image route + share button client component) plus 3 lines added in the match detail page. Uses Next 16's `opengraph-image.tsx` file convention (same `next/og` engine already used by the PWA icons). No DB, schema, API or migration changes.

**Tech Stack:** Next 16 file conventions, `next/og` ImageResponse, React 19 client component, Web Share API, sonner for toasts.

**Verification model:** No automated tests (UI + image-generation, no logic). After each task: `npx tsc --noEmit && npm run lint && npm test` (49 existing tests must keep passing). Manual visual + share-flow verification post-deploy.

**Background:** spec at `docs/superpowers/specs/2026-04-27-share-match-design.md`. Read before starting.

---

## Pre-flight

- [ ] **Step 0a: Confirm branch**

Run: `git branch --show-current`
Expected: `feature/share-match`

- [ ] **Step 0b: Confirm baseline checks pass**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 49 tests pass.

---

## Task H.1: OG image route

**Files:**
- Create: `src/app/(public)/matches/[id]/opengraph-image.tsx`

Next 16 auto-detects this file and (a) sets the `<meta property="og:image">` of `/matches/[id]` to its rendered output, and (b) serves the image at `/matches/[id]/opengraph-image`.

- [ ] **Step 1: Create the file with EXACT content**

Create `src/app/(public)/matches/[id]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from 'next/og';
import { db } from '@/lib/db';
import { matches, matchSets, players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Resultado del partido';

export default async function Image({ params }: { params: { id: string } }) {
  const [match] = await db.select().from(matches).where(eq(matches.id, params.id));
  if (!match) {
    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#052e16', color: 'white', fontSize: 48, fontFamily: 'sans-serif',
        }}>
          Partido no encontrado
        </div>
      ),
      { ...size },
    );
  }

  const allPlayers = await db.select().from(players);
  const pMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const sets = match.status === 'completed'
    ? await db.select().from(matchSets).where(eq(matchSets.matchId, params.id)).then((s) => s.sort((a, b) => a.setNumber - b.setNumber))
    : [];

  const t1Sets = sets.filter((s) => s.team1Games > s.team2Games).length;
  const t2Sets = sets.filter((s) => s.team2Games > s.team1Games).length;

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #052e16 0%, #14532d 50%, #064e3b 100%)',
        color: 'white',
        padding: '60px 80px',
        fontFamily: 'sans-serif',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 28, color: '#86efac', fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 40 }}>🎾</span>
            <span>Lomeros Padel Tour</span>
          </div>
          <span style={{ color: '#bbf7d0' }}>{match.date}</span>
        </div>

        {/* Center: teams + score */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, fontSize: 44, fontWeight: 800, color: match.winnerTeam === 1 ? '#4ade80' : 'white', opacity: match.winnerTeam === 2 ? 0.5 : 1 }}>
            <span>{pMap[match.team1Player1Id]?.name ?? '?'}</span>
            <span>{pMap[match.team1Player2Id]?.name ?? '?'}</span>
            {match.winnerTeam === 1 && <span style={{ fontSize: 24, color: '#4ade80', marginTop: 8 }}>🏆 Ganador</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            {match.status === 'completed' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 110, fontWeight: 900 }}>
                  <span style={{ color: match.winnerTeam === 1 ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>{t1Sets}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 80 }}>—</span>
                  <span style={{ color: match.winnerTeam === 2 ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>{t2Sets}</span>
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 28, fontFamily: 'monospace', color: '#a7f3d0' }}>
                  {sets.map((s) => (
                    <span key={s.setNumber}>{s.team1Games}-{s.team2Games}</span>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 80, fontWeight: 900, color: '#86efac' }}>VS</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, alignItems: 'flex-end', textAlign: 'right', fontSize: 44, fontWeight: 800, color: match.winnerTeam === 2 ? '#4ade80' : 'white', opacity: match.winnerTeam === 1 ? 0.5 : 1 }}>
            <span>{pMap[match.team2Player1Id]?.name ?? '?'}</span>
            <span>{pMap[match.team2Player2Id]?.name ?? '?'}</span>
            {match.winnerTeam === 2 && <span style={{ fontSize: 24, color: '#4ade80', marginTop: 8 }}>🏆 Ganador</span>}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'center', fontSize: 24, color: '#86efac' }}>
          {match.location ? `📍 ${match.location}` : ' '}
        </div>
      </div>
    ),
    { ...size },
  );
}
```

**Note:** the `params` argument here is a synchronous `{ id: string }` — the `opengraph-image` convention in Next 16 does NOT use the async `Promise<{...}>` wrapper that page components use. If TypeScript complains, the fix is to make `params` a Promise and `await` it, but try the sync form first since that's what Next docs show.

- [ ] **Step 2: Verify TypeScript and build**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

If TypeScript complains about `params` type, change the function signature to:
```tsx
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [match] = await db.select().from(matches).where(eq(matches.id, id));
  // ... rest of the function uses `id` instead of `params.id`
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/matches/[id]/opengraph-image.tsx"
git commit -m "feat(og): dynamic OpenGraph image for match detail page"
```

---

## Task H.2: Share button component

**Files:**
- Create: `src/components/shared/share-match-button.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/shared/share-match-button.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface ShareMatchButtonProps {
  url: string;     // absolute URL of the match detail page
  title: string;   // page title for the share sheet
  text: string;    // text body (without the URL — APIs append it separately)
}

export function ShareMatchButton({ url, title, text }: ShareMatchButtonProps) {
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    setSharing(true);
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share({ title, text, url });
      } else {
        // Fallback: open WhatsApp click-to-chat with prefilled text + url
        const fullText = `${text}\n${url}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, '_blank');
      }
    } catch (e) {
      // User canceled the share sheet — ignore silently.
      // Other errors — show toast.
      if (e instanceof Error && e.name !== 'AbortError') {
        toast.error('No se pudo compartir');
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={handleShare}
      disabled={sharing}
      className="min-h-[40px] px-4 text-sm bg-green-600 hover:bg-green-700 text-white font-bold"
    >
      📤 {sharing ? 'Compartiendo...' : 'Compartir resultado'}
    </Button>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. Component is unused — that's fine, Task H.3 wires it.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/share-match-button.tsx
git commit -m "feat(share): client component with Web Share API + wa.me fallback"
```

---

## Task H.3: Render the share button on completed match detail

**Files:**
- Modify: `src/app/(public)/matches/[id]/page.tsx`

- [ ] **Step 1: Add imports**

In `src/app/(public)/matches/[id]/page.tsx`, add to the existing imports:

```tsx
import { ShareMatchButton } from '@/components/shared/share-match-button';
import { headers } from 'next/headers';
```

- [ ] **Step 2: Compute the absolute URL inside the page component**

The page component is `async function MatchDetailPage(...)`. Inside, after the existing data fetching (any place before the `return` JSX) is fine. Add:

```ts
const headersList = await headers();
const host = headersList.get('host') ?? 'lomeros-padel-tour.vercel.app';
const proto = host.includes('localhost') ? 'http' : 'https';
const matchUrl = `${proto}://${host}/matches/${match.id}`;
```

- [ ] **Step 3: Compute the share text (only relevant for completed)**

Add right after the URL computation:

```ts
const t1NamesShort = `${t1p1?.name ?? '?'} / ${t1p2?.name ?? '?'}`;
const t2NamesShort = `${t2p1?.name ?? '?'} / ${t2p2?.name ?? '?'}`;
const setsString = sets.map((s) => `${s.team1Games}-${s.team2Games}`).join(' / ');
const shareText = match.status === 'completed'
  ? `🎾 ${t1NamesShort} vs ${t2NamesShort} · ${setsString} · LPT`
  : '';
```

(Variables `t1p1`, `t1p2`, `t2p1`, `t2p2`, and `sets` are already in scope from earlier in the function.)

- [ ] **Step 4: Render the button after the hero, before the recommender section**

Find the closing `</div>` of the green-gradient hero (the outermost `<div>` of the hero block — look for the `relative overflow-hidden rounded-2xl sm:rounded-3xl` wrapper near the top of the JSX). After it closes, and BEFORE any subsequent `<section>` or `<div>` (like the recommender or pair history), add:

```tsx
{match.status === 'completed' && (
  <div className="flex justify-end">
    <ShareMatchButton
      url={matchUrl}
      title="Resultado del partido — LPT"
      text={shareText}
    />
  </div>
)}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 49 tests.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/matches/[id]/page.tsx"
git commit -m "feat(public): show share button on completed match detail"
```

---

## Task H.4: Final verification

**Files:** none modified — QA only.

- [ ] **Step 1: Final triple check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 49 tests.

- [ ] **Step 2: Confirm cumulative diff**

Run: `git diff main..HEAD --stat`
Expected exactly:
- `docs/superpowers/specs/2026-04-27-share-match-design.md`
- `docs/superpowers/plans/2026-04-27-share-match.md`
- `src/app/(public)/matches/[id]/opengraph-image.tsx`
- `src/components/shared/share-match-button.tsx`
- `src/app/(public)/matches/[id]/page.tsx`

5 files. If anything else appears, investigate.

- [ ] **Step 3: No commit needed** unless something needs fixing.

---

## Post-deploy

After merge + push + Vercel deploy completes (~40s):

1. Open production URL.
2. Open a COMPLETED match's detail page → confirm "📤 Compartir resultado" button visible at the right under the hero.
3. Click it on desktop:
   - If browser supports `navigator.share` (Edge, Safari): native share sheet appears.
   - Otherwise: opens WhatsApp web at `wa.me/?text=...` with text + URL pre-filled.
4. Click on mobile: native OS share sheet opens.
5. Send to a WhatsApp chat → after a few seconds WhatsApp shows a rich preview with the OG image (player names + score + date).
6. Open `https://lomeros-padel-tour.vercel.app/matches/<id>/opengraph-image` directly in browser → see the rendered PNG.
7. Open a SCHEDULED match → confirm NO share button. URL is still shareable (OG image shows "VS").

No DB migration needed.

---

## Summary of files

**Created (2):**
- `src/app/(public)/matches/[id]/opengraph-image.tsx`
- `src/components/shared/share-match-button.tsx`

**Modified (1):**
- `src/app/(public)/matches/[id]/page.tsx`

**Untouched:** schema, all API routes, all forms, admin pages, all other public pages, lógica de Elo, helpers de rating.
