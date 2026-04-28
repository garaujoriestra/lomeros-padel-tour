# Court OG image + Avatar Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make uploaded avatars persist across deploys (Vercel Blob), simplify the share button to WhatsApp-with-URL, and rewrite the match OG image as a top-down padel court with players in their drive/revés positions, big detailed score, and a clearly highlighted winner.

**Architecture:** Five files touched: `package.json` (add `@vercel/blob`), `src/app/api/upload/route.ts` (migrate to Blob), `src/components/shared/share-match-button.tsx` (simplify), `src/app/(public)/matches/[id]/page.tsx` (cleanup + `generateMetadata`), `src/app/(public)/matches/[id]/opengraph-image.tsx` (full rewrite). One new pure helper with unit tests for the drive/revés positioning logic. No DB schema changes.

**Tech Stack:** Next 16.2.2 (file conventions for OG + metadata), `next/og` ImageResponse / Satori, `@vercel/blob`, React 19, drizzle-orm, vitest.

**Verification model:**
- Unit tests for the new player-positioning helper (`src/lib/og/court-positions.test.ts`).
- After every task: `npx tsc --noEmit && npm run lint && npm test`. Existing tests must keep passing (no regressions).
- Manual smoke at the end: visit `/matches/[id]/opengraph-image` for completed + scheduled matches, verify visually.

**Background:** spec at `docs/superpowers/specs/2026-04-28-court-og-and-avatar-persistence-design.md`. Read before starting.

**Notable Next 16 quirk:** in v16.0.0+, the `params` argument of `opengraph-image.tsx` and `generateMetadata` is a **Promise** that must be `await`ed. The current `opengraph-image.tsx` uses sync access (`params.id`) and this is wrong on Next 16; the rewrite fixes it.

---

## Pre-flight

- [ ] **Step 0a: Create and switch to feature branch**

```bash
cd /Users/gar/Personal/ClaudeCode/lomeros-padel-tour
git checkout -b feature/court-og-and-blob
```

Expected: `Switched to a new branch 'feature/court-og-and-blob'`.

- [ ] **Step 0b: Confirm baseline checks pass**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, all tests pass (currently 49+).

Note the test count for later reference.

---

## Task 1: Add `@vercel/blob` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
npm install @vercel/blob
```

Expected: `package.json` and `package-lock.json` updated. No other changes.

- [ ] **Step 2: Verify install**

```bash
npm list @vercel/blob
```

Expected: shows `@vercel/blob@<version>` (≥1.0).

- [ ] **Step 3: Type check passes**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @vercel/blob for persistent avatar storage"
```

---

## Task 2: Migrate `/api/upload` to Vercel Blob

**Files:**
- Modify: `src/app/api/upload/route.ts` (full replace)

The existing implementation writes to `public/avatars/`, ephemeral on Vercel. We swap to `put()` from `@vercel/blob`.

- [ ] **Step 1: Replace file contents**

Replace the entire contents of `src/app/api/upload/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Solo se permiten imágenes' }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'La imagen no puede superar 2MB' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = `avatars/${randomUUID()}.${ext}`;

    const blob = await put(filename, file, {
      access: 'public',
      contentType: file.type,
    });

    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error('Upload error:', e);
    return NextResponse.json({ error: 'Error al subir la imagen' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Verify existing tests still pass**

Run: `npm test`
Expected: all tests pass, same count as baseline.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/upload/route.ts
git commit -m "feat(upload): migrate avatar storage to Vercel Blob

Filesystem writes were lost on each deploy. @vercel/blob persists
uploads and returns a public URL stored in players.avatar_url."
```

**Note for the human after deploy:** the Blob store and `BLOB_READ_WRITE_TOKEN` env var must be configured in Vercel dashboard (Production + Preview). For local dev, run `vercel env pull` to populate `.env.local`. This is operational, not part of the code commit.

---

## Task 3: Player-positioning helper (TDD)

The OG image needs to place 4 players in 4 court quadrants based on each player's `side` ("drive" / "reves" / null). The rule:
- Left half (team 1): drive top, revés bottom.
- Right half (team 2): revés top, drive bottom.
- If sides are missing/invalid for a team: player1 top, player2 bottom (no D/R badge for that team).

This is small but easy to mess up. Extract as a pure helper with unit tests.

**Files:**
- Create: `src/lib/og/court-positions.ts`
- Create: `src/lib/og/court-positions.test.ts`

- [ ] **Step 1: Write failing test file**

Create `src/lib/og/court-positions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveCourtPositions } from './court-positions';

describe('resolveCourtPositions', () => {
  it('places team1 drive top-left and revés bottom-left when sides are set', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: 'drive', p2Side: 'reves' },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: 'reves', p2Side: 'drive' },
    });
    expect(result.topLeft).toEqual({ playerId: 'a', label: 'D' });
    expect(result.bottomLeft).toEqual({ playerId: 'b', label: 'R' });
  });

  it('places team2 revés top-right and drive bottom-right when sides are set', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: 'drive', p2Side: 'reves' },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: 'reves', p2Side: 'drive' },
    });
    expect(result.topRight).toEqual({ playerId: 'c', label: 'R' });
    expect(result.bottomRight).toEqual({ playerId: 'd', label: 'D' });
  });

  it('handles team1 with p1=revés, p2=drive (swap players to keep drive top)', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: 'reves', p2Side: 'drive' },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: 'drive', p2Side: 'reves' },
    });
    expect(result.topLeft).toEqual({ playerId: 'b', label: 'D' });
    expect(result.bottomLeft).toEqual({ playerId: 'a', label: 'R' });
  });

  it('handles team2 with p1=drive, p2=revés (swap players to keep revés top)', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: 'drive', p2Side: 'reves' },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: 'drive', p2Side: 'reves' },
    });
    expect(result.topRight).toEqual({ playerId: 'd', label: 'R' });
    expect(result.bottomRight).toEqual({ playerId: 'c', label: 'D' });
  });

  it('falls back to p1 top, p2 bottom (no labels) when team1 sides are null', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: null, p2Side: null },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: 'reves', p2Side: 'drive' },
    });
    expect(result.topLeft).toEqual({ playerId: 'a', label: null });
    expect(result.bottomLeft).toEqual({ playerId: 'b', label: null });
    expect(result.topRight).toEqual({ playerId: 'c', label: 'R' });
    expect(result.bottomRight).toEqual({ playerId: 'd', label: 'D' });
  });

  it('falls back when only one side is set in a team (treats as missing)', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: 'drive', p2Side: null },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: 'reves', p2Side: 'drive' },
    });
    expect(result.topLeft).toEqual({ playerId: 'a', label: null });
    expect(result.bottomLeft).toEqual({ playerId: 'b', label: null });
  });

  it('falls back when sides are an invalid string', () => {
    const result = resolveCourtPositions({
      team1: { p1Id: 'a', p2Id: 'b', p1Side: 'left', p2Side: 'right' },
      team2: { p1Id: 'c', p2Id: 'd', p1Side: null, p2Side: null },
    });
    expect(result.topLeft).toEqual({ playerId: 'a', label: null });
    expect(result.bottomLeft).toEqual({ playerId: 'b', label: null });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- src/lib/og/court-positions.test.ts`
Expected: FAIL with `Cannot find module './court-positions'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/og/court-positions.ts`:

```ts
type SideValue = string | null;

export interface TeamInput {
  p1Id: string;
  p2Id: string;
  p1Side: SideValue;
  p2Side: SideValue;
}

export interface PositionsInput {
  team1: TeamInput;
  team2: TeamInput;
}

export interface PositionedPlayer {
  playerId: string;
  label: 'D' | 'R' | null;
}

export interface CourtPositions {
  topLeft: PositionedPlayer;
  bottomLeft: PositionedPlayer;
  topRight: PositionedPlayer;
  bottomRight: PositionedPlayer;
}

function isValidSide(s: SideValue): s is 'drive' | 'reves' {
  return s === 'drive' || s === 'reves';
}

function teamHasValidSides(t: TeamInput): boolean {
  if (!isValidSide(t.p1Side) || !isValidSide(t.p2Side)) return false;
  // p1 and p2 must be on different sides for the data to make sense
  return t.p1Side !== t.p2Side;
}

export function resolveCourtPositions(input: PositionsInput): CourtPositions {
  const { team1, team2 } = input;

  // Team 1: drive goes top, revés goes bottom.
  let topLeft: PositionedPlayer;
  let bottomLeft: PositionedPlayer;
  if (teamHasValidSides(team1)) {
    if (team1.p1Side === 'drive') {
      topLeft = { playerId: team1.p1Id, label: 'D' };
      bottomLeft = { playerId: team1.p2Id, label: 'R' };
    } else {
      topLeft = { playerId: team1.p2Id, label: 'D' };
      bottomLeft = { playerId: team1.p1Id, label: 'R' };
    }
  } else {
    topLeft = { playerId: team1.p1Id, label: null };
    bottomLeft = { playerId: team1.p2Id, label: null };
  }

  // Team 2: revés goes top, drive goes bottom.
  let topRight: PositionedPlayer;
  let bottomRight: PositionedPlayer;
  if (teamHasValidSides(team2)) {
    if (team2.p1Side === 'reves') {
      topRight = { playerId: team2.p1Id, label: 'R' };
      bottomRight = { playerId: team2.p2Id, label: 'D' };
    } else {
      topRight = { playerId: team2.p2Id, label: 'R' };
      bottomRight = { playerId: team2.p1Id, label: 'D' };
    }
  } else {
    topRight = { playerId: team2.p1Id, label: null };
    bottomRight = { playerId: team2.p2Id, label: null };
  }

  return { topLeft, bottomLeft, topRight, bottomRight };
}
```

- [ ] **Step 4: Run tests — verify all pass**

Run: `npm test -- src/lib/og/court-positions.test.ts`
Expected: all 7 tests pass.

- [ ] **Step 5: Run full test suite + tsc + lint**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean. Test count = baseline + 7.

- [ ] **Step 6: Commit**

```bash
git add src/lib/og/court-positions.ts src/lib/og/court-positions.test.ts
git commit -m "feat(og): add resolveCourtPositions helper for court layout

Pure helper that maps team players to court quadrants based on
their drive/revés side. Drive goes top on the left half, top on
the right half is revés (drives diagonal). Falls back to player
order without labels when sides are not set."
```

---

## Task 4: Simplify share button to WhatsApp + URL only

**Files:**
- Modify: `src/components/shared/share-match-button.tsx` (full replace)

- [ ] **Step 1: Replace file contents**

Replace the entire contents of `src/components/shared/share-match-button.tsx` with:

```tsx
'use client';

import { Button } from '@/components/ui/button';

interface ShareMatchButtonProps {
  url: string; // absolute URL of the match detail page
}

export function ShareMatchButton({ url }: ShareMatchButtonProps) {
  function handleShare() {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(url)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <Button
      type="button"
      onClick={handleShare}
      className="min-h-[40px] px-4 text-sm bg-[#25D366] hover:bg-[#1ebe57] text-white font-bold inline-flex items-center gap-2"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M19.05 4.91A10 10 0 0 0 12 2a10 10 0 0 0-8.5 15.18L2 22l4.95-1.46A10 10 0 0 0 12 22a10 10 0 0 0 7.05-17.09zM12 20.27a8.27 8.27 0 0 1-4.21-1.16l-.3-.18-2.94.87.88-2.86-.2-.31A8.27 8.27 0 1 1 12 20.27zm4.55-6.2c-.25-.13-1.47-.73-1.69-.81s-.39-.13-.55.13-.63.81-.78.97-.29.18-.54.06a6.78 6.78 0 0 1-2-1.23 7.5 7.5 0 0 1-1.38-1.72c-.14-.25 0-.38.11-.5s.25-.29.37-.43a1.65 1.65 0 0 0 .25-.41.45.45 0 0 0 0-.43c-.06-.13-.55-1.32-.75-1.81s-.4-.41-.55-.42h-.47a.92.92 0 0 0-.66.31 2.78 2.78 0 0 0-.86 2.06 4.84 4.84 0 0 0 1 2.55 11.05 11.05 0 0 0 4.21 3.7 14.18 14.18 0 0 0 1.4.52 3.36 3.36 0 0 0 1.55.1 2.55 2.55 0 0 0 1.66-1.17 2.06 2.06 0 0 0 .14-1.17c-.06-.11-.22-.17-.46-.3z" />
      </svg>
      Compartir por WhatsApp
    </Button>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: TypeScript will likely complain about the call site in `src/app/(public)/matches/[id]/page.tsx` because the props no longer accept `title` and `text`. That's expected — Task 5 fixes the call site. If this fails ONLY because of those two extra props, proceed to Task 5 without committing.

If it fails for any other reason, fix it before continuing.

- [ ] **Step 3: Do NOT commit yet**

Hold the commit until Task 5's call-site cleanup, so the tree compiles cleanly before any commit.

---

## Task 5: Match page cleanup + `generateMetadata`

**Files:**
- Modify: `src/app/(public)/matches/[id]/page.tsx`

Two edits in the same file:
1. Drop `t1NamesShort`, `t2NamesShort`, `setsString`, `shareText` (no longer needed). Pass only `url` to `<ShareMatchButton>`.
2. Add `generateMetadata` export so WhatsApp link previews use match-specific title and description.

- [ ] **Step 1: Remove unused share-text computations**

In `src/app/(public)/matches/[id]/page.tsx`, locate and delete these lines (currently around lines 128–133):

```tsx
  const t1NamesShort = `${t1p1?.name ?? '?'} / ${t1p2?.name ?? '?'}`;
  const t2NamesShort = `${t2p1?.name ?? '?'} / ${t2p2?.name ?? '?'}`;
  const setsString = sets.map((s) => `${s.team1Games}-${s.team2Games}`).join(' / ');
  const shareText = match.status === 'completed'
    ? `🎾 ${t1NamesShort} vs ${t2NamesShort} · ${setsString} · LPT`
    : '';
```

Keep the `headers()`, `host`, `proto`, `matchUrl` lines (they're still needed for the share button URL).

- [ ] **Step 2: Update the `<ShareMatchButton>` call**

Replace:

```tsx
          <ShareMatchButton
            url={matchUrl}
            title="Resultado del partido — LPT"
            text={shareText}
          />
```

With:

```tsx
          <ShareMatchButton url={matchUrl} />
```

- [ ] **Step 3: Add `generateMetadata` export**

At the top of `src/app/(public)/matches/[id]/page.tsx`, add the import for `Metadata` if not already there:

```tsx
import type { Metadata } from 'next';
```

Then, just before the `export default async function MatchDetailPage` line, add:

```tsx
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [match] = await db.select().from(matches).where(eq(matches.id, id));
  if (!match) {
    return { title: 'Partido no encontrado · LPT' };
  }
  const allPlayers = await db.select().from(players);
  const pMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const t1 = `${pMap[match.team1Player1Id]?.name ?? '?'}/${pMap[match.team1Player2Id]?.name ?? '?'}`;
  const t2 = `${pMap[match.team2Player1Id]?.name ?? '?'}/${pMap[match.team2Player2Id]?.name ?? '?'}`;

  if (match.status === 'completed') {
    const sets = await db
      .select()
      .from(matchSets)
      .where(eq(matchSets.matchId, id))
      .then((s) => s.sort((a, b) => a.setNumber - b.setNumber));
    const setsStr = sets.map((s) => `${s.team1Games}-${s.team2Games}`).join(' / ');
    const description = `Resultado del partido del ${match.date}${match.location ? ` en ${match.location}` : ''}.`;
    return {
      title: `${t1} vs ${t2} · ${setsStr} — LPT`,
      description,
      openGraph: {
        title: `${t1} vs ${t2} · ${setsStr}`,
        description,
      },
    };
  }

  const description = `Partido programado${match.location ? ` en ${match.location}` : ''}.`;
  return {
    title: `${t1} vs ${t2} · ${match.date} — LPT`,
    description,
    openGraph: {
      title: `${t1} vs ${t2} · ${match.date}`,
      description,
    },
  };
}
```

The explicit `openGraph` block ensures WhatsApp/Facebook previews use the match-specific title/description (and not the layout's generic "Lomeros Padel Tour").

- [ ] **Step 4: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all pass, no regressions.

- [ ] **Step 6: Commit (Tasks 4 + 5 together)**

```bash
git add src/components/shared/share-match-button.tsx src/app/(public)/matches/[id]/page.tsx
git commit -m "feat(share): WhatsApp-only share with rich link preview

Share button now opens wa.me with just the match URL — WhatsApp's
link preview (using opengraph-image + per-match metadata) provides
the visual content. Adds generateMetadata for match-specific
og:title/og:description so the preview text is meaningful."
```

---

## Task 6: OG image — foundation (params fix, header, footer, empty court)

**Files:**
- Modify: `src/app/(public)/matches/[id]/opengraph-image.tsx` (full replace)

This is the first of four incremental rewrites of the OG image. After this task the image renders the new structure but with placeholder content where players and score will go.

- [ ] **Step 1: Replace with foundation layout**

Replace the entire contents of `src/app/(public)/matches/[id]/opengraph-image.tsx` with:

```tsx
import { ImageResponse } from 'next/og';
import { db } from '@/lib/db';
import { matches, matchSets, players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Resultado del partido en pista de pádel';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [match] = await db.select().from(matches).where(eq(matches.id, id));
  if (!match) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#052e16',
            color: 'white',
            fontSize: 48,
            fontFamily: 'sans-serif',
          }}
        >
          Partido no encontrado
        </div>
      ),
      { ...size },
    );
  }

  const allPlayers = await db.select().from(players);
  const pMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const sets =
    match.status === 'completed'
      ? await db
          .select()
          .from(matchSets)
          .where(eq(matchSets.matchId, id))
          .then((s) => s.sort((a, b) => a.setNumber - b.setNumber))
      : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#052e16',
          fontFamily: 'sans-serif',
          color: 'white',
        }}
      >
        {/* Header strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 80,
            padding: '0 60px',
            fontSize: 22,
            color: '#86efac',
            fontWeight: 800,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>🎾</span>
            <span>Lomeros Padel Tour</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#bbf7d0' }}>
            <span>{match.date}</span>
            {match.location ? <span>📍 {match.location}</span> : null}
          </div>
        </div>

        {/* Court area (placeholder for Tasks 7–9) */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 60px',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: 1080,
              height: 440,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #14532d 0%, #064e3b 100%)',
              border: '4px solid white',
              display: 'flex',
            }}
          >
            {/* Net (vertical line center) */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                bottom: 0,
                width: 4,
                marginLeft: -2,
                background: 'white',
              }}
            />
            {/* Service line — left half */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                width: '50%',
                top: '33%',
                height: 2,
                background: 'rgba(255,255,255,0.85)',
              }}
            />
            {/* Service line — right half */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                width: '50%',
                top: '33%',
                height: 2,
                background: 'rgba(255,255,255,0.85)',
              }}
            />
          </div>
        </div>

        {/* Footer strip (placeholder for Task 9) */}
        <div
          style={{
            height: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            color: '#86efac',
          }}
        >
          {' '}
        </div>
      </div>
    ),
    { ...size },
  );
}
```

Key changes vs the current file:
- `params` is now `Promise<{ id: string }>` and awaited (Next 16.0+ requirement).
- Three vertical zones: 80px header / flex-1 court / 80px footer.
- Court is 1080×440, centered, with net + service lines drawn as absolutely-positioned divs.
- `players` and `pMap` and `sets` are fetched but not yet used — they'll be consumed in Tasks 7–9.

To avoid lint warnings about unused vars in the meantime, prefix unused with underscore by NOT removing them — they're consumed in Task 7 next. If lint flags `pMap` or `sets` as unused, this is acceptable transient state and will be resolved in Task 7. If `npx tsc` or lint fails because of unused locals, see Step 2.

- [ ] **Step 2: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. If lint complains about unused `pMap` or `sets` (some configs treat this as error), temporarily prefix with underscore (`_pMap`, `_sets`) and rename back in Task 7.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Smoke test in browser (manual, optional)**

Run: `npm run dev`. Navigate to `http://localhost:3000/matches/<existing-id>/opengraph-image` (replace with a real match ID). Expected: green court with net + service lines, header and footer strips. No players or score yet.

Stop dev server (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add src/app/(public)/matches/[id]/opengraph-image.tsx
git commit -m "feat(og): rewrite as top-down padel court — foundation

Lays out the new OG image structure: header strip, court rectangle
with net and service lines, footer strip. Players, score, and
winner highlight are added in subsequent commits. Also fixes the
Next 16 params-as-Promise contract that the previous version
violated."
```

---

## Task 7: OG image — players in their drive/revés positions

Now consume the helper from Task 3 and place 4 player avatars into the court quadrants.

**Files:**
- Modify: `src/app/(public)/matches/[id]/opengraph-image.tsx`

- [ ] **Step 1: Add imports and position resolution**

At the top of the file, add the helper import:

```tsx
import { resolveCourtPositions, type PositionedPlayer } from '@/lib/og/court-positions';
```

After the `pMap` line (and before the court JSX), add:

```tsx
  const positions = resolveCourtPositions({
    team1: {
      p1Id: match.team1Player1Id,
      p2Id: match.team1Player2Id,
      p1Side: match.team1Player1Side,
      p2Side: match.team1Player2Side,
    },
    team2: {
      p1Id: match.team2Player1Id,
      p2Id: match.team2Player2Id,
      p1Side: match.team2Player1Side,
      p2Side: match.team2Player2Side,
    },
  });
```

- [ ] **Step 2: Add a player-slot subcomponent in the same file**

Just under the imports (above the exported config consts is fine, or above the default function), add:

```tsx
function PlayerSlot({
  position,
  pos,
  pMap,
}: {
  position: 'topLeft' | 'bottomLeft' | 'topRight' | 'bottomRight';
  pos: PositionedPlayer;
  pMap: Record<string, { name: string; avatarUrl: string | null }>;
}) {
  const player = pMap[pos.playerId];
  const name = player?.name ?? '?';
  const avatarUrl = player?.avatarUrl ?? null;
  const initial = name.charAt(0).toUpperCase();

  // Quadrant offsets within the court (1080 × 440)
  // Each quadrant is 540 × 220. Center the slot within its quadrant.
  // Slot is 220 wide × 200 tall, vertically centered around y = ~110/330.
  const horizontalSide = position === 'topLeft' || position === 'bottomLeft' ? 'left' : 'right';
  const verticalSide = position === 'topLeft' || position === 'topRight' ? 'top' : 'bottom';

  const slotStyle: Record<string, string | number> = {
    position: 'absolute',
    width: 220,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  };
  // Position the slot center inside its quadrant.
  // Court is 1080 wide, each half = 540. Each quadrant center is at (540/2)=270 from its outer edge.
  // Court is 440 tall, top quadrant center = 110, bottom quadrant center = 330.
  if (horizontalSide === 'left') {
    slotStyle.left = 270 - 110; // center 220px wide slot at x=270
  } else {
    slotStyle.right = 270 - 110;
  }
  if (verticalSide === 'top') {
    slotStyle.top = 30; // small padding from top border
  } else {
    slotStyle.bottom = 30;
  }

  return (
    <div style={slotStyle}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          width={120}
          height={120}
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            objectFit: 'cover',
            border: '4px solid rgba(255,255,255,0.9)',
          }}
        />
      ) : (
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            background: 'linear-gradient(135deg, #4ade80 0%, #14532d 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 64,
            fontWeight: 900,
            border: '4px solid rgba(255,255,255,0.9)',
          }}
        >
          {initial}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            color: 'white',
            fontSize: 26,
            fontWeight: 800,
            textShadow: '0 2px 6px rgba(0,0,0,0.6)',
          }}
        >
          {name}
        </span>
        {pos.label ? (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 6,
              background: 'rgba(255,255,255,0.9)',
              color: '#052e16',
              fontSize: 15,
              fontWeight: 900,
            }}
          >
            {pos.label}
          </span>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render the four `PlayerSlot`s inside the court**

Inside the court `<div>` (the one with `position: 'relative'`), AFTER the net and service-line divs, add:

```tsx
            <PlayerSlot position="topLeft" pos={positions.topLeft} pMap={pMap} />
            <PlayerSlot position="bottomLeft" pos={positions.bottomLeft} pMap={pMap} />
            <PlayerSlot position="topRight" pos={positions.topRight} pMap={pMap} />
            <PlayerSlot position="bottomRight" pos={positions.bottomRight} pMap={pMap} />
```

- [ ] **Step 4: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. If `eslint` complains about `<img>` usage, the inline disable comment in the component already silences it.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Smoke test in browser**

Run: `npm run dev`. Visit `/matches/<id>/opengraph-image` for:
- A completed match with sides set: drives top-left + bottom-right; revés top-right + bottom-left; D/R badges visible.
- A match without sides set (if any exist): players shown without badges.
- A match with at least one player without an avatar: fallback initial circle visible.

Stop dev server.

- [ ] **Step 7: Commit**

```bash
git add src/app/(public)/matches/[id]/opengraph-image.tsx
git commit -m "feat(og): render 4 players in court quadrants

Uses resolveCourtPositions to map team players to quadrants based
on their drive/revés side. Drives end up in diagonal (top-left +
bottom-right). Avatar from Vercel Blob URL, with first-letter
gradient fallback when avatar is missing."
```

---

## Task 8: OG image — big detailed score (or VS for scheduled)

Place the score (or "VS") centered horizontally over the net, vertically centered in the court.

**Files:**
- Modify: `src/app/(public)/matches/[id]/opengraph-image.tsx`

- [ ] **Step 1: Build the score string**

Inside the default `Image` function, just after the `positions` block, compute:

```tsx
  const scoreText =
    match.status === 'completed' && sets.length > 0
      ? sets.map((s) => `${s.team1Games}-${s.team2Games}`).join(' · ')
      : null;
  const showVs = match.status !== 'completed';
```

- [ ] **Step 2: Render the score banner inside the court**

Inside the court `<div>`, AFTER the four `PlayerSlot`s, add:

```tsx
            {/* Score / VS over the net */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {showVs ? (
                <span
                  style={{
                    fontSize: 96,
                    fontWeight: 900,
                    color: 'white',
                    textShadow: '0 4px 20px rgba(0,0,0,0.7)',
                    letterSpacing: 4,
                  }}
                >
                  VS
                </span>
              ) : scoreText ? (
                <span
                  style={{
                    fontSize: 78,
                    fontWeight: 900,
                    fontFamily: 'monospace',
                    color: 'white',
                    background: 'rgba(0,0,0,0.55)',
                    padding: '12px 32px',
                    borderRadius: 16,
                    textShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    letterSpacing: 2,
                  }}
                >
                  {scoreText}
                </span>
              ) : null}
            </div>
```

The dark semi-transparent background behind the score guarantees legibility regardless of avatars/lines underneath.

- [ ] **Step 3: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Smoke test in browser**

Run: `npm run dev`. Visit OG URLs for:
- Completed match: detailed sets shown big in the center (e.g., `6-3 · 7-5`).
- Scheduled match: `VS` shown big.

Stop dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/(public)/matches/[id]/opengraph-image.tsx
git commit -m "feat(og): big detailed score banner over the net

Renders set-by-set games (6-3 · 7-5) at 78px monospace with a
semi-transparent dark backing for legibility. Scheduled matches
show a large VS instead."
```

---

## Task 9: OG image — winner highlight (overlay, border, footer banner)

Make the winning team unmistakably visible: green overlay on their court half, lime border inside their half, and a banner in the footer.

**Files:**
- Modify: `src/app/(public)/matches/[id]/opengraph-image.tsx`

- [ ] **Step 1: Render the winning-half overlay inside the court**

Inside the court `<div>`, AFTER the score banner, add:

```tsx
            {/* Winner overlay — only when match is completed and a winner exists */}
            {match.status === 'completed' && match.winnerTeam === 1 ? (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: '50%',
                  background: 'rgba(74, 222, 128, 0.28)',
                  border: '6px solid #4ade80',
                  borderRadius: '12px 0 0 12px',
                  pointerEvents: 'none',
                  display: 'flex',
                }}
              />
            ) : null}
            {match.status === 'completed' && match.winnerTeam === 2 ? (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '50%',
                  background: 'rgba(74, 222, 128, 0.28)',
                  border: '6px solid #4ade80',
                  borderRadius: '0 12px 12px 0',
                  pointerEvents: 'none',
                  display: 'flex',
                }}
              />
            ) : null}
```

These overlays sit on top of the players and net but with the lime border being inside the court half. Note the overlay `border` is solid 6px so it draws a clear "this side won" frame within the court.

**Visibility check:** if the overlay obscures the players or score, lower the alpha to 0.18 and try again. The trade-off is that lower alpha may make the highlight weaker. Bias toward visibility — the user wants this clearly visible.

- [ ] **Step 2: Compute winning-team display name**

Inside the default `Image` function, just below `scoreText`, add:

```tsx
  const winnerNames =
    match.status === 'completed' && match.winnerTeam === 1
      ? `${pMap[match.team1Player1Id]?.name ?? '?'} & ${pMap[match.team1Player2Id]?.name ?? '?'}`
      : match.status === 'completed' && match.winnerTeam === 2
        ? `${pMap[match.team2Player1Id]?.name ?? '?'} & ${pMap[match.team2Player2Id]?.name ?? '?'}`
        : null;
```

- [ ] **Step 3: Replace the empty footer with the winner banner**

Find the footer placeholder div (the one currently containing `{' '}`) and replace it with:

```tsx
        {/* Footer */}
        <div
          style={{
            height: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: winnerNames ? '#22c55e' : 'transparent',
          }}
        >
          {winnerNames ? (
            <span
              style={{
                color: '#052e16',
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 36 }}>🏆</span>
              <span>{winnerNames} ganan</span>
            </span>
          ) : null}
        </div>
```

For programmed matches (no winner), the footer stays empty and transparent — same overall layout, no banner.

- [ ] **Step 4: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Smoke test**

Run: `npm run dev`. Verify visually for three cases:
- Completed match where team 1 won: left half tinted green with lime border, footer green banner with team 1 names.
- Completed match where team 2 won: right half tinted green with lime border, footer green banner with team 2 names.
- Scheduled match: no overlay, no footer banner, just `VS` and players.

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/app/(public)/matches/[id]/opengraph-image.tsx
git commit -m "feat(og): highlight winning team with overlay + banner

The winning half of the court gets a green tint and a 6px lime
border. A green footer banner shows '🏆 Names & Names ganan'.
Scheduled matches keep a neutral footer."
```

---

## Task 10: Final verification

- [ ] **Step 1: Full type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean. Test count = baseline + 7 (from Task 3).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds without errors. Pay attention to any warnings from `next/og`.

- [ ] **Step 3: Manual UX verification**

Run: `npm run dev`. With at least one completed and one scheduled match in the local DB:

- Visit `/matches/<completed-id>` — verify the `<head>` source contains the new `og:title` (with names + score) and that the page renders normally.
- Visit `/matches/<completed-id>/opengraph-image` — verify the rendered image looks like the spec (court, players in correct positions, big score, winning side clearly highlighted, footer banner).
- Visit `/matches/<scheduled-id>/opengraph-image` — verify VS is shown, no overlay, no footer banner.
- Click "Compartir por WhatsApp" — verify it opens `wa.me/?text=<encoded-url>` with only the URL.
- (If on mobile) verify it opens the WhatsApp app directly, not the OS share sheet.

Stop dev server.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feature/court-og-and-blob
```

- [ ] **Step 5: Operational checklist (manual, post-merge)**

These items are NOT code. They are required for the feature to actually work in production. Write them in the PR description.

1. In Vercel dashboard → Storage → create a new Blob store named `lpt-avatars` (or similar). Connect it to the project. Vercel will auto-add `BLOB_READ_WRITE_TOKEN` to Production and Preview env vars.
2. Locally, run `vercel env pull` to sync the new env var into `.env.local` (only needed if testing the upload route locally).
3. After the Vercel deploy lands, log into the admin and re-upload Guillermo's avatar (and any other player avatars that were lost). Verify the new URL stored in `players.avatar_url` starts with `https://*.public.blob.vercel-storage.com/`.
4. Send a test WhatsApp message with a completed-match URL to verify the rich preview shows the new court image and per-match title.

---

## Self-review (already done by author)

- **Spec coverage:**
  - Vercel Blob migration → Tasks 1, 2.
  - Share button to WhatsApp + URL only → Task 4.
  - Match page cleanup + `generateMetadata` → Task 5.
  - OG court image (header/footer/empty court) → Task 6.
  - OG players in drive/revés positions → Tasks 3 (helper + tests) + 7 (render).
  - OG big detailed score / VS for scheduled → Task 8.
  - OG winner highlight (overlay + banner) → Task 9.
  - Operational steps (Blob store + re-upload) → Task 10 step 5.
- **Placeholder scan:** all code blocks contain real, complete code. No "implement later" markers.
- **Type consistency:** `PositionedPlayer.label` is `'D' | 'R' | null` consistently; `resolveCourtPositions` input names match between test and impl; `PlayerSlot` props match the helper output type.
