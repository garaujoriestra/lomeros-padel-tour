# Match Photo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional photo per match — uploaded once at result entry — surfaced as a hero in `/matches/[id]` and as a banner on each `MatchCard`.

**Architecture:** Single new column `photo_url` on `matches`. New upload endpoint `/api/upload/match-photo` (5MB limit, `match-photos/` Blob folder). Result form gets a file input + preview. Match detail and MatchCard render the photo when present. No tests — UI + DB pass-through; verified manually post-deploy.

**Tech Stack:** Next 16.2.2 (App Router), React 19, drizzle-orm (libsql/Turso), `@vercel/blob`, Tailwind v4.

**Verification model:**
- Per task: `npx tsc --noEmit && npm run lint && npm test`. Tests stay at 88 (no new tests for this plan).
- After all tasks: build + manual end-to-end smoke (create match, enter result with photo, verify hero + banner).
- Post-deploy: curl `/api/migrate-db` to apply the schema change to production.

**Background:** spec at `docs/superpowers/specs/2026-04-28-match-photo-design.md`. Read before starting.

**Notable constraints:**
- Codebase is Next 16 — `params` is a Promise in route handlers. Existing routes already follow this pattern.
- Vercel Blob is configured (BLOB_READ_WRITE_TOKEN in env). The avatar upload route at `src/app/api/upload/route.ts` is the reference pattern.
- The result-entry endpoint (`PUT /api/matches/[id]`) rejects requests when `match.status === 'completed'`. Photo upload thus happens only on the initial result entry — by design.
- Baseline: 88 tests across 10 files. Track this number.

---

## Pre-flight

- [ ] **Step 0a: Create and switch to feature branch**

```bash
cd /Users/gar/Personal/ClaudeCode/lomeros-padel-tour
git checkout -b feature/match-photo
```

Expected: `Switched to a new branch 'feature/match-photo'`.

- [ ] **Step 0b: Confirm baseline**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 88 tests pass across 10 files.

---

## Task 1: Schema — add `photoUrl` column

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add the column to the matches table**

In `src/lib/db/schema.ts`, find the `matches` table definition. Add a new line for `photoUrl` immediately AFTER the existing `team2Player2Side: text('team2_player2_side'),` line (so it sits with the other optional fields, before `notes` and `createdAt`):

```ts
  photoUrl: text('photo_url'),
```

The full neighborhood will read:
```ts
  team1Player1Side: text('team1_player1_side'),
  team1Player2Side: text('team1_player2_side'),
  team2Player1Side: text('team2_player1_side'),
  team2Player2Side: text('team2_player2_side'),
  photoUrl: text('photo_url'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
```

- [ ] **Step 2: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 88/88 tests pass.

The `Match` type derived via `$inferSelect` now includes `photoUrl: string | null`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(schema): add photo_url column to matches

Nullable text column. Existing rows default to null. Migration
in migrate-db route follows in next commit."
```

---

## Task 2: Migration — `ALTER TABLE matches ADD COLUMN photo_url`

**Files:**
- Modify: `src/app/api/migrate-db/route.ts`

The migrate-db route runs idempotent migrations. We add a step that adds the column if missing.

- [ ] **Step 1: Add the migration step**

Open `src/app/api/migrate-db/route.ts`. Find the existing migration steps (numbered "Step 1" through "Step 5"). Add a new step at the end of the migration sequence, BEFORE the `return NextResponse.json(...)` call. Use the same try/catch idempotency pattern as Step 3 / Step 4.

Insert this block:

```ts
    // Step 6: Add photo_url column to matches if not present (Block 2 — match photo)
    try {
      await db.run(sql`ALTER TABLE matches ADD COLUMN photo_url TEXT`);
    } catch {
      // Column already exists — skip silently
    }
```

- [ ] **Step 2: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 88/88 tests.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/migrate-db/route.ts
git commit -m "feat(migrate): add photo_url column to matches table

Idempotent ALTER TABLE step in the migration route. Run via
curl POST /api/migrate-db after deploy to apply to production."
```

---

## Task 3: Upload endpoint `/api/upload/match-photo`

**Files:**
- Create: `src/app/api/upload/match-photo/route.ts`

- [ ] **Step 1: Create the endpoint file**

Create `src/app/api/upload/match-photo/route.ts` with this content (mirrors the avatar upload route, with two differences: 5MB limit + `match-photos/` folder):

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

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'La imagen no puede superar 5MB' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = `match-photos/${randomUUID()}.${ext}`;

    const blob = await put(filename, file, {
      access: 'public',
      contentType: file.type,
    });

    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error('Match photo upload error:', e);
    return NextResponse.json({ error: 'Error al subir la imagen' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 88/88 tests.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/upload/match-photo/route.ts
git commit -m "feat(upload): add /api/upload/match-photo endpoint

5MB limit (vs 2MB for avatars). Uploads to match-photos/<uuid>.<ext>
in Vercel Blob. Reuses the same auth/contentType handling as the
avatar route."
```

---

## Task 4: API — accept `photoUrl` in `PUT /api/matches/[id]`

**Files:**
- Modify: `src/app/api/matches/[id]/route.ts`

The existing PUT handler accepts the result body and writes the match. Add `photoUrl` to the destructure and the conditional update.

- [ ] **Step 1: Read current state**

Read `src/app/api/matches/[id]/route.ts` to understand the destructuring on line 44 and the `updateFields` block around lines 76–80.

Currently:
```ts
const { sets, team1Player1Side, team1Player2Side, team2Player1Side, team2Player2Side } = body;
// ...
const updateFields: Record<string, unknown> = { winnerTeam, status: 'completed' };
if (team1Player1Side !== undefined) updateFields.team1Player1Side = coerceSide(team1Player1Side);
if (team1Player2Side !== undefined) updateFields.team1Player2Side = coerceSide(team1Player2Side);
if (team2Player1Side !== undefined) updateFields.team2Player1Side = coerceSide(team2Player1Side);
if (team2Player2Side !== undefined) updateFields.team2Player2Side = coerceSide(team2Player2Side);
```

- [ ] **Step 2: Add `photoUrl` to the destructure**

Replace line 44 (the destructure) with:

```ts
const { sets, team1Player1Side, team1Player2Side, team2Player1Side, team2Player2Side, photoUrl } = body;
```

- [ ] **Step 3: Add the conditional update**

After the four `team*Player*Side` `if (... !== undefined)` lines (currently around lines 77–80), add:

```ts
if (typeof photoUrl === 'string' && photoUrl.length > 0) updateFields.photoUrl = photoUrl;
```

The `typeof === 'string' && length > 0` check defensively rejects `null`, `undefined`, empty string, or non-string values — only legit Blob URLs make it through.

- [ ] **Step 4: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 88/88 tests.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/api/matches/[id]/route.ts'
git commit -m "feat(api): accept photoUrl on PUT /matches/[id]

The result-entry endpoint now persists photo_url when provided in
the body. The endpoint already rejects already-completed matches,
so this naturally implements the one-shot lifecycle (no replacement
possible after the result is set)."
```

---

## Task 5: Result form — photo upload UI

**Files:**
- Modify: `src/components/admin/result-form.tsx`

Add a file-input + preview block above the score fields, matching the pattern from `src/components/admin/player-form.tsx` (which uses the same upload UX for avatars). Wire the resulting URL into the submit body.

- [ ] **Step 1: Read the current result-form**

Read `src/components/admin/result-form.tsx` to understand its current structure: a client component with `useState` for `sets`, `team1Sides`, `team2Sides`, a `handleSubmit` that POSTs the body to `/api/matches/[matchId]`. The form has no file upload today.

Reference for the pattern: read `src/components/admin/player-form.tsx` lines 24-55 (the `useRef`, `useState` for `uploading`/`preview`, the `handleFileChange` function).

- [ ] **Step 2: Add imports + state**

In `src/components/admin/result-form.tsx`, replace the import block at the top (currently `useState`, `useRouter`, `toast`, `Button`, `Input`, `Badge`) with:

```tsx
'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
```

Inside the `ResultForm` function, immediately after the existing `useState` for `loading`, add:

```tsx
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [preview, setPreview] = useState<string>('');
```

- [ ] **Step 3: Add the upload handler**

Inside `ResultForm`, before `handleSubmit`, add:

```tsx
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreview(URL.createObjectURL(file));
    setUploading(true);

    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch('/api/upload/match-photo', { method: 'POST', body: fd });
    const data = await res.json();

    if (res.ok) {
      setPhotoUrl(data.url);
      toast.success('Foto subida');
    } else {
      toast.error(data.error || 'Error al subir la foto');
      setPreview('');
    }
    setUploading(false);
  }
```

- [ ] **Step 4: Add `photoUrl` to the submit body**

Find the `handleSubmit` function. The body it builds passes `sets` and the side fields. Add `photoUrl` to that body. Locate this section (the existing JSON body):

```tsx
    const res = await fetch(`/api/matches/${matchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sets: sets.map((s, idx) => ({ setNumber: idx + 1, team1Games: s.team1Games, team2Games: s.team2Games })),
        team1Player1Side: team1Sides[0] || null,
        team1Player2Side: team1Sides[1] || null,
        team2Player1Side: team2Sides[0] || null,
        team2Player2Side: team2Sides[1] || null,
      }),
    });
```

(If the actual code differs, adapt — the goal is to add a `photoUrl` field to the JSON.)

Add `photoUrl: photoUrl || null,` to the JSON body, right after the side fields:

```tsx
      body: JSON.stringify({
        sets: sets.map((s, idx) => ({ setNumber: idx + 1, team1Games: s.team1Games, team2Games: s.team2Games })),
        team1Player1Side: team1Sides[0] || null,
        team1Player2Side: team1Sides[1] || null,
        team2Player1Side: team2Sides[0] || null,
        team2Player2Side: team2Sides[1] || null,
        photoUrl: photoUrl || null,
      }),
```

- [ ] **Step 5: Add the photo upload UI block**

In the JSX, find the form's content. Add a new "Foto del partido" block at the top of the form (above the score fields). The exact placement depends on the existing JSX layout — typically inside the main form `<div>` and BEFORE the first `<Label>` for the score input.

Insert this block:

```tsx
          {/* Photo upload (optional) */}
          <div className="space-y-2">
            <Label>📷 Foto del partido (opcional)</Label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0 border-2 border-dashed border-gray-300 hover:border-green-500 transition-colors group bg-gray-50"
                aria-label="Seleccionar foto"
              >
                {preview ? (
                  <Image src={preview} alt="Preview" fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-3xl">📷</div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                  {uploading ? '⏳' : preview ? '🔄 Cambiar' : '📁 Elegir'}
                </div>
              </button>

              <div className="flex-1 space-y-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? 'Subiendo...' : preview ? 'Cambiar foto' : '📁 Seleccionar imagen'}
                </Button>
                <p className="text-xs text-gray-400">JPG, PNG, WEBP · Máx. 5MB</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
```

- [ ] **Step 6: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 88/88 tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/result-form.tsx
git commit -m "feat(admin): add photo upload to result form

Optional photo at result entry — same upload pattern as avatars
but with 5MB limit and the new /api/upload/match-photo endpoint.
Sent in the PUT body alongside the score and side data."
```

---

## Task 6: Match detail — hero photo

**Files:**
- Modify: `src/app/(public)/matches/[id]/page.tsx`

Render the photo as a hero image above the existing green-gradient header card.

- [ ] **Step 1: Read current state**

Read `src/app/(public)/matches/[id]/page.tsx` to find the JSX. The first child of the returned `<div className="space-y-8">` is the green header (currently around line 138). We want to render the photo just above this, still inside the same outer wrapper.

- [ ] **Step 2: Add the hero photo block**

Inside the outer `<div className="space-y-8">`, BEFORE the `{/* Header */}` block (the one with `bg-gradient-to-br from-green-950...`), insert:

```tsx
      {/* Photo hero */}
      {match.photoUrl && (
        <div className="rounded-2xl overflow-hidden bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={match.photoUrl}
            alt={`Foto del partido del ${match.date}`}
            className="w-full h-auto max-h-[400px] object-cover"
          />
        </div>
      )}
```

The `{/* eslint-disable-next-line @next/next/no-img-element */}` comment is required to silence Next's `<img>` lint rule (we use raw `<img>` to avoid configuring `next/image` for the Blob hostname).

- [ ] **Step 3: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 88/88 tests.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(public)/matches/[id]/page.tsx'
git commit -m "feat(public): hero photo on match detail page

Renders match.photoUrl as a full-width banner above the existing
green header when present. max-h-[400px] + object-cover handles
tall vertical photos without breaking the layout."
```

---

## Task 7: MatchCard — banner thumbnail + propagate prop

**Files:**
- Modify: `src/components/shared/match-card.tsx`
- Modify: `src/app/(public)/page.tsx` (dashboard — pass photoUrl)
- Modify: `src/app/(public)/matches/page.tsx` (matches list — pass photoUrl)
- Modify: `src/components/shared/activity-feed-item.tsx` (NOT changed — feed uses its own card)

`<MatchCard>` is used in: dashboard's "Próximos partidos", `/matches` page (upcoming + completed lists). Other surfaces (the activity feed) use a different component.

- [ ] **Step 1: Add `photoUrl` to `MatchCardData`**

In `src/components/shared/match-card.tsx`, find the `MatchCardData` interface (around line 15). Add `photoUrl: string | null;` to it. Updated:

```tsx
export interface MatchCardData {
  id: string;
  date: string;
  location?: string | null;
  status: string;            // 'scheduled' | 'completed' — stored as text in the DB schema
  winnerTeam?: number | null;
  photoUrl?: string | null;
}
```

- [ ] **Step 2: Render the banner inside the card**

In the same file, find the JSX that returns the card. The card's first child is the header strip (`{/* Header strip: date + location */}`). Add a new banner block ABOVE that header strip, INSIDE the outer `<div className="bg-white rounded-2xl shadow-md border ...">`:

Replace this section:
```tsx
    <div className={`bg-white rounded-2xl shadow-md border ${cardBorder} overflow-hidden hover:shadow-lg transition-all`}>
      {/* Header strip: date + location */}
      <div className={`px-4 sm:px-5 py-2.5 border-b flex justify-between items-center text-xs font-semibold ${headerColors}`}>
```

With:
```tsx
    <div className={`bg-white rounded-2xl shadow-md border ${cardBorder} overflow-hidden hover:shadow-lg transition-all`}>
      {match.photoUrl && (
        <div className="h-20 bg-gray-100 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={match.photoUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      {/* Header strip: date + location */}
      <div className={`px-4 sm:px-5 py-2.5 border-b flex justify-between items-center text-xs font-semibold ${headerColors}`}>
```

- [ ] **Step 3: Verify call sites pass `photoUrl`**

`<MatchCard>` is invoked in:
- `src/app/(public)/page.tsx` — for upcoming matches.
- `src/app/(public)/matches/page.tsx` — for both upcoming and completed lists.

Both call sites pass `match={...}` where `match` is a row from the `matches` table. Since Task 1 added `photoUrl` to the schema, those rows now include `photoUrl` automatically — **the call sites should already work without changes**. However, the prop interface used by these pages may have explicit type assertions. Verify by reading both files:

For each invocation of `<MatchCard match={match} ... />`, check that `match` is typed as the schema row (or as `typeof matches.$inferSelect`). If the call site has a custom interface that doesn't include `photoUrl`, add it.

In practice, the dashboard passes the full `Match` object from the schema, so it should propagate `photoUrl` automatically. The same for `/matches`. Read both files to confirm. If you find a typing layer that drops `photoUrl`, fix it.

- [ ] **Step 4: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 88/88 tests. If TypeScript complains about missing `photoUrl` somewhere, follow the error to find the interface that needs updating.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/match-card.tsx 'src/app/(public)/page.tsx' 'src/app/(public)/matches/page.tsx'
git commit -m "feat(match-card): banner photo when match.photoUrl is set

Adds a 80px tall banner image at the top of MatchCard when the
match has a photo. Object-cover handles arbitrary aspect ratios.
The activity feed (which uses its own card layout) is intentionally
not touched — photos surface only in MatchCard, per spec."
```

---

## Task 8: Final verification + push + deploy migration

- [ ] **Step 1: Full verification**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 88/88 tests pass.

- [ ] **Step 2: Build**

Run: `TURSO_DATABASE_URL="file:./.skip-db.sqlite" TURSO_AUTH_TOKEN="" npm run build && rm -f .skip-db.sqlite .skip-db.sqlite-journal`
Expected: build succeeds without errors.

- [ ] **Step 3: Local manual smoke (optional but recommended)**

Run: `npm run dev`. With a real DB:
- Create a scheduled match.
- Go to "Meter resultado". Verify the "📷 Foto del partido (opcional)" block exists above the score.
- Select an image file; verify the preview appears and "Foto subida" toast fires.
- Submit the result. Verify the partido is marked completed.
- Visit `/matches/<id>`. Verify hero photo is rendered above the green header.
- Visit `/` and `/matches`. Verify the partido's MatchCard has a banner thumbnail.

Stop dev server.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feature/match-photo
```

- [ ] **Step 5: Run the migration after the production deploy**

This is critical — without the migration, the `photo_url` column won't exist in production, and any insert will fail. Execute AFTER the Vercel deploy lands (post-merge to main, or via Preview deploy):

```bash
curl -X POST https://lomeros-padel-tour.vercel.app/api/migrate-db
```

Expected: JSON response with `{ ok: true }` (or whatever the existing migration route returns on success).

If the deploy hasn't landed yet, run it after — the migration is idempotent and safe to run multiple times.

---

## Self-review (already done by author)

- **Spec coverage:**
  - Schema column → Task 1.
  - Migration → Task 2.
  - Upload endpoint → Task 3.
  - PUT accepts photoUrl → Task 4.
  - Result form upload UI → Task 5.
  - Match detail hero → Task 6.
  - MatchCard banner + prop propagation → Task 7.
  - Build, smoke, push, run migration → Task 8.
- **Placeholder scan:** all code blocks show real, complete code. No "implement later".
- **Type consistency:** `photoUrl` (camelCase TS field) ↔ `photo_url` (snake_case DB column) is the standard drizzle convention used elsewhere in this codebase (`avatarUrl` ↔ `avatar_url`, `team1Player1Side` ↔ `team1_player1_side`). Consistent throughout.
- **Notable: no new tests.** The plan is intentionally test-free per spec — every change is UI rendering or DB pass-through with no unit-testable logic. Manual smoke covers verification.
