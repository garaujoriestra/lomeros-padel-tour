# Onboarding self-service (Tarea 2, beta cerrada) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un súper-admin genera enlaces de invitación firmados; quien recibe uno crea cuenta+grupo self-service, da de alta jugadores con email y el grupo puede jugar (partidos+resultados) bajo `/g/[slug]`.

**Architecture:** Tokens JWT firmados con el `AUTH_SECRET` existente (enlace 7 días, cookie `signup_intent` 30 min) gatean crear-cuenta y crear-grupo. La página `/crear-grupo` bifurca por token/sesión. El admin operativo reutiliza los formularios raíz parametrizados con `groupSlug` (la API ya es group-aware desde el Paso B). Spec: `docs/superpowers/specs/2026-07-12-multitenant-fase2-tarea2-onboarding-design.md`.

**Tech Stack:** Next.js App Router (¡leer `node_modules/next/dist/docs/` antes de tocar rutas!), Drizzle+libsql, jose (JWT), Playwright e2e (`npm run e2e`, DB de fichero aislada), vitest unit.

**Convenciones del repo:** comentarios en español; `npx tsc --noEmit`, `npm run lint`, `npm run check:db-access` deben quedar verdes; e2e con server reutilizable (matar `lsof -ti :3100` + borrar `e2e/test.db` si hay estado raro). NUNCA pushear a main (rama + draft PR al final).

---

### Task 1: Módulo de token de invitación

**Files:**
- Create: `src/lib/onboarding/invite-token.ts`
- Test: `src/lib/onboarding/invite-token.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// src/lib/onboarding/invite-token.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';
import { signInviteToken, verifyInviteToken } from './invite-token';

beforeAll(() => { process.env.AUTH_SECRET = 'test-secret-onboarding'; });
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);

describe('invite-token', () => {
  it('firma y verifica un token válido', async () => {
    const t = await signInviteToken();
    expect(await verifyInviteToken(t)).toBe(true);
  });

  it('rechaza token ausente, vacío o basura', async () => {
    expect(await verifyInviteToken(undefined)).toBe(false);
    expect(await verifyInviteToken('')).toBe(false);
    expect(await verifyInviteToken('garbage')).toBe(false);
  });

  it('rechaza un token caducado', async () => {
    const expired = await new SignJWT({ purpose: 'create-group' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('-1h').sign(key());
    expect(await verifyInviteToken(expired)).toBe(false);
  });

  it('rechaza un token con otro purpose (p.ej. una cookie de sesión)', async () => {
    const wrong = await new SignJWT({ userId: 'u1' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(key());
    expect(await verifyInviteToken(wrong)).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla** — Run: `npx vitest run src/lib/onboarding/invite-token.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementación mínima**

```ts
// src/lib/onboarding/invite-token.ts
import { SignJWT, jwtVerify } from 'jose';

// Enlace de invitación para CREAR GRUPO (beta cerrada): JWT firmado con el AUTH_SECRET
// existente, multiuso, caduca solo a los 7 días (sin env vars que rotar ni tablas).
// El purpose evita que una cookie de sesión u otro JWT del sistema cuele como invitación.
const PURPOSE = 'create-group';
const TTL = '7d';

const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export async function signInviteToken(): Promise<string> {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key());
}

export async function verifyInviteToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return payload.purpose === PURPOSE;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Verificar que pasa** — Run: `npx vitest run src/lib/onboarding/invite-token.test.ts` → PASS (4).

- [ ] **Step 5: Commit** — `git add src/lib/onboarding && git commit -m "feat(onboarding): token de invitación firmado con caducidad de 7 días"`

---

### Task 2: Módulo de intención de registro (cookie `signup_intent`)

**Files:**
- Create: `src/lib/onboarding/signup-intent.ts`
- Test: `src/lib/onboarding/signup-intent.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// src/lib/onboarding/signup-intent.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';
import { signSignupIntent, verifySignupIntent, shouldCreateUser } from './signup-intent';

beforeAll(() => { process.env.AUTH_SECRET = 'test-secret-onboarding'; });
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);

describe('signup-intent', () => {
  it('firma y verifica', async () => {
    expect(await verifySignupIntent(await signSignupIntent())).toBe(true);
  });
  it('rechaza ausente/basura/caducada/otro purpose', async () => {
    expect(await verifySignupIntent(undefined)).toBe(false);
    expect(await verifySignupIntent('x')).toBe(false);
    const expired = await new SignJWT({ purpose: 'signup' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('-1m').sign(key());
    expect(await verifySignupIntent(expired)).toBe(false);
    const wrong = await new SignJWT({ purpose: 'create-group' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30m').sign(key());
    expect(await verifySignupIntent(wrong)).toBe(false);
  });
});

// Decisión pura del callback OAuth: solo se crea cuenta para un email desconocido
// si trae una intención de registro válida (el intercambio con Google no es e2e-able,
// así que esta tabla de verdad es el test de la rama nueva).
describe('shouldCreateUser', () => {
  it('user existente → nunca crear (da igual la cookie)', () => {
    expect(shouldCreateUser({ userExists: true, intentValid: true })).toBe(false);
    expect(shouldCreateUser({ userExists: true, intentValid: false })).toBe(false);
  });
  it('user desconocido → crear SOLO con intención válida', () => {
    expect(shouldCreateUser({ userExists: false, intentValid: true })).toBe(true);
    expect(shouldCreateUser({ userExists: false, intentValid: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npx vitest run src/lib/onboarding/signup-intent.test.ts` → FAIL.

- [ ] **Step 3: Implementación**

```ts
// src/lib/onboarding/signup-intent.ts
import { SignJWT, jwtVerify } from 'jose';

// Cookie firmada que autoriza al callback OAuth a CREAR CUENTA para un email
// desconocido (la deja /crear-grupo tras validar el enlace de invitación).
// NO autoriza crear grupo: eso lo re-valida el POST con el token del enlace.
export const SIGNUP_INTENT_COOKIE = 'signup_intent';
const PURPOSE = 'signup';
const TTL = '30m';

const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export async function signSignupIntent(): Promise<string> {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key());
}

export async function verifySignupIntent(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return payload.purpose === PURPOSE;
  } catch {
    return false;
  }
}

// Pura: tabla de verdad de la rama nueva del callback.
export function shouldCreateUser(input: { userExists: boolean; intentValid: boolean }): boolean {
  return !input.userExists && input.intentValid;
}
```

- [ ] **Step 4: Verificar que pasa** — `npx vitest run src/lib/onboarding/signup-intent.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/lib/onboarding && git commit -m "feat(onboarding): cookie de intención de registro + decisión pura del callback"`

---

### Task 3: `slugFromName` + slug reservado `crear-grupo`

**Files:**
- Modify: `src/lib/groups/resolve-slug.ts` (añadir `'crear-grupo'` a `RESERVED_SLUGS` y la función `slugFromName`)
- Test: `src/lib/groups/resolve-slug.test.ts` (añadir describe; el fichero ya existe — si no existiera, crearlo con este contenido)

- [ ] **Step 1: Test que falla** (añadir al final del test existente)

```ts
import { slugFromName, RESERVED_SLUGS } from './resolve-slug';

describe('slugFromName', () => {
  it('minúsculas, sin acentos, espacios→guiones', () => {
    expect(slugFromName('Panteras Pádel Club')).toBe('panteras-padel-club');
  });
  it('colapsa símbolos y guiones repetidos, recorta extremos', () => {
    expect(slugFromName('  ¡Los + Máquinas! ')).toBe('los-maquinas');
    expect(slugFromName('a---b')).toBe('a-b');
  });
  it('vacío o solo símbolos → cadena vacía (el form no permite enviar)', () => {
    expect(slugFromName('')).toBe('');
    expect(slugFromName('!!!')).toBe('');
  });
  it('crear-grupo está reservado', () => {
    expect(RESERVED_SLUGS.has('crear-grupo')).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npx vitest run src/lib/groups/resolve-slug.test.ts` → FAIL.

- [ ] **Step 3: Implementación** — en `src/lib/groups/resolve-slug.ts`: añadir `'crear-grupo',` a la lista de `RESERVED_SLUGS`, y al final:

```ts
// Deriva un slug editable a partir del nombre del grupo (onboarding): minúsculas,
// sin acentos (NFD), todo lo no [a-z0-9] a guiones, colapsados y sin extremos.
export function slugFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

- [ ] **Step 4: Verificar que pasa** — `npx vitest run src/lib/groups/resolve-slug.test.ts` → PASS. Además `npx playwright test slug-routing --reporter=line` → verde (RESERVED_SLUGS no rompe nada).

- [ ] **Step 5: Commit** — `git add src/lib/groups && git commit -m "feat(onboarding): slugFromName + crear-grupo reservado"`

---

### Task 4: DAL `createGroupWithAdmin`

**Files:**
- Modify: `src/lib/groups/queries.ts` (añadir función)

Sin unit propio (requiere DB): la cubre el e2e de la Task 6. Sigue el patrón DAL del repo.

- [ ] **Step 1: Implementación** — añadir al final de `src/lib/groups/queries.ts` (ajustar imports existentes: necesita `groups`, `memberships` de `@/lib/db/schema`, `db` de `@/lib/db`, `eq` de drizzle-orm — comprobar cuáles ya están importados):

```ts
// Crea un grupo con su primera membership de admin (onboarding). El id = slug,
// como los grupos existentes ('lomeros', 'grupo-test'). Devuelve error legible si
// el slug ya existe (carrera entre el check del form y el INSERT).
export async function createGroupWithAdmin(input: {
  slug: string;
  name: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [existing] = await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, input.slug));
  if (existing) return { ok: false, error: 'Ese nombre corto ya está cogido' };
  await db.insert(groups).values({ id: input.slug, slug: input.slug, name: input.name });
  await db.insert(memberships).values({
    userId: input.userId,
    groupId: input.slug,
    role: 'admin',
    playerId: null,
  });
  return { ok: true };
}
```

Nota: comprobar en `src/lib/db/schema.ts` si `memberships.id` tiene default; si NO lo tiene, añadir `id: crypto.randomUUID(),` al values de memberships (mirar cómo lo hacen otros inserts de memberships, p.ej. `upsertPlayerUser` en `src/lib/auth/users.ts`, y replicarlo).

- [ ] **Step 2: Verificar** — `npx tsc --noEmit` → limpio.

- [ ] **Step 3: Commit** — `git add src/lib/groups/queries.ts && git commit -m "feat(onboarding): createGroupWithAdmin en el DAL de grupos"`

---

### Task 5: Fixture e2e de súper-admin + `POST /api/onboarding/invite-link`

**Files:**
- Modify: `playwright.config.ts` (env `SUPER_ADMIN_EMAILS` en webServer + TEST_ENV)
- Modify: `e2e/global-setup.ts` (user súper-admin + storageState)
- Create: `src/app/api/onboarding/invite-link/route.ts`
- Test: `e2e/onboarding.spec.ts` (primer describe)

- [ ] **Step 1: Fixture.** En `playwright.config.ts`: añadir `const TEST_SUPER_ADMIN_EMAIL = 'sa@test.com';` junto a las otras constantes TEST_*, añadir ` SUPER_ADMIN_EMAILS=${TEST_SUPER_ADMIN_EMAIL}` al `command` del webServer (mismo formato que AUTH_SECRET), y exportarlo en `TEST_ENV` como `SUPER_ADMIN_EMAIL: TEST_SUPER_ADMIN_EMAIL`. En `e2e/global-setup.ts`, junto a los usuarios existentes (patrón de `gtAdminUserId`):

```ts
// Súper-admin (allowlist SUPER_ADMIN_EMAILS del webServer). Sin membership: su poder
// sale del email, no de un rol en DB. Para probar la generación de invitaciones.
const superAdminUserId = 'e2e-super-admin-user';
await db.execute({
  sql: 'INSERT OR IGNORE INTO users (id, email, role) VALUES (?, ?, ?)',
  args: [superAdminUserId, TEST_ENV.SUPER_ADMIN_EMAIL, 'player'],
});
```

y junto a los writeFile de storageState existentes:

```ts
await writeFile('e2e/.auth/super-admin.json', JSON.stringify(await sessionStorageState(superAdminUserId, TEST_ENV.AUTH_SECRET)));
```

- [ ] **Step 2: Test e2e que falla**

```ts
// e2e/onboarding.spec.ts
import { test, expect } from '@playwright/test';
import { SignJWT } from 'jose';
import { TEST_ENV } from '../playwright.config';

const key = new TextEncoder().encode(TEST_ENV.AUTH_SECRET);

test.describe('onboarding · generación de enlace (súper-admin)', () => {
  test('súper-admin genera enlace → 200 con /crear-grupo?t=', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/super-admin.json' });
    const res = await ctx.request.post('/api/onboarding/invite-link');
    expect(res.status()).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toContain('/crear-grupo?t=');
    await ctx.close();
  });

  test('admin normal (Lomeros) → 403', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const res = await ctx.request.post('/api/onboarding/invite-link');
    expect(res.status()).toBe(403);
    await ctx.close();
  });

  test('sin sesión → 401', async ({ request }) => {
    const res = await request.post('/api/onboarding/invite-link');
    expect(res.status()).toBe(401);
  });
});
```

- [ ] **Step 3: Verificar que falla** — `npx playwright test onboarding --reporter=line` → FAIL (404 en la ruta).

- [ ] **Step 4: Implementación**

```ts
// src/app/api/onboarding/invite-link/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { isSuperAdminEmail } from '@/lib/auth/group-context';
import { signInviteToken } from '@/lib/onboarding/invite-token';

// POST /api/onboarding/invite-link — genera un enlace de invitación para crear grupo
// (beta cerrada). SOLO súper-admin (allowlist por env, igual que el resto del sistema).
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!isSuperAdminEmail(session.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const token = await signInviteToken();
  const base = process.env.APP_URL || request.nextUrl.origin;
  return NextResponse.json({ url: `${base}/crear-grupo?t=${token}` });
}
```

- [ ] **Step 5: Verificar que pasa** — `npx playwright test onboarding --reporter=line` → PASS (3).

- [ ] **Step 6: Commit** — `git add playwright.config.ts e2e src/app/api/onboarding && git commit -m "feat(onboarding): endpoint de enlaces de invitación (solo súper-admin) + fixture e2e"`

---

### Task 6: `POST /api/onboarding/create-group`

**Files:**
- Create: `src/app/api/onboarding/create-group/route.ts`
- Test: `e2e/onboarding.spec.ts` (segundo describe)

- [ ] **Step 1: Test e2e que falla** (añadir a `e2e/onboarding.spec.ts`)

```ts
async function inviteToken(exp = '7d') {
  return new SignJWT({ purpose: 'create-group' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(exp).sign(key);
}

test.describe('onboarding · crear grupo (API)', () => {
  // gt-player: cualquier sesión válida puede crear grupo si trae token.
  test.use({ storageState: 'e2e/.auth/gt-player.json' });

  test('token válido + slug libre → 200 y membership admin', async ({ request }) => {
    const slug = `onb-${Date.now()}`;
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'Grupo Onb', slug, t: await inviteToken() },
    });
    expect(res.status()).toBe(200);
    // El creador es admin del grupo nuevo: puede listar sus (0) jugadores como admin.
    const check = await request.get(`/api/tournaments?kind=pozo&g=${slug}`);
    expect(check.status()).toBe(200);
  });

  test('token caducado → 403', async ({ request }) => {
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'X', slug: `onb2-${Date.now()}`, t: await inviteToken('-1h') },
    });
    expect(res.status()).toBe(403);
  });

  test('sin token → 403; slug reservado → 400; slug ocupado → 400; nombre vacío → 400', async ({ request }) => {
    const t = await inviteToken();
    expect((await request.post('/api/onboarding/create-group', { data: { name: 'X', slug: `a-${Date.now()}` } })).status()).toBe(403);
    expect((await request.post('/api/onboarding/create-group', { data: { name: 'X', slug: 'admin', t } })).status()).toBe(400);
    expect((await request.post('/api/onboarding/create-group', { data: { name: 'X', slug: 'grupo-test', t } })).status()).toBe(400);
    expect((await request.post('/api/onboarding/create-group', { data: { name: '  ', slug: `b-${Date.now()}`, t } })).status()).toBe(400);
  });
});

test.describe('onboarding · crear grupo sin sesión', () => {
  test('401', async ({ request }) => {
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'X', slug: 'zz', t: await inviteToken() },
    });
    expect(res.status()).toBe(401);
  });
});
```

Nota: `test.use` dentro de un describe afecta solo a ese describe; el describe "sin sesión" va aparte SIN storageState.

- [ ] **Step 2: Verificar que falla** — `npx playwright test onboarding --reporter=line` → FAIL (404).

- [ ] **Step 3: Implementación**

```ts
// src/app/api/onboarding/create-group/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { verifyInviteToken } from '@/lib/onboarding/invite-token';
import { isValidSlug } from '@/lib/groups/resolve-slug';
import { createGroupWithAdmin } from '@/lib/groups/queries';

// POST /api/onboarding/create-group — { name, slug, t }. Crea grupo + membership admin
// para el usuario con sesión. El token del enlace se RE-valida aquí (la cookie
// signup_intent solo autorizaba crear cuenta, no grupo).
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  if (!(await verifyInviteToken(body.t))) {
    return NextResponse.json(
      { error: 'La invitación no es válida o ha caducado: pide un enlace nuevo' },
      { status: 403 },
    );
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'Nombre corto inválido (minúsculas, números y guiones)' }, { status: 400 });
  }

  const result = await createGroupWithAdmin({ slug, name, userId: session.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, slug });
}
```

- [ ] **Step 4: Verificar que pasa** — `npx playwright test onboarding --reporter=line` → PASS. También `npx vitest run` y `npm run check:db-access` verdes.

- [ ] **Step 5: Commit** — `git add src/app/api/onboarding e2e/onboarding.spec.ts && git commit -m "feat(onboarding): POST create-group con re-validación del token"`

---

### Task 7: Rama de registro en el callback OAuth

**Files:**
- Modify: `src/app/api/auth/callback/route.ts`

La decisión está testeada en unit (Task 2); el intercambio con Google no es e2e-able (consistente con el repo). Cambio quirúrgico.

- [ ] **Step 1: Implementación.** En `src/app/api/auth/callback/route.ts`:

Añadir imports:

```ts
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { SIGNUP_INTENT_COOKIE, verifySignupIntent, shouldCreateUser } from '@/lib/onboarding/signup-intent';
```

Localizar el bloque actual:

```ts
    const user = await getUserByEmail(identity.email);
    if (!user) {
      return NextResponse.redirect(new URL('/unauthorized', base));
    }
```

y sustituirlo por:

```ts
    // Onboarding (beta cerrada): un email desconocido SOLO crea cuenta si trae la
    // cookie de intención que dejó /crear-grupo tras validar el enlace de invitación.
    let user = await getUserByEmail(identity.email);
    let consumedIntent = false;
    if (!user) {
      const intentValid = await verifySignupIntent(request.cookies.get(SIGNUP_INTENT_COOKIE)?.value);
      if (!shouldCreateUser({ userExists: false, intentValid })) {
        return NextResponse.redirect(new URL('/unauthorized', base));
      }
      [user] = await db.insert(users).values({ email: identity.email.toLowerCase() }).returning();
      consumedIntent = true;
    }
```

Y tras crear la respuesta de redirect (donde se hace `res.cookies.set('session', ...)`), añadir:

```ts
    if (consumedIntent) res.cookies.delete(SIGNUP_INTENT_COOKIE); // un solo uso
```

- [ ] **Step 2: Verificar** — `npx tsc --noEmit` limpio; `npx playwright test dev-login home-landing --reporter=line` verde (el camino existente intacto).

- [ ] **Step 3: Commit** — `git add src/app/api/auth/callback/route.ts && git commit -m "feat(onboarding): el callback crea cuenta solo con signup_intent válida"`

---

### Task 8: Página `/crear-grupo` + formulario

**Files:**
- Create: `src/app/crear-grupo/page.tsx`
- Create: `src/components/onboarding/create-group-form.tsx`
- Test: `e2e/onboarding.spec.ts` (describe UI)

- [ ] **Step 1: Test e2e que falla** (añadir a `e2e/onboarding.spec.ts`)

```ts
test.describe('onboarding · página /crear-grupo', () => {
  test('sin token → mensaje de invitación necesaria, sin formulario', async ({ page }) => {
    await page.goto('/crear-grupo');
    await expect(page.getByText(/necesitas una invitación/i).first()).toBeVisible();
    await expect(page.getByLabel(/nombre del grupo/i)).toHaveCount(0);
  });

  test('token válido sin sesión → botón de Google (y deja cookie de intención)', async ({ page }) => {
    await page.goto(`/crear-grupo?t=${await inviteToken()}`);
    await expect(page.getByRole('link', { name: /entrar con google/i }).first()).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === 'signup_intent')).toBe(true);
  });

  test('token válido con sesión → crea el grupo desde la UI y aterriza en su admin', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/gt-player.json' });
    const page = await ctx.newPage();
    const slug = `ui-onb-${Date.now()}`;
    await page.goto(`/crear-grupo?t=${await inviteToken()}`);
    await page.getByLabel(/nombre del grupo/i).fill('Panteras Pádel');
    // El slug se auto-deriva; lo sobreescribimos por unicidad entre runs.
    await page.getByLabel(/nombre corto/i).fill(slug);
    await page.getByRole('button', { name: /crear grupo/i }).click();
    await expect(page).toHaveURL(new RegExp(`/g/${slug}/admin$`));
    await ctx.close();
  });

  test('slug ocupado → error inline sin perder el nombre', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/gt-player.json' });
    const page = await ctx.newPage();
    await page.goto(`/crear-grupo?t=${await inviteToken()}`);
    await page.getByLabel(/nombre del grupo/i).fill('Duplicado');
    await page.getByLabel(/nombre corto/i).fill('grupo-test');
    await page.getByRole('button', { name: /crear grupo/i }).click();
    await expect(page.getByText(/ya está cogido|inválido/i).first()).toBeVisible();
    await expect(page.getByLabel(/nombre del grupo/i)).toHaveValue('Duplicado');
    await ctx.close();
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npx playwright test onboarding --reporter=line` → FAIL (404 de la página).

- [ ] **Step 3: Página (server component)**

```tsx
// src/app/crear-grupo/page.tsx
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { verifyInviteToken } from '@/lib/onboarding/invite-token';
import { SIGNUP_INTENT_COOKIE, signSignupIntent } from '@/lib/onboarding/signup-intent';
import { CreateGroupForm } from '@/components/onboarding/create-group-form';

export const dynamic = 'force-dynamic';

// Onboarding (beta cerrada): página a la que llega un admin invitado con
// /crear-grupo?t=<token firmado>. Tres ramas: sin token válido / sin sesión / form.
export default async function CrearGrupoPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const valid = await verifyInviteToken(t);

  return (
    <main className="screen">
      <div className="lpt-container" style={{ maxWidth: 480, paddingTop: 'calc(40px * var(--sp))' }}>
        <h1 className="sec-title">Crea tu grupo</h1>
        {!valid ? (
          <p className="muted" style={{ marginTop: 12 }}>
            Para crear un grupo necesitas una invitación. Pide un enlace al organizador.
          </p>
        ) : (
          <Gate t={t!} />
        )}
      </div>
    </main>
  );
}

async function Gate({ t }: { t: string }) {
  const session = await getSession();
  if (session) return <CreateGroupForm t={t} />;

  // Sin sesión: dejar la intención de registro para que el callback pueda crear
  // la cuenta, y mandar a Google conservando el token en el retorno.
  const cookieStore = await cookies();
  cookieStore.set(SIGNUP_INTENT_COOKIE, await signSignupIntent(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 60,
    path: '/',
  });
  const from = encodeURIComponent(`/crear-grupo?t=${t}`);
  return (
    <div style={{ marginTop: 12 }}>
      <p className="muted">Entra con tu cuenta de Google para continuar.</p>
      <a className="lpt-btn primary" style={{ marginTop: 16, display: 'inline-flex' }} href={`/api/auth/login?from=${from}`}>
        Entrar con Google
      </a>
    </div>
  );
}
```

GOTCHA Next: comprobar en `node_modules/next/dist/docs/` si un Server Component puede hacer `cookies().set()` en esta versión (en muchas solo se puede en Server Actions/Route Handlers). Si NO se puede: crear `GET /api/onboarding/intent?t=...` (route handler que valida el token, deja la cookie y hace redirect a `/api/auth/login?from=...`) y que el botón «Entrar con Google» apunte ahí. El e2e del Step 1 sigue valiendo (la cookie aparece tras el click en vez de al cargar — ajustar la aserción para hacer el click primero si hace falta).

- [ ] **Step 4: Formulario (client)**

```tsx
// src/components/onboarding/create-group-form.tsx
'use client';
import { useState } from 'react';
import { slugFromName } from '@/lib/groups/resolve-slug';

// Form de creación de grupo. El slug se auto-deriva del nombre pero es editable;
// una vez el usuario lo toca, deja de auto-derivarse.
export function CreateGroupForm({ t }: { t: string }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/onboarding/create-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, t }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      window.location.assign(`/g/${data.slug}/admin`);
    } else {
      setError(data.error ?? 'Error al crear el grupo');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" style={{ marginTop: 16 }}>
      <div>
        <label htmlFor="cg-name" className="small" style={{ fontWeight: 600 }}>Nombre del grupo</label>
        <input
          id="cg-name"
          className="lpt-input"
          value={name}
          required
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugFromName(e.target.value));
          }}
        />
      </div>
      <div>
        <label htmlFor="cg-slug" className="small" style={{ fontWeight: 600 }}>Nombre corto (para la dirección web)</label>
        <input
          id="cg-slug"
          className="lpt-input"
          value={slug}
          required
          onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
        />
        <p className="small muted" style={{ marginTop: 4 }}>Tu grupo vivirá en /g/{slug || '…'}</p>
      </div>
      {error && <p className="small" style={{ color: 'var(--loss-text, var(--loss))' }}>{error}</p>}
      <button type="submit" disabled={busy} className="lpt-btn primary min-h-11">
        Crear grupo
      </button>
    </form>
  );
}
```

GOTCHA estilos: comprobar que las clases `lpt-input`/`lpt-btn` existen (grep en `src/app/globals.css`); si el repo usa otro componente de input (mirar `src/components/admin/player-form.tsx`), replicar ESE patrón. No inventar estilos nuevos.

- [ ] **Step 5: Verificar que pasa** — `npx playwright test onboarding --reporter=line` → PASS.

- [ ] **Step 6: Commit** — `git add src/app/crear-grupo src/components/onboarding e2e && git commit -m "feat(onboarding): página /crear-grupo con las tres ramas"`

---

### Task 9: Bloque de invitaciones en el dashboard (súper-admin)

**Files:**
- Create: `src/components/onboarding/invite-link-card.tsx`
- Modify: `src/components/pages/admin-dashboard-body.tsx`
- Test: `e2e/onboarding.spec.ts`

- [ ] **Step 1: Test e2e que falla**

```ts
test.describe('onboarding · bloque de invitaciones en /admin', () => {
  test('el súper-admin NO ve el bloque bajo un grupo, solo en raíz; el admin normal no lo ve', async ({ browser }) => {
    // Nota: el súper-admin e2e no tiene membership en Lomeros → no pasa el gate de
    // /admin raíz. Para ver el bloque en raíz haría falta ser admin del grupo por
    // defecto Y súper-admin (caso real del dueño). Simulamos con el admin de Lomeros
    // añadido a SUPER_ADMIN_EMAILS: comprobar en playwright.config que la env es
    // `SUPER_ADMIN_EMAILS=sa@test.com,${TEST_ADMIN_EMAIL}` (ajustar Task 5 si no).
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await ctx.newPage();
    await page.goto('/admin');
    await expect(page.getByRole('button', { name: /generar enlace de invitación/i }).first()).toBeVisible();
    const gen = page.getByRole('button', { name: /generar enlace de invitación/i }).first();
    await gen.click();
    await expect(page.getByText(/crear-grupo\?t=/).first()).toBeVisible();
    await ctx.close();
  });

  test('un admin de grupo no súper-admin no ve el bloque', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/gt-admin.json' });
    const page = await ctx.newPage();
    await page.goto('/g/grupo-test/admin');
    await expect(page.getByRole('button', { name: /generar enlace/i })).toHaveCount(0);
    await ctx.close();
  });
});
```

IMPORTANTE (del comentario del test): en la Task 5, la env del webServer debe ser `SUPER_ADMIN_EMAILS=${TEST_SUPER_ADMIN_EMAIL},${TEST_ADMIN_EMAIL}` para que el admin de Lomeros sea también súper-admin (como el dueño real). El test de 403 de la Task 5 usa `gt-admin.json` — REVISAR: la Task 5 lo escribió con `admin.json`; cambiarlo a `gt-admin.json` al hacer esta task (gt-admin no está en la allowlist).

- [ ] **Step 2: Verificar que falla** — `npx playwright test onboarding --reporter=line` → FAIL.

- [ ] **Step 3: Implementación.**

```tsx
// src/components/onboarding/invite-link-card.tsx
'use client';
import { useState } from 'react';

// Tarjeta de súper-admin en el dashboard raíz: genera enlaces de invitación
// para crear grupo (beta cerrada) y los deja listos para copiar.
export function InviteLinkCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    const res = await fetch('/api/onboarding/invite-link', { method: 'POST' });
    if (res.ok) setUrl(((await res.json()) as { url: string }).url);
    setBusy(false);
  }

  return (
    <section className="lpt-card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 className="sec-title" style={{ margin: 0 }}>Invitaciones (beta)</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Genera un enlace para que alguien cree su propio grupo. Caduca a los 7 días.
      </p>
      <button type="button" onClick={generate} disabled={busy} className="lpt-btn primary min-h-11" style={{ alignSelf: 'flex-start' }}>
        Generar enlace de invitación
      </button>
      {url && (
        <input
          readOnly
          value={url}
          aria-label="Enlace de invitación"
          className="lpt-input"
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </section>
  );
}
```

En `src/components/pages/admin-dashboard-body.tsx`: importar `InviteLinkCard` y renderizarla al FINAL del cuerpo solo si `ctx.basePath === '' && ctx.isSuperAdmin` (leer el componente para colocarla tras la última sección; `ctx` es `PageContext` y ya trae `isSuperAdmin`). Mismo gotcha de estilos que la Task 8.

- [ ] **Step 4: Verificar que pasa** — `npx playwright test onboarding --reporter=line` → PASS (incluida la Task 5 ajustada).

- [ ] **Step 5: Commit** — `git add src/components e2e playwright.config.ts && git commit -m "feat(onboarding): tarjeta de invitaciones para el súper-admin en el dashboard"`

---

### Task 10: Alta/edición de jugadores bajo `/g/[slug]/admin`

**Files:**
- Modify: `src/components/admin/player-form.tsx` (prop `groupSlug`)
- Create: `src/app/g/[slug]/admin/players/new/page.tsx`
- Create: `src/app/g/[slug]/admin/players/[id]/edit/page.tsx`
- Modify: `src/components/pages/admin-players-body.tsx` (botones también bajo grupo)
- Test: `e2e/onboarding.spec.ts`

- [ ] **Step 1: Test e2e que falla**

```ts
test.describe('onboarding · alta de jugadores bajo el grupo (gt-admin)', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  test('alta con email desde la UI del grupo → aparece en la lista; el invitado aterriza en el grupo', async ({ page, request }) => {
    const name = `Invitado ${Date.now()}`;
    const email = `inv-${Date.now()}@test.com`;
    await page.goto('/g/grupo-test/admin/players');
    await page.getByRole('link', { name: /nuevo/i }).first().click();
    await expect(page).toHaveURL(/\/g\/grupo-test\/admin\/players\/new$/);
    await page.getByLabel(/nombre/i).first().fill(name);
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /crear|guardar/i }).click();
    await expect(page).toHaveURL(/\/g\/grupo-test\/admin\/players$/);
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();

    // El invitado entra (dev-login) y su grupo-hogar es grupo-test.
    const login = await request.post('/api/auth/dev-login', { data: { email } });
    expect(((await login.json()) as { home: string }).home).toBe('/g/grupo-test/me');
  });

  test('edición: el botón Editar existe bajo grupo y guarda con ?g=', async ({ page }) => {
    await page.goto('/g/grupo-test/admin/players');
    await page.getByLabel(/^Editar a /).first().click();
    await expect(page).toHaveURL(/\/g\/grupo-test\/admin\/players\/.+\/edit$/);
    await page.getByRole('button', { name: /guardar/i }).click();
    await expect(page).toHaveURL(/\/g\/grupo-test\/admin\/players$/);
  });
});
```

GOTCHA labels: leer `src/components/admin/player-form.tsx` para los labels/botones REALES (ajustar los selectores del test a lo que exista — p.ej. el botón puede ser «Crear jugador»/«Guardar cambios»). Nombres únicos por run (server/DB reutilizados).

- [ ] **Step 2: Verificar que falla** — `npx playwright test onboarding --reporter=line` → FAIL (no hay botón Nuevo bajo grupo).

- [ ] **Step 3: `PlayerForm` group-aware.** En `src/components/admin/player-form.tsx`:

1. Props: `export function PlayerForm({ initialData, groupSlug }: PlayerFormProps)` y en la interface `groupSlug?: string;`.
2. Al principio del componente: `const basePath = groupSlug ? `/g/${groupSlug}` : '';`.
3. En `handleSubmit`, el body pasa a incluir el grupo: `body: JSON.stringify(groupSlug ? { ...form, g: groupSlug } : form)`.
4. TODOS los `router.push('/admin/players')` → `` router.push(`${basePath}/admin/players`) `` (hay 2: éxito y botón Cancelar).

(El upload de avatar `/api/upload` es por usuario autenticado, no por grupo: se deja igual.)

- [ ] **Step 4: Páginas nuevas bajo grupo.**

```tsx
// src/app/g/[slug]/admin/players/new/page.tsx
import { PlayerForm } from '@/components/admin/player-form';

export const dynamic = 'force-dynamic';

// Hereda el gate admin-del-grupo del layout de /g/[slug]/admin (Paso 3).
export default async function GroupNewPlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Nuevo jugador</h1>
        <p className="muted text-sm mt-1.5">Añade un nuevo jugador al grupo</p>
      </div>
      <PlayerForm groupSlug={slug} />
    </div>
  );
}
```

```tsx
// src/app/g/[slug]/admin/players/[id]/edit/page.tsx
import { notFound } from 'next/navigation';
import { resolvePageContext } from '@/lib/auth/page-context';
import { getLinkedUserEmail } from '@/lib/auth/users';
import { getPlayerInGroup } from '@/lib/players/queries';
import { PlayerForm } from '@/components/admin/player-form';

export const dynamic = 'force-dynamic';

export default async function GroupEditPlayerPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await resolvePageContext(slug);
  const player = await getPlayerInGroup(ctx.groupId, id);
  if (!player) notFound();
  const email = await getLinkedUserEmail(ctx.groupId, id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Editar jugador</h1>
        <p className="muted text-sm mt-1.5">{player.name}</p>
      </div>
      <PlayerForm initialData={{ ...player, email }} groupSlug={slug} />
    </div>
  );
}
```

- [ ] **Step 5: Botones en la lista.** En `src/components/pages/admin-players-body.tsx`: los enlaces «Nuevo» y «Editar» están gateados con `isRoot` — quitar ese gate para estos botones y prefijar href con `basePath`: `` href={`${basePath}/admin/players/new`} `` y `` href={`${basePath}/admin/players/${player.id}/edit`} ``. Leer el componente: hay DOS enlaces a new (cabecera y empty-state). El botón de borrar ya es group-aware (Paso 3) — no tocar.

- [ ] **Step 6: Verificar que pasa** — `npx playwright test onboarding group-admin --reporter=line` → PASS (ojo: `group-admin.spec.ts` afirma que NO hay botón Nuevo/Editar bajo grupo — **actualizar esas 2 aserciones** de ese spec para afirmar lo contrario ahora que las sub-rutas existen; es cambio de comportamiento intencional de esta task).

- [ ] **Step 7: Commit** — `git add src/components src/app/g e2e && git commit -m "feat(onboarding): alta y edición de jugadores bajo /g/[slug]/admin"`

---

### Task 11: Partido + resultado bajo `/g/[slug]/admin`

**Files:**
- Modify: `src/components/admin/match-form.tsx`, `src/components/admin/result-form.tsx` (prop `groupSlug`)
- Create: `src/app/g/[slug]/admin/matches/new/page.tsx`
- Create: `src/app/g/[slug]/admin/matches/[id]/result/page.tsx`
- Modify: `src/components/pages/admin-matches-body.tsx`
- Test: `e2e/onboarding.spec.ts`

- [ ] **Step 1: Test e2e que falla**

```ts
test.describe('onboarding · partido y resultado bajo el grupo (gt-admin)', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  test('programa un partido y registra el resultado desde la UI del grupo', async ({ page }) => {
    await page.goto('/g/grupo-test/admin/matches');
    await page.getByRole('link', { name: /partido|registrar/i }).first().click();
    await expect(page).toHaveURL(/\/g\/grupo-test\/admin\/matches\/new$/);
    // Leer match-form.tsx para el flujo real de selección (4 jugadores gt-pl* del
    // roster del grupo) y rellenar fecha; el POST debe volver a la lista del grupo.
    // [selectores exactos según el form: completar al implementar]
    // ... seleccionar gt-pl5..gt-pl8, enviar ...
    await expect(page).toHaveURL(/\/g\/grupo-test\/admin\/matches$/);
    // Registrar resultado del partido recién creado:
    await page.getByRole('link', { name: /resultado/i }).first().click();
    await expect(page).toHaveURL(/\/g\/grupo-test\/admin\/matches\/.+\/result$/);
    // ... marcador 6-0 / 6-0, guardar ...
    await expect(page).toHaveURL(/\/g\/grupo-test\/admin\/matches$/);
  });
});
```

NOTA: los `...` de arriba son INACEPTABLES en el spec final del test — al implementar esta task, leer `src/components/admin/match-form.tsx` y `result-form.tsx` y escribir los selectores/pasos reales (como hacen `e2e/matches-scoping.spec.ts` o `edit-result.spec.ts` — MIRAR esos specs primero por si ya existe un helper de creación de partido reutilizable). Usar jugadores gt-pl5..gt-pl8 (los specs de Elo asumen a pl1–pl8 de Lomeros vírgenes; los gt-* no tienen esa restricción, pero comprobar `e2e/animations.spec.ts` por si acaso).

- [ ] **Step 2: Verificar que falla.**

- [ ] **Step 3: `MatchForm` group-aware.** En `src/components/admin/match-form.tsx`:
1. Interface: `groupSlug?: string;` → `export function MatchForm({ players, groupSlug }: ...)`.
2. `const basePath = groupSlug ? `/g/${groupSlug}` : '';`
3. El `fetch('/api/matches', ...)` incluye `g`: body `JSON.stringify(groupSlug ? { ...payload, g: groupSlug } : payload)` (localizar el objeto que se envía, línea ~133).
4. `router.push('/admin/matches')` (×2: éxito y Cancelar) → `` `${basePath}/admin/matches` ``.

- [ ] **Step 4: `ResultForm` group-aware.** En `src/components/admin/result-form.tsx`: mismo patrón — prop `groupSlug`, `basePath`; el PATCH `/api/matches/${matchId}` y el POST `/api/matches/${matchId}/abandon` añaden `g: groupSlug` al body cuando hay slug; los `router.push('/admin/matches')` (×3) usan basePath. (El upload `/api/upload/match-photo` queda igual: requireGroupAdmin sin target = única membership del admin.)

- [ ] **Step 5: Páginas nuevas.**

```tsx
// src/app/g/[slug]/admin/matches/new/page.tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { listPadelPlayers } from '@/lib/players/queries';
import { MatchForm } from '@/components/admin/match-form';

export const dynamic = 'force-dynamic';

export default async function GroupNewMatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  const allPlayers = await listPadelPlayers(ctx.groupId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Registrar partido</h1>
        <p className="muted text-sm mt-1.5">Selecciona los jugadores, asigna equipos e introduce el resultado set a set</p>
      </div>
      {allPlayers.length < 4 ? (
        <div className="text-center py-12 text-ink-3">
          <p className="text-4xl mb-2">⚠️</p>
          <p>Necesitas al menos 4 jugadores para registrar un partido.</p>
        </div>
      ) : (
        <MatchForm players={allPlayers} groupSlug={slug} />
      )}
    </div>
  );
}
```

```tsx
// src/app/g/[slug]/admin/matches/[id]/result/page.tsx
// Copiar la estructura de src/app/admin/matches/[id]/result/page.tsx sustituyendo:
//   const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
// por:
//   const { slug, id } = await params;              // params: Promise<{ slug: string; id: string }>
//   const ctx = await resolvePageContext(slug);
//   const groupId = ctx.groupId;
// y pasando groupSlug={slug} al <ResultForm>. El resto (estados completed/injury,
// pMap, props de ResultForm) IDÉNTICO al original — copiarlo entero, no referenciarlo.
```

(Al implementar: copiar el fichero raíz completo y aplicar esa sustitución; el plan no lo duplica porque el original está en `src/app/admin/matches/[id]/result/page.tsx` y cambia solo eso.)

- [ ] **Step 6: Botones en la lista.** En `src/components/pages/admin-matches-body.tsx`: quitar el gate `isRoot` de los enlaces «Registrar partido»/new (cabecera + empty state) y del botón «Resultado», prefijando con `basePath`. Los enlaces «Lados» y «Editar» SIGUEN solo-raíz (diferidos a Tarea 2b).

- [ ] **Step 7: Verificar** — `npx playwright test onboarding group-admin --reporter=line` → PASS (actualizar la aserción de `group-admin.spec.ts` que afirma que no hay botones de partido bajo grupo: ahora «Resultado» y «Partido» existen; «Lados»/«Editar» siguen sin existir).

- [ ] **Step 8: Commit** — `git add src/components src/app/g e2e && git commit -m "feat(onboarding): partido y resultado bajo /g/[slug]/admin"`

---

### Task 12: Viaje completo, regresión y PR

**Files:**
- Modify: `e2e/onboarding.spec.ts` (viaje completo)
- Modify: `.github/` nada — CI ya corre unit+lint+guard.

- [ ] **Step 1: Test de viaje completo** (la recompensa del onboarding: enlace→grupo→invitar→jugar→aterrizar):

```ts
test.describe('onboarding · viaje completo', () => {
  test('enlace → crear grupo → invitar jugador → el invitado aterriza y ve el grupo', async ({ browser }) => {
    const slug = `viaje-${Date.now()}`;
    const email = `viaje-${Date.now()}@test.com`;

    // 1) El súper-admin genera el enlace (API).
    const sa = await browser.newContext({ storageState: 'e2e/.auth/super-admin.json' });
    const { url } = (await (await sa.request.post('/api/onboarding/invite-link')).json()) as { url: string };
    await sa.close();

    // 2) Un usuario nuevo (dev-login = misma semántica de cuenta que el callback) crea el grupo.
    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await adminPage.goto('/dev-login');
    await adminPage.getByLabel('Email nuevo').fill(`founder-${Date.now()}@test.com`);
    await adminPage.getByRole('button', { name: 'Entrar como nuevo' }).click();
    await adminPage.waitForURL(/\/me$/);
    await adminPage.goto(url.replace(/^https?:\/\/[^/]+/, ''));
    await adminPage.getByLabel(/nombre del grupo/i).fill('Grupo Viaje');
    await adminPage.getByLabel(/nombre corto/i).fill(slug);
    await adminPage.getByRole('button', { name: /crear grupo/i }).click();
    await adminPage.waitForURL(new RegExp(`/g/${slug}/admin$`));

    // 3) Invita a un jugador con email desde su admin.
    await adminPage.goto(`/g/${slug}/admin/players/new`);
    await adminPage.getByLabel(/nombre/i).first().fill('Jugadora Uno');
    await adminPage.getByLabel(/email/i).fill(email);
    await adminPage.getByRole('button', { name: /crear|guardar/i }).click();
    await adminPage.waitForURL(new RegExp(`/g/${slug}/admin/players$`));
    await admin.close();

    // 4) La invitada entra y aterriza en SU grupo con su ficha.
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto('/dev-login');
    await guestPage.getByLabel('Email nuevo').fill(email); // ya existe: dev-login reutiliza
    await guestPage.getByRole('button', { name: 'Entrar como nuevo' }).click();
    await guestPage.waitForURL(new RegExp(`/g/${slug}/me$`));
    await expect(guestPage.getByText('Jugadora Uno').first()).toBeVisible();

    // 5) No-fuga: su home de grupo no lista jugadores de Lomeros.
    await guestPage.goto(`/g/${slug}`);
    await expect(guestPage.getByText('Jugador 1', { exact: true })).toHaveCount(0);
    await guest.close();
  });
});
```

- [ ] **Step 2: Suite completa desde limpio**

```bash
lsof -ti :3100 | xargs kill -9 2>/dev/null; rm -f e2e/test.db
npm run test && npm run lint && npm run check:db-access && npx tsc --noEmit && npm run e2e
```

Expected: todo verde (los flakes conocidos de group-admin/planner ya se endurecieron en el Paso C; si algo falla, correr el spec aislado antes de asumir regresión).

- [ ] **Step 3: Commit final + PR**

```bash
git add -A && git commit -m "test(onboarding): viaje completo enlace→grupo→invitación→aterrizaje"
git push -u origin <rama-del-worktree>
gh pr create --draft --title "feat(multi-tenant): Tarea 2 — onboarding self-service en beta cerrada" --body "(resumen del spec + checklist de verificación)"
```

---

## Self-review del plan (hecho al escribirlo)

- **Cobertura del spec:** §1→T5+T9 · §2→T1,T2,T7,T8 · §3→T3,T4,T6,T8 · §4→T10 (test de aterrizaje) · §5→T10,T11 · §6→repartido (tests 401/403/400, cookie un solo uso T7, doble validación T6) · §8→T1-T3 unit, T5-T12 e2e. §7 (Tarea 2b) queda fuera a propósito.
- **Tipos consistentes:** `signInviteToken()/verifyInviteToken(bool)`, `signSignupIntent()/verifySignupIntent(bool)/shouldCreateUser(bool)`, `slugFromName(string)`, `createGroupWithAdmin({slug,name,userId})→{ok}|{ok:false,error}`, prop `groupSlug?: string` en los 3 forms.
- **Riesgos señalados en el propio plan:** cookies().set en Server Component (T8, con plan B), labels reales de los forms (T10/T11), aserciones de group-admin.spec que cambian de signo (T10/T11), allowlist e2e con el admin de Lomeros (T9 corrige T5).
