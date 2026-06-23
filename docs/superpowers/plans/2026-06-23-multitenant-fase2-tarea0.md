# Fase 2 · Tarea 0 (dev-login + seed staging) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la maquinaria de código de la Tarea 0 de Fase 2: un dev-login guardado (página + endpoint) y un endpoint de seed de staging, ambos deshabilitados en producción, para poder probar onboarding en previews/dev sin tocar la base de Lomeros real ni pasar por Google.

**Architecture:** Un único guard de entorno `isDevToolingEnabled()` (basado en `VERCEL_ENV !== 'production'`) protege los tres artefactos nuevos. El endpoint `POST /api/auth/dev-login` forja la cookie `session` con el mismo patrón que el callback real de Google (`signSession({ userId })` + `NextResponse.cookies.set`), creando un usuario "pelado" (sin membership) si el email no existe. La página `/dev-login` es un server component que lista usuarios y delega en un client component que llama al endpoint. El endpoint `POST /api/dev/seed-staging` reutiliza la **receta probada del global-setup de e2e**: self-fetch idempotente a las migraciones HTTP existentes + un helper compartido `ensureAuxTables(client)` (extraído del global-setup) + siembra de un "Grupo Demo" vía SQL raw.

**Tech Stack:** Next.js 16 App Router (route handlers + server/client components), `@libsql/client` (SQL raw), Drizzle ORM, `jose` (JWT HS256), Vitest (unit), Playwright (e2e).

**Notas de entorno (leer antes de empezar):**
- Este proyecto usa una versión de Next con breaking changes; consulta `node_modules/next/dist/docs/` ante cualquier duda de API. Los patrones de este plan ya están copiados del código existente (`src/app/api/auth/callback/route.ts`, `src/lib/auth/session.ts`), así que son seguros.
- `cookies()` de `next/headers` es **async** en esta versión (ver `src/lib/auth/session.ts:41`).
- Unit tests: `npm test` (vitest, recoge `**/*.test.ts`). E2e: `npm run e2e` (Playwright en puerto 3100 contra SQLite de fichero `e2e/test.db`, recreada en cada arranque). Guard de fuga: `npm run check:db-access`. Lint: `npm run lint`.
- El seed y la siembra DEBEN usar `client.execute()` con SQL raw (no Drizzle `.insert(players)`), para mirror del global-setup y para no disparar `check-direct-db-access.mjs`.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/lib/auth/dev-login.ts` (crear) | Guard `isDevToolingEnabled()`. Única fuente de verdad. |
| `src/lib/auth/dev-login.test.ts` (crear) | Unit del guard (3 casos de `VERCEL_ENV`). |
| `src/app/api/auth/dev-login/route.ts` (crear) | `POST` que forja la sesión (crea user si hace falta). |
| `src/app/dev-login/page.tsx` (crear) | Server component: guard + lista de usuarios. |
| `src/app/dev-login/dev-login-form.tsx` (crear) | Client component: botones + campo email → llama al endpoint. |
| `src/lib/db/bootstrap.ts` (crear) | `ensureAuxTables(client)` extraído del global-setup. |
| `src/lib/db/bootstrap.test.ts` (crear) | Unit de idempotencia de `ensureAuxTables`. |
| `e2e/global-setup.ts` (modificar) | Usar `ensureAuxTables`; firmar JWT `{ userId }` (no `role`). |
| `src/app/api/dev/seed-staging/route.ts` (crear) | `POST` seed: migraciones + aux tables + Grupo Demo. |
| `e2e/dev-login.spec.ts` (crear) | E2e del endpoint (API) y de la página (UI). |
| `e2e/seed-staging.spec.ts` (crear) | E2e del seed (creación + idempotencia). |
| `docs/dev-staging.md` (crear) | Doc de referencia del entorno de staging y dev tooling. |

---

## Task 1: Guard `isDevToolingEnabled()`

**Files:**
- Create: `src/lib/auth/dev-login.ts`
- Test: `src/lib/auth/dev-login.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/auth/dev-login.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import { isDevToolingEnabled } from './dev-login';

describe('isDevToolingEnabled', () => {
  const original = process.env.VERCEL_ENV;
  afterEach(() => {
    if (original === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original;
  });

  it('habilitado en local (VERCEL_ENV indefinido)', () => {
    delete process.env.VERCEL_ENV;
    expect(isDevToolingEnabled()).toBe(true);
  });

  it('habilitado en preview', () => {
    process.env.VERCEL_ENV = 'preview';
    expect(isDevToolingEnabled()).toBe(true);
  });

  it('bloqueado en produccion', () => {
    process.env.VERCEL_ENV = 'production';
    expect(isDevToolingEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/auth/dev-login.test.ts`
Expected: FAIL — `Cannot find module './dev-login'` o `isDevToolingEnabled is not a function`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/auth/dev-login.ts`:
```ts
/**
 * Guard de dev-tooling: habilita el dev-login y el seed de staging SOLO fuera de
 * producción. En Vercel, VERCEL_ENV vale 'production' | 'preview' | 'development';
 * en local (`npm run dev`) es undefined. Producción es el único entorno bloqueado.
 * Es un check de ENTORNO (no un flag activable por error en prod).
 */
export function isDevToolingEnabled(): boolean {
  return process.env.VERCEL_ENV !== 'production';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/auth/dev-login.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/dev-login.ts src/lib/auth/dev-login.test.ts
git commit -m "feat(dev-login): guard isDevToolingEnabled (VERCEL_ENV != production)"
```

---

## Task 2: Endpoint `POST /api/auth/dev-login`

**Files:**
- Create: `src/app/api/auth/dev-login/route.ts`
- Test: `e2e/dev-login.spec.ts` (parte 1, API)

Patrón de cookie copiado de `src/app/api/auth/callback/route.ts:33-44`. `getUserByEmail` ya normaliza email (trim+lowercase). El usuario nuevo se crea con `db.insert(users).values({ email }).returning()` (schema: `id` y `created_at` autogenerados; columnas legacy `role`/`player_id` toman su default de DB → sin membership = estado de onboarding).

- [ ] **Step 1: Write the failing test**

`e2e/dev-login.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test.describe('dev-login endpoint (API)', () => {
  test('forja sesión para usuario existente y emite cookie session', async ({ request }) => {
    const res = await request.post('/api/auth/dev-login', { data: { email: 'pl1@test.com' } });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.userId).toBeTruthy();
    const setCookies = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
    expect(setCookies.some((h) => h.value.startsWith('session='))).toBe(true);
  });

  test('crea usuario nuevo (sin membership) para email desconocido', async ({ request }) => {
    const email = 'nuevo-api@test.com';
    const res = await request.post('/api/auth/dev-login', { data: { email } });
    expect(res.status()).toBe(200);
    expect((await res.json()).userId).toBeTruthy();
  });

  test('400 si falta email', async ({ request }) => {
    const res = await request.post('/api/auth/dev-login', { data: {} });
    expect(res.status()).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run e2e -- dev-login.spec.ts`
Expected: FAIL — el endpoint no existe (404), las aserciones de 200 fallan.

- [ ] **Step 3: Write minimal implementation**

`src/app/api/auth/dev-login/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getUserByEmail } from '@/lib/auth/users';
import { signSession } from '@/lib/auth/jwt';
import { isDevToolingEnabled } from '@/lib/auth/dev-login';

// POST /api/auth/dev-login  { email, name? }
// Forja una sesión sin pasar por Google. SOLO fuera de producción (guard por VERCEL_ENV).
// Si el email no existe, crea un usuario "pelado" (sin membership) = estado de onboarding.
export async function POST(request: NextRequest) {
  if (!isDevToolingEnabled()) {
    return NextResponse.json({ error: 'No disponible en producción' }, { status: 403 });
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) {
    return NextResponse.json({ error: 'Falta email' }, { status: 400 });
  }

  let user = await getUserByEmail(email);
  if (!user) {
    [user] = await db.insert(users).values({ email }).returning();
  }

  const token = await signSession({ userId: user.id });
  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run e2e -- dev-login.spec.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/dev-login/route.ts e2e/dev-login.spec.ts
git commit -m "feat(dev-login): endpoint POST /api/auth/dev-login (forja sesión, crea user nuevo)"
```

---

## Task 3: Página `/dev-login` (UI)

**Files:**
- Create: `src/app/dev-login/page.tsx`
- Create: `src/app/dev-login/dev-login-form.tsx`
- Test: `e2e/dev-login.spec.ts` (parte 2, UI — añadir al fichero del Task 2)

- [ ] **Step 1: Write the failing test**

Añade al final de `e2e/dev-login.spec.ts`:
```ts
test.describe('dev-login página (UI)', () => {
  test('entrar como usuario existente deja sesión activa', async ({ page }) => {
    await page.goto('/dev-login');
    await expect(page.getByRole('heading', { name: 'Dev login' })).toBeVisible();
    await page.getByRole('button', { name: /pl1@test\.com/ }).click();
    await expect(page).toHaveURL(/\/$/);
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === 'session')).toBe(true);
  });

  test('entrar como nuevo crea el usuario y lo lista al recargar', async ({ page }) => {
    const email = 'nuevo-ui@test.com';
    await page.goto('/dev-login');
    await page.getByLabel('Email nuevo').fill(email);
    await page.getByRole('button', { name: 'Entrar como nuevo' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/dev-login');
    await expect(page.getByRole('button', { name: new RegExp(email) })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run e2e -- dev-login.spec.ts -g "página"`
Expected: FAIL — `/dev-login` da 404 (página no existe), heading no visible.

- [ ] **Step 3: Write minimal implementation**

`src/app/dev-login/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, memberships, groups } from '@/lib/db/schema';
import { isDevToolingEnabled } from '@/lib/auth/dev-login';
import { DevLoginForm } from './dev-login-form';

export const dynamic = 'force-dynamic';

export default async function DevLoginPage() {
  if (!isDevToolingEnabled()) notFound();

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      role: memberships.role,
      groupName: groups.name,
    })
    .from(users)
    .leftJoin(memberships, eq(memberships.userId, users.id))
    .leftJoin(groups, eq(groups.id, memberships.groupId));

  return <DevLoginForm users={rows} />;
}
```

`src/app/dev-login/dev-login-form.tsx`:
```tsx
'use client';
import { useState } from 'react';

type Row = { userId: string; email: string; role: string | null; groupName: string | null };

export function DevLoginForm({ users }: { users: Row[] }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function enter(targetEmail: string) {
    setBusy(true);
    const res = await fetch('/api/auth/dev-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: targetEmail }),
    });
    if (res.ok) {
      window.location.href = '/';
    } else {
      setBusy(false);
      alert('Error en dev-login');
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: '2rem auto', fontFamily: 'sans-serif', padding: '0 1rem' }}>
      <h1>Dev login</h1>
      <p style={{ background: '#fde68a', color: '#000', padding: '0.5rem', borderRadius: 6 }}>
        ⚠️ SOLO ENTORNOS DE PRUEBA. No existe en producción.
      </p>

      <h2>Entrar como usuario existente</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {users.map((u) => (
          <li key={`${u.userId}-${u.groupName ?? ''}`} style={{ marginBottom: 8 }}>
            <button disabled={busy} onClick={() => enter(u.email)}>
              {u.email}
              {u.role ? ` · ${u.role}` : ' · (sin grupo)'}
              {u.groupName ? ` · ${u.groupName}` : ''}
            </button>
          </li>
        ))}
      </ul>

      <h2>Entrar como nuevo</h2>
      <input
        type="email"
        placeholder="nuevo@ejemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Email nuevo"
      />
      <button disabled={busy || !email} onClick={() => enter(email)} style={{ marginLeft: 8 }}>
        Entrar como nuevo
      </button>
    </main>
  );
}
```

Nota: estilos inline a propósito (página solo-dev, sin dependencia del design system). Si prefieres Tailwind, es opcional.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run e2e -- dev-login.spec.ts`
Expected: PASS (todos: API + UI).

- [ ] **Step 5: Commit**

```bash
git add src/app/dev-login/page.tsx src/app/dev-login/dev-login-form.tsx e2e/dev-login.spec.ts
git commit -m "feat(dev-login): página /dev-login con botones (guard notFound en prod)"
```

---

## Task 4: `ensureAuxTables` + refactor global-setup + limpieza JWT

**Files:**
- Create: `src/lib/db/bootstrap.ts`
- Create: `src/lib/db/bootstrap.test.ts`
- Modify: `e2e/global-setup.ts` (reemplazar bloque de DDL aux por `ensureAuxTables`; firmar `{ userId }`)

Extrae **verbatim** el bloque idempotente de `e2e/global-setup.ts` (columnas de players/matches + tablas `player_achievements`, `bets`, `token_ledger`, `rewards`, `redemptions`, `penalties`, `push_subscriptions`) a una función reutilizable.

- [ ] **Step 1: Write the failing test**

`src/lib/db/bootstrap.test.ts`:
```ts
import { createClient } from '@libsql/client';
import { describe, expect, it } from 'vitest';
import { ensureAuxTables } from './bootstrap';

describe('ensureAuxTables', () => {
  it('crea las tablas auxiliares y es idempotente', async () => {
    const client = createClient({ url: ':memory:' });
    // Tablas base mínimas que ensureAuxTables asume existentes (las crea init-db en real).
    await client.execute('CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT)');
    await client.execute('CREATE TABLE matches (id TEXT PRIMARY KEY)');

    await ensureAuxTables(client);
    await ensureAuxTables(client); // 2ª pasada no debe romper

    const t = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN " +
        "('bets','token_ledger','rewards','redemptions','penalties','push_subscriptions','player_achievements')",
    );
    expect(t.rows.length).toBe(7);

    // Las columnas aux de players también se añadieron.
    const cols = await client.execute('PRAGMA table_info(players)');
    const names = cols.rows.map((r) => r.name as string);
    expect(names).toContain('juega_padel');
    expect(names).toContain('token_balance');
  });
});
```
Nota: si `url: ':memory:'` diera error con `@libsql/client`, usa `url: 'file::memory:?cache=shared'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/db/bootstrap.test.ts`
Expected: FAIL — `Cannot find module './bootstrap'`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/db/bootstrap.ts`:
```ts
import type { Client } from '@libsql/client';

/**
 * Crea (idempotente) las tablas y columnas auxiliares que el schema drizzle espera
 * pero que /api/init-db y las migraciones HTTP no crean. Asume que las tablas base
 * (players, matches) ya existen. Tolera columnas/tablas ya presentes.
 * Reutilizado por el global-setup de e2e y por /api/dev/seed-staging.
 */
export async function ensureAuxTables(client: Client): Promise<void> {
  const playerColumns = [
    'is_left_handed INTEGER NOT NULL DEFAULT 0',
    'token_balance INTEGER NOT NULL DEFAULT 0',
    'juega_padel INTEGER NOT NULL DEFAULT 1',
  ];
  for (const col of playerColumns) {
    try { await client.execute(`ALTER TABLE players ADD COLUMN ${col}`); } catch { /* ya existe */ }
  }

  const matchColumns = [
    'time TEXT',
    'team1_player1_side TEXT',
    'team1_player2_side TEXT',
    'team2_player1_side TEXT',
    'team2_player2_side TEXT',
    'photo_url TEXT',
  ];
  for (const col of matchColumns) {
    try { await client.execute(`ALTER TABLE matches ADD COLUMN ${col}`); } catch { /* ya existe */ }
  }

  await client.execute(`CREATE TABLE IF NOT EXISTS player_achievements (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    earned_at TEXT NOT NULL,
    trigger_match_id TEXT
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS bets (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    market TEXT NOT NULL,
    predicted_team INTEGER NOT NULL,
    predicted_score TEXT,
    amount INTEGER NOT NULL,
    odds REAL,
    status TEXT NOT NULL DEFAULT 'open',
    payout INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    settled_at TEXT,
    UNIQUE (match_id, player_id, market)
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS token_ledger (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref_id TEXT,
    balance_after INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (reason, ref_id)
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS rewards (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL DEFAULT 'lomeros',
    title TEXT NOT NULL,
    description TEXT,
    cost INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS redemptions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    reward_id TEXT NOT NULL,
    cost INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS penalties (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    recharge_amount INTEGER NOT NULL DEFAULT 250,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    fulfilled_at TEXT
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/db/bootstrap.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `e2e/global-setup.ts` para usar el helper + firmar `{ userId }`**

5a. Cambia la firma del JWT (la línea ~7) de `{ userId, role }` a `{ userId }`. La función `sessionStorageState` puede mantener su parámetro `role` (ya no se usa en el payload) para no tocar los call sites; o quítalo. Versión mínima — solo el payload:
```ts
// ANTES:
const token = await new SignJWT({ userId, role })
// DESPUÉS:
const token = await new SignJWT({ userId })
```

5b. Añade el import del helper al principio del fichero:
```ts
import { ensureAuxTables } from '../src/lib/db/bootstrap';
```

5c. Reemplaza TODO el bloque de DDL aux (desde el comentario `// Las columnas de players añadidas...` hasta el final del `CREATE TABLE IF NOT EXISTS push_subscriptions (...)`, es decir las líneas que hoy hacen los `ALTER TABLE players`, `ALTER TABLE matches`, y los `CREATE TABLE IF NOT EXISTS` de `player_achievements`/`bets`/`token_ledger`/`rewards`/`redemptions`/`penalties`/`push_subscriptions`) por una sola llamada, justo después de `const db = createClient({ url: TEST_ENV.DB_URL });`:
```ts
  // Tablas/columnas auxiliares que init-db y las migraciones no crean (compartido con seed-staging).
  await ensureAuxTables(db);
```
El resto del global-setup (seed de players, usuarios, memberships, grupo-test, etc.) se mantiene igual.

- [ ] **Step 6: Run full e2e to verify the refactor didn't break the suite**

Run: `npm run e2e`
Expected: PASS — toda la suite verde (incluidos dev-login.spec.ts del Task 2/3). Confirma que el refactor del global-setup es transparente.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/bootstrap.ts src/lib/db/bootstrap.test.ts e2e/global-setup.ts
git commit -m "refactor(e2e): extraer ensureAuxTables (compartido con seed-staging); JWT solo userId"
```

---

## Task 5: Endpoint `POST /api/dev/seed-staging`

**Files:**
- Create: `src/app/api/dev/seed-staging/route.ts`
- Test: `e2e/seed-staging.spec.ts`

Receta = la del global-setup: self-fetch idempotente a `init-db → migrate-auth → migrate-tournaments → migrate-multitenant` (subset suficiente para una app funcional; `migrate-avatars` y `migrate-tournaments-v2` se omiten a propósito: el primero es no-op sin avatares y requiere `?confirm=YES`, el segundo es destructivo y exige admin) + `ensureAuxTables(client)` + siembra del Grupo Demo vía SQL raw.

- [ ] **Step 1: Write the failing test**

`e2e/seed-staging.spec.ts`:
```ts
import { createClient } from '@libsql/client';
import { test, expect } from '@playwright/test';
import { TEST_ENV } from '../playwright.config';

test('seed-staging crea el Grupo Demo y es idempotente', async ({ request }) => {
  const res1 = await request.post('/api/dev/seed-staging');
  expect(res1.status()).toBe(200);
  const j1 = await res1.json();
  expect(j1.ok).toBe(true);
  expect(j1.demoGroup).toBe('grupo-demo');

  // 2ª pasada no rompe.
  const res2 = await request.post('/api/dev/seed-staging');
  expect(res2.status()).toBe(200);

  // Verificación directa en la DB de fichero.
  const db = createClient({ url: TEST_ENV.DB_URL });
  const g = await db.execute({ sql: 'SELECT name FROM groups WHERE id = ?', args: ['grupo-demo'] });
  expect(g.rows.length).toBe(1);
  const pls = await db.execute({
    sql: 'SELECT COUNT(*) AS c FROM players WHERE group_id = ?',
    args: ['grupo-demo'],
  });
  expect(Number(pls.rows[0].c)).toBe(4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run e2e -- seed-staging.spec.ts`
Expected: FAIL — endpoint no existe (404 → status ≠ 200).

- [ ] **Step 3: Write minimal implementation**

`src/app/api/dev/seed-staging/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/lib/db';
import { ensureAuxTables } from '@/lib/db/bootstrap';
import { isDevToolingEnabled } from '@/lib/auth/dev-login';

const DEMO_GROUP_ID = 'grupo-demo';

// POST /api/dev/seed-staging
// Monta el esquema (idempotente) y siembra un "Grupo Demo" sobre una staging fresca.
// SOLO fuera de producción. Reset = recrear la DB Turso + 1 POST aquí.
export async function POST(request: NextRequest) {
  if (!isDevToolingEnabled()) {
    return NextResponse.json({ error: 'No disponible en producción' }, { status: 403 });
  }

  const origin = new URL(request.url).origin;
  const migrations = ['init-db', 'migrate-auth', 'migrate-tournaments', 'migrate-multitenant'];
  const ran: Record<string, number> = {};
  for (const ep of migrations) {
    const res = await fetch(`${origin}/api/${ep}`, { method: 'POST' });
    ran[ep] = res.status;
    if (!res.ok) {
      return NextResponse.json({ error: `Migración ${ep} falló`, ran }, { status: 500 });
    }
  }

  // Tablas/columnas aux que ningún endpoint crea (mismo set que el global-setup de e2e).
  await ensureAuxTables(client);

  // Grupo Demo (id/slug distinto al 'grupo-test' de e2e). SQL raw + INSERT OR IGNORE = idempotente.
  await client.execute({
    sql: 'INSERT OR IGNORE INTO groups (id, slug, name) VALUES (?, ?, ?)',
    args: [DEMO_GROUP_ID, DEMO_GROUP_ID, 'Grupo Demo'],
  });
  const demoAdminId = 'demo-admin';
  await client.execute({
    sql: 'INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)',
    args: [demoAdminId, 'admin@grupo-demo.test'],
  });
  await client.execute({
    sql: 'INSERT OR IGNORE INTO memberships (id, user_id, group_id, role, player_id) VALUES (?, ?, ?, ?, ?)',
    args: ['demo-mb-admin', demoAdminId, DEMO_GROUP_ID, 'admin', null],
  });
  for (let i = 1; i <= 4; i++) {
    await client.execute({
      sql: 'INSERT OR IGNORE INTO players (id, group_id, name) VALUES (?, ?, ?)',
      args: [`demo-pl${i}`, DEMO_GROUP_ID, `Jugador Demo ${i}`],
    });
  }

  return NextResponse.json({ ok: true, ran, demoGroup: DEMO_GROUP_ID });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run e2e -- seed-staging.spec.ts`
Expected: PASS.

- [ ] **Step 5: Confirm el guard de fuga no se dispara**

Run: `npm run check:db-access`
Expected: `✅ Sin acceso directo a tablas tenant raíz en src/app.` (el seed usa SQL raw, no Drizzle, así que no entra en el patrón; no hace falta tocar la allowlist).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/dev/seed-staging/route.ts e2e/seed-staging.spec.ts
git commit -m "feat(seed): endpoint /api/dev/seed-staging (migraciones + Grupo Demo, idempotente)"
```

---

## Task 6: Doc de staging + verificación final

**Files:**
- Create: `docs/dev-staging.md`

- [ ] **Step 1: Write the doc**

`docs/dev-staging.md`:
```markdown
# Entorno de staging y dev tooling (Fase 2 · Tarea 0)

Aísla los previews y el dev local de la base de Lomeros (PRO). Ver el diseño en
`docs/superpowers/specs/2026-06-23-multitenant-fase2-tarea0-design.md`.

## Setup (una vez, en las cuentas del owner)
1. `turso db create lomeros-staging` → obtener URL y token.
2. `vercel env add TURSO_DATABASE_URL preview` / `... development` → URL de staging.
   `vercel env add TURSO_AUTH_TOKEN preview` / `... development` → token de staging.
   (NO tocar el scope Production.)
3. Secretos propios en Preview: `AUTH_SECRET`, `CRON_SECRET`, claves VAPID, token de Blob
   (idealmente un store de Blob separado para no mezclar avatares con PRO).

## Montar/resetear el esquema de staging
- Montar: `curl -X POST https://<preview-url>/api/dev/seed-staging` (idempotente: corre
  init-db + migrate-auth + migrate-tournaments + migrate-multitenant + tablas auxiliares y
  siembra el "Grupo Demo").
- Reset: recrear la DB Turso de staging y volver a hacer el POST.

## Dev-login (probar sin Google)
- Página: `/dev-login` (solo si `VERCEL_ENV !== 'production'`; en prod da 404).
- Botones para entrar como un usuario existente, o un campo para "entrar como nuevo"
  (crea un usuario sin membership = estado de onboarding).
- Endpoint subyacente: `POST /api/auth/dev-login { email }`.

## Dev local contra staging
Tras el paso 2, `vercel env pull .env.local` baja la URL/token de staging (no-sensitive).
`AUTH_SECRET` sigue siendo *sensitive*: ponlo a mano en `.env.local`. Luego `npm run dev` y
usa `/dev-login`.
```

- [ ] **Step 2: Run the FULL verification suite**

Run cada uno y confirma verde:
```bash
npm test            # vitest: dev-login + bootstrap units
npm run e2e         # Playwright: dev-login (API+UI) + seed-staging + suite existente
npm run lint        # eslint sin errores
npm run check:db-access   # guard de fuga
npm run build       # next build compila (página/endpoints nuevos incluidos)
```
Expected: todos OK.

- [ ] **Step 3: Commit**

```bash
git add docs/dev-staging.md
git commit -m "docs(staging): guía de entorno de staging + dev-login + seed"
```

---

## Self-Review (cobertura del spec)

- §3.A Guard `isDevToolingEnabled` → Task 1. ✅
- §3.B Endpoint dev-login (crea user sin membership) → Task 2. ✅
- §3.C Página `/dev-login` (notFound en prod, lista + campo) → Task 3. ✅
- §3.D Endpoint seed-staging (migraciones + Grupo Demo, idempotente, SQL raw) → Task 5. ✅
- §3.E Unit guard (Task 1) + unit ensureAuxTables (Task 4) + e2e dev-login (Task 2/3) + e2e seed (Task 5) + limpieza JWT global-setup (Task 4). ✅
- §3.F Docs → Task 6 (`docs/dev-staging.md`); las memorias externas `local-dev-*` las actualiza el orquestador tras el merge (viven fuera del repo). ✅
- §6 Riesgos: migraciones inline → no se extraen (self-fetch); colisión de seeds → `grupo-demo` ≠ `grupo-test`; guard de fuga → SQL raw lo evita. ✅

## Fuera de alcance (no implementar aquí)
Onboarding self-service, routing `/g/[slug]`, conmutador súper-admin, deuda de `requireAdmin`.
Tareas del owner (turso/vercel env/secretos/Blob) — documentadas en `docs/dev-staging.md`.
```
