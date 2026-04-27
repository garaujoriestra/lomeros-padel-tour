# Lefty Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `is_left_handed` boolean column to the `players` table, expose it via the admin player form, and display a "🤚 Zurdo" badge in the player profile when set. Preserve all existing data via an idempotent ALTER TABLE migration.

**Architecture:** First schema change of the project. Reuses the existing `/api/migrate-db` ad-hoc ALTER TABLE pattern (not drizzle-kit migrations) — adds one column with default `0`, executed once after deploy via `curl -X POST /api/migrate-db`. The Drizzle ORM's `SELECT *` behavior makes the change backward-compatible: if the migration hasn't run yet, reads still work and the badge silently doesn't render.

**Tech Stack:** Drizzle ORM (sqlite/Turso), Next.js 16 API routes, React 19 client form, Tailwind v4 for the badge.

**Verification model:** `npx tsc --noEmit && npm run lint && npm test` after each task (23 Elo tests must keep passing — no rating logic touched). Manual visual verification post-deploy: edit a player as zurdo → see badge in profile.

**Background:** spec at `docs/superpowers/specs/2026-04-27-lefty-flag-design.md`. Read before starting.

---

## Pre-flight

- [ ] **Step 0a: Confirm branch**

Run: `git branch --show-current`
Expected: `feature/lefty-flag` (the spec was committed on this branch).

- [ ] **Step 0b: Confirm baseline checks pass**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 23 tests pass.

---

## Task 1: Schema + migration route

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/app/api/migrate-db/route.ts`

References spec sections "Schema" and "Migración".

- [ ] **Step 1: Add the column to the schema**

In `src/lib/db/schema.ts`, find the `players` table definition (around line 5):

```ts
export const players = sqliteTable('players', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  nickname: text('nickname'),
  avatarUrl: text('avatar_url'),
  eloRating: real('elo_rating').notNull().default(1500),
  matchesPlayed: integer('matches_played').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

Add the `isLeftHanded` field directly above `createdAt`:

```ts
export const players = sqliteTable('players', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  nickname: text('nickname'),
  avatarUrl: text('avatar_url'),
  eloRating: real('elo_rating').notNull().default(1500),
  matchesPlayed: integer('matches_played').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  isLeftHanded: integer('is_left_handed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: Add the migration step**

In `src/app/api/migrate-db/route.ts`, find the existing pattern of `try { ALTER TABLE ... } catch {}` blocks. Add a new step at the end of the existing steps (just before the final `return NextResponse.json(...)`). The exact pattern:

Find the location right after the existing migration steps (after the `winnerCol?.notnull === 1` recreation block ends, before the final response). Insert this new block:

```ts
    // Step N: Add is_left_handed column to players if not present (Feature B)
    try {
      await db.run(sql`ALTER TABLE players ADD COLUMN is_left_handed INTEGER NOT NULL DEFAULT 0`);
    } catch {
      // Column already exists — skip silently
    }
```

(The exact placement depends on the current file structure — read it first and insert before the final return statement.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 23 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts src/app/api/migrate-db/route.ts
git commit -m "feat(schema): add is_left_handed column + migration step for players"
```

---

## Task 2: API routes accept `isLeftHanded`

**Files:**
- Modify: `src/app/api/players/route.ts`
- Modify: `src/app/api/players/[id]/route.ts`

The POST and PUT routes currently destructure only `name`, `nickname`, `avatarUrl` from the body. Need to also accept `isLeftHanded`.

- [ ] **Step 1: Read current POST handler**

Open `src/app/api/players/route.ts` to see the current POST handler. Identify the lines that destructure the body and the `db.insert(...).values(...)` call.

- [ ] **Step 2: Update POST handler to accept isLeftHanded**

In the POST handler, where the body is destructured (e.g. `const { name, nickname, avatarUrl } = body;`), add `isLeftHanded`:

```ts
const { name, nickname, avatarUrl, isLeftHanded } = body;
```

In the `db.insert(players).values({ ... })` call, add the field with a defensive coercion:

```ts
const [created] = await db
  .insert(players)
  .values({
    name: name.trim(),
    nickname: nickname?.trim() || null,
    avatarUrl: avatarUrl?.trim() || null,
    isLeftHanded: !!isLeftHanded,
  })
  .returning();
```

(If the existing code has slightly different field handling, preserve that pattern — only add the new `isLeftHanded: !!isLeftHanded` line.)

- [ ] **Step 3: Update PUT handler**

In `src/app/api/players/[id]/route.ts`, the PUT handler currently has:

```ts
const body = await request.json();
const { name, nickname, avatarUrl } = body;
// ...
const [updated] = await db
  .update(players)
  .set({ name: name.trim(), nickname: nickname?.trim() || null, avatarUrl: avatarUrl?.trim() || null })
  .where(eq(players.id, id))
  .returning();
```

Change the destructure to include `isLeftHanded` and add it to `.set({ ... })`:

```ts
const body = await request.json();
const { name, nickname, avatarUrl, isLeftHanded } = body;
// ...
const [updated] = await db
  .update(players)
  .set({
    name: name.trim(),
    nickname: nickname?.trim() || null,
    avatarUrl: avatarUrl?.trim() || null,
    isLeftHanded: !!isLeftHanded,
  })
  .where(eq(players.id, id))
  .returning();
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/players/route.ts src/app/api/players/[id]/route.ts
git commit -m "feat(api): players POST/PUT accept isLeftHanded"
```

---

## Task 3: Admin player form — add checkbox

**Files:**
- Modify: `src/components/admin/player-form.tsx`

References spec section "Form admin".

- [ ] **Step 1: Update the `initialData` interface**

Find the `interface PlayerFormProps` block at the top of the file. It currently looks like:

```ts
interface PlayerFormProps {
  initialData?: {
    id: string;
    name: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
}
```

Add `isLeftHanded` to the type. Use `boolean | null` for resilience (if the migration hasn't run, this field will be undefined at runtime, treated as null/false on the form):

```ts
interface PlayerFormProps {
  initialData?: {
    id: string;
    name: string;
    nickname: string | null;
    avatarUrl: string | null;
    isLeftHanded: boolean | null;
  };
}
```

- [ ] **Step 2: Add to form state**

Find the `useState` initialization for `form`:

```ts
const [form, setForm] = useState({
  name: initialData?.name ?? '',
  nickname: initialData?.nickname ?? '',
  avatarUrl: initialData?.avatarUrl ?? '',
});
```

Add `isLeftHanded`:

```ts
const [form, setForm] = useState({
  name: initialData?.name ?? '',
  nickname: initialData?.nickname ?? '',
  avatarUrl: initialData?.avatarUrl ?? '',
  isLeftHanded: initialData?.isLeftHanded ?? false,
});
```

- [ ] **Step 3: Add the checkbox field below Apodo**

Find the Apodo `<div className="space-y-2">` block:

```tsx
<div className="space-y-2">
  <Label htmlFor="nickname">Apodo</Label>
  <Input
    id="nickname"
    value={form.nickname}
    onChange={(e) => setForm({ ...form, nickname: e.target.value })}
    placeholder="Ej: El Cañón"
  />
</div>
```

Right below it (before the `<div className="flex gap-2 pt-2">` with the buttons), add:

```tsx
<div className="flex items-center gap-2">
  <input
    id="isLeftHanded"
    type="checkbox"
    checked={form.isLeftHanded}
    onChange={(e) => setForm({ ...form, isLeftHanded: e.target.checked })}
    className="h-4 w-4 rounded border-gray-300"
  />
  <Label htmlFor="isLeftHanded" className="cursor-pointer">🤚 Zurdo</Label>
</div>
```

(Plain `<input type="checkbox">` rather than a shadcn Checkbox component because the project doesn't have one installed and we don't need the extra dependency for a single checkbox.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/player-form.tsx
git commit -m "feat(admin): add zurdo checkbox to player form"
```

---

## Task 4: Player profile badge

**Files:**
- Modify: `src/app/(public)/players/[id]/page.tsx`

References spec section "Profile display".

- [ ] **Step 1: Add the badge to the hero badges row**

Find the badges row inside the profile header (`<div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">`). It currently contains the ELO badge and conditionally the streak badge:

```tsx
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
```

Add the lefty badge between the ELO span and the streak span (so it appears in a logical visual order: identity → handedness → streak):

```tsx
<div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
  <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-bold">
    ELO {Math.round(player.eloRating)}
    <span className={`ml-1.5 text-xs font-black ${eloChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
      {eloChange >= 0 ? '+' : ''}{eloChange}
    </span>
  </span>
  {player.isLeftHanded && (
    <span className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 text-sm font-bold">
      🤚 Zurdo
    </span>
  )}
  {streak.count > 1 && (
    <span className={`px-3 py-1 rounded-full text-sm font-bold ${streak.type === 'W' ? 'bg-green-500/20 border border-green-400/40 text-green-300' : 'bg-red-500/20 border border-red-400/40 text-red-300'}`}>
      {streak.type === 'W' ? '🔥' : '❄️'} Racha {streak.count} {streak.type === 'W' ? 'victorias' : 'derrotas'}
    </span>
  )}
</div>
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/(public)/players/[id]/page.tsx
git commit -m "feat(profile): show 🤚 Zurdo badge in hero when isLeftHanded"
```

---

## Task 5: Final verification

**Files:** none modified — this is QA only.

- [ ] **Step 1: Final triple check**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 23 tests pass.

- [ ] **Step 2: Confirm cumulative diff**

Run: `git diff main..HEAD --stat`
Expected: exactly these files changed (plus the spec/plan docs from earlier commits):
- `src/lib/db/schema.ts`
- `src/app/api/migrate-db/route.ts`
- `src/app/api/players/route.ts`
- `src/app/api/players/[id]/route.ts`
- `src/components/admin/player-form.tsx`
- `src/app/(public)/players/[id]/page.tsx`

Plus the spec doc:
- `docs/superpowers/specs/2026-04-27-lefty-flag-design.md`
- `docs/superpowers/plans/2026-04-27-lefty-flag.md`

If anything else is in the diff, investigate before merging.

- [ ] **Step 3: No commit needed**

This is a checkpoint task. If everything is clean, proceed to merge.

---

## Post-deploy: apply the migration

This step happens AFTER the branch is merged and Vercel has deployed the new code (~40s after push).

Run **one time** to apply the schema change to the production DB:

```bash
curl -X POST https://lomeros-padel-tour.vercel.app/api/migrate-db
```

Expected: a JSON response indicating success. The endpoint is idempotent — running it again does nothing.

Then manually verify:
1. Open admin → edit a player → check the new "🤚 Zurdo" checkbox → save.
2. Open that player's profile (`/players/<id>`) → confirm the blue "🤚 Zurdo" badge appears in the hero.
3. Open another player's profile (not marked) → confirm no badge appears.
4. Create a new player from admin → confirm the create flow works (this would have failed if the migration hadn't run).

---

## Summary of files

**Modified (6 source + 2 docs):**
- `src/lib/db/schema.ts`
- `src/app/api/migrate-db/route.ts`
- `src/app/api/players/route.ts`
- `src/app/api/players/[id]/route.ts`
- `src/components/admin/player-form.tsx`
- `src/app/(public)/players/[id]/page.tsx`
- `docs/superpowers/specs/2026-04-27-lefty-flag-design.md` (already committed)
- `docs/superpowers/plans/2026-04-27-lefty-flag.md` (this file, will be committed)

**Created:** none.

**Untouched:** Tests, Elo logic, Podium, MatchCard, recommend-pairs, all (public) pages except `players/[id]`, all admin pages except the form.
