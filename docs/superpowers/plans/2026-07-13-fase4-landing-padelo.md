# Fase 4 · Landing de Padelo + alta abierta — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar la landing pública de Padelo en `/padelo` (marca de plataforma), con CTA «Crea tu grupo gratis» que funciona de verdad porque se abre el alta self-serve tras login Google, más legal mínima y su cobertura de tests.

**Architecture:** Todo lo nuevo son superficies de PLATAFORMA (marca Padelo), rutas top-level (`/padelo`, `/legal/*`) que NO heredan el chrome del app (`(public)/layout.tsx` con Navbar+BottomNav). El alta se gobierna con un flag `PUBLIC_SIGNUP_ENABLED` (ON por defecto) leído en tres puntos del funnel existente (crear-grupo page, intent route, create-group route); el camino de invitación firmada sigue como respaldo. El diseño visual reutiliza los tokens del app (lima/verde/Barlow) y se dirige con taste-skill + se audita con impeccable.

**Tech Stack:** Next 16.2.2 (App Router, RSC), React 19, Tailwind v4 (CSS-first, tokens en `globals.css`), next-themes (dark por defecto), next/font (Archivo + Barlow Condensed), drizzle-orm (SQLite/Turso), jose (JWT), Vitest (unit, `src/**/*.test.ts`, env node), Playwright (e2e, puerto 3100, DB de fichero aislada, sesiones forjadas).

**Preflight (una vez, antes de la Tarea 1):**
```bash
cd /Users/gar/Personal/ClaudeCode/lomeros-padel-tour/.claude/worktrees/fase4-landing-padelo
npm install
npx playwright install chromium   # si no está
```
Verificación de estado base:
```bash
npm test          # vitest run — debe pasar en verde antes de empezar
```

**Convenciones de este plan:**
- Typecheck: no hay script; usar `npx tsc --noEmit`.
- Cada tarea termina en commit. Mensajes en español, prefijo `feat(fase4)` / `test(fase4)` / `fix(fase4)`.
- No añadir el sufijo Co-Authored-By en los commits de tareas (lo pone el commit final de PR).

---

## Task 1: Flag `isPublicSignupEnabled()` + cap por cuenta

**Files:**
- Create: `src/lib/onboarding/public-signup.ts`
- Test: `src/lib/onboarding/public-signup.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/onboarding/public-signup.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isPublicSignupEnabled, MAX_GROUPS_PER_ADMIN } from './public-signup';

afterEach(() => vi.unstubAllEnvs());

describe('isPublicSignupEnabled (alta abierta; ON por defecto)', () => {
  it('sin variable → true (abierto)', () => {
    vi.stubEnv('PUBLIC_SIGNUP_ENABLED', '');
    expect(isPublicSignupEnabled()).toBe(true);
  });
  it("valor 'false' → false (cerrado, solo invitación)", () => {
    vi.stubEnv('PUBLIC_SIGNUP_ENABLED', 'false');
    expect(isPublicSignupEnabled()).toBe(false);
  });
  it("cualquier otro valor → true", () => {
    vi.stubEnv('PUBLIC_SIGNUP_ENABLED', 'true');
    expect(isPublicSignupEnabled()).toBe(true);
  });
  it('el cap por cuenta es un entero positivo', () => {
    expect(Number.isInteger(MAX_GROUPS_PER_ADMIN)).toBe(true);
    expect(MAX_GROUPS_PER_ADMIN).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/onboarding/public-signup.test.ts`
Expected: FAIL — `Cannot find module './public-signup'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/onboarding/public-signup.ts
// Alta self-serve abierta por defecto. PUBLIC_SIGNUP_ENABLED=false vuelve a
// "solo invitación firmada" en runtime (kill-switch, sin redeploy ni rediseño).
export function isPublicSignupEnabled(): boolean {
  return process.env.PUBLIC_SIGNUP_ENABLED !== 'false';
}

// Guard anti-abuso del alta abierta: nº máximo de grupos que una misma cuenta
// puede crear. No es gambling ni negocio crítico; es un tope anti-runaway apoyado
// en que crear exige cuenta Google real. El camino de invitación firmada lo ignora.
export const MAX_GROUPS_PER_ADMIN = 5;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/onboarding/public-signup.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/public-signup.ts src/lib/onboarding/public-signup.test.ts
git commit -m "feat(fase4): flag PUBLIC_SIGNUP_ENABLED (ON por defecto) + cap por cuenta"
```

---

## Task 2: Query `countGroupsAdminedBy(userId)`

Cuenta cuántos grupos administra un usuario (para el cap). Es una query a DB → se
verifica vía e2e en la Tarea 4 (Vitest aquí es env node sin DB). Aquí solo se añade
el helper siguiendo el estilo del fichero.

**Files:**
- Modify: `src/lib/groups/queries.ts` (añadir la función y, si falta, `count` al import de `drizzle-orm`)

- [ ] **Step 1: Add the helper**

Al final de `src/lib/groups/queries.ts`, reutilizando el `db` y el schema
`memberships` que el fichero ya importa (el mismo que usa `createGroupWithAdmin`).
Asegúrate de que `count`, `and` y `eq` están en el import de `drizzle-orm` (añade lo que falte):

```ts
// Nº de grupos que este usuario administra (rol admin). Para el cap del alta abierta.
export async function countGroupsAdminedBy(userId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.role, 'admin')));
  return Number(rows[0]?.n ?? 0);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores (si `count`/`and`/`eq` faltaban en el import, el error lo dice; añádelos).

- [ ] **Step 3: Commit**

```bash
git add src/lib/groups/queries.ts
git commit -m "feat(fase4): countGroupsAdminedBy(userId) para el cap del alta abierta"
```

---

## Task 3: e2e en modo abierto — configurar el servidor de pruebas + actualizar specs de onboarding existentes

Abrir el alta cambia el contrato del funnel: el servidor e2e pasará a modo abierto y los
tests que asumían «sin token → bloqueado» dejan de valer. Este paso lo alinea ANTES de
tocar las rutas, para tener una base roja→verde honesta.

**Files:**
- Modify: `playwright.config.ts` (añadir `PUBLIC_SIGNUP_ENABLED=true` al `webServer.command`)
- Modify: `e2e/onboarding.spec.ts` (actualizar aserciones de beta cerrada)

- [ ] **Step 1: Poner el servidor e2e en modo abierto**

En `playwright.config.ts`, dentro de `webServer.command`, añade `PUBLIC_SIGNUP_ENABLED=true`
junto a las demás env (justo antes de `BILLING_ENABLED=true`). El fragmento queda:

```
... SUPER_ADMIN_EMAILS=${TEST_SUPER_ADMIN_EMAIL},${TEST_ADMIN_EMAIL} PUBLIC_SIGNUP_ENABLED=true BILLING_ENABLED=true STRIPE_WEBHOOK_SECRET=${TEST_STRIPE_WEBHOOK_SECRET} npm run dev:e2e
```

- [ ] **Step 2: Localizar las aserciones a actualizar**

Run: `grep -nE "crear-grupo|create-group|invite|intent|invitación|sin token|403" e2e/onboarding.spec.ts`
Lee el fichero completo. Identifica los tests cuyo contrato cambia con el alta abierta:
- Cualquier test que espere que **crear sin token válido** falle (403 / mensaje «necesitas una invitación» / callejón sin salida) — en modo abierto eso ahora se PERMITE.
- El happy-path con token válido → sigue valiendo (el token es respaldo; sigue creando).

- [ ] **Step 3: Actualizar las aserciones de beta cerrada**

Para cada test que asumía token-obligatorio, reescríbelo al contrato abierto. Patrones:
- «`/crear-grupo` sin token → mensaje de invitación» ⟶ ahora `/crear-grupo` sin sesión
  muestra «Entrar con Google»; con sesión muestra el formulario. Ajusta el `expect`.
- «`POST /create-group` con token inválido → 403» ⟶ con sesión y alta abierta ahora
  devuelve 200 aunque el token sea inválido/ausente. Convierte la aserción o elimina el
  test si queda redundante con los nuevos de la Tarea 4.
- Mantén intactos: «sin sesión → 401» y «token válido + slug libre → 200».

Deja un comentario en cada cambio: `// Fase 4: alta abierta — el token deja de ser obligatorio`.

- [ ] **Step 4: Verificar que la suite de onboarding queda coherente (aún NO existen las rutas nuevas; correrá en la Tarea 4)**

Run: `npx tsc --noEmit`
Expected: sin errores de tipos en el spec.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e/onboarding.spec.ts
git commit -m "test(fase4): servidor e2e en modo alta abierta + actualiza specs de onboarding"
```

---

## Task 4: Abrir la ruta `POST /api/onboarding/create-group`

**Files:**
- Modify: `src/app/api/onboarding/create-group/route.ts`
- Test: `e2e/landing-padelo.spec.ts` (crear el fichero con los primeros tests de alta abierta)

- [ ] **Step 1: Write the failing e2e tests**

Crea `e2e/landing-padelo.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// Reutiliza el patrón dev-login de onboarding.spec: cada test mint una cuenta fresca.
async function loginFresh(request: import('@playwright/test').APIRequestContext, tag: string) {
  const email = `padelo-${tag}-${Date.now()}@test.com`;
  const res = await request.post('/api/auth/dev-login', { data: { email } });
  expect(res.status()).toBe(200);
}

test.describe('alta abierta (create-group)', () => {
  test('con sesión y SIN token → 200 y crea el grupo', async ({ request }) => {
    await loginFresh(request, 'open');
    const slug = `open-${Date.now()}`;
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'Grupo Abierto', slug }, // <-- sin `t`
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).slug).toBe(slug);
  });

  test('sin sesión → 401', async ({ request }) => {
    // request sin dev-login: contexto nuevo por test en Playwright, sin cookie de sesión
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'X', slug: `nope-${Date.now()}` },
    });
    expect(res.status()).toBe(401);
  });

  test('cap por cuenta: al superar el máximo → 429', async ({ request }) => {
    await loginFresh(request, 'cap');
    // MAX_GROUPS_PER_ADMIN = 5. Creamos 5 OK y el 6º debe fallar.
    for (let i = 0; i < 5; i++) {
      const res = await request.post('/api/onboarding/create-group', {
        data: { name: `Cap ${i}`, slug: `cap-${i}-${Date.now()}` },
      });
      expect(res.status()).toBe(200);
    }
    const over = await request.post('/api/onboarding/create-group', {
      data: { name: 'Cap 6', slug: `cap-6-${Date.now()}` },
    });
    expect(over.status()).toBe(429);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test e2e/landing-padelo.spec.ts -g "create-group"`
Expected: FAIL — «con sesión y sin token» da 403 (token aún obligatorio) y el cap no existe.

- [ ] **Step 3: Implement — modify the route**

Reemplaza `src/app/api/onboarding/create-group/route.ts` por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { verifyInviteToken } from '@/lib/onboarding/invite-token';
import { isPublicSignupEnabled, MAX_GROUPS_PER_ADMIN } from '@/lib/onboarding/public-signup';
import { isValidGroupSlug } from '@/lib/groups/resolve-slug';
import { createGroupWithAdmin, countGroupsAdminedBy } from '@/lib/groups/queries';

// POST /api/onboarding/create-group — { name, slug, t? }. Crea grupo + membership admin
// para el usuario con sesión. Con el alta ABIERTA (PUBLIC_SIGNUP_ENABLED) el token deja
// de ser obligatorio; si viene y es válido, también vale (respaldo de la beta cerrada).
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const tokenOk = await verifyInviteToken(body.t);
  if (!tokenOk && !isPublicSignupEnabled()) {
    return NextResponse.json(
      { error: 'La invitación no es válida o ha caducado: pide un enlace nuevo' },
      { status: 403 },
    );
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  if (name.length > 80) {
    return NextResponse.json({ error: 'El nombre es demasiado largo (máx. 80)' }, { status: 400 });
  }
  if (!isValidGroupSlug(slug)) {
    return NextResponse.json({ error: 'Nombre corto inválido (minúsculas, números y guiones)' }, { status: 400 });
  }
  if (slug.length > 40) {
    return NextResponse.json({ error: 'Nombre corto demasiado largo (máx. 40)' }, { status: 400 });
  }

  // Cap anti-abuso: solo cuando el alta se apoya en el modo abierto (sin token de
  // admin). El camino de invitación firmada es de confianza y no cuenta contra el tope.
  if (!tokenOk) {
    const owned = await countGroupsAdminedBy(session.userId);
    if (owned >= MAX_GROUPS_PER_ADMIN) {
      return NextResponse.json(
        { error: 'Has alcanzado el máximo de grupos por cuenta' },
        { status: 429 },
      );
    }
  }

  const result = await createGroupWithAdmin({ slug, name, userId: session.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, slug });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test e2e/landing-padelo.spec.ts -g "create-group"`
Expected: PASS (3 tests: 200 sin token, 401 sin sesión, 429 por cap).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/onboarding/create-group/route.ts e2e/landing-padelo.spec.ts
git commit -m "feat(fase4): create-group acepta alta abierta (sin token) con cap por cuenta"
```

---

## Task 5: Abrir la ruta `GET /api/onboarding/intent`

En modo abierto, un organizador nuevo debe poder crear cuenta al loguearse; eso exige la
cookie `signup_intent`. La ruta `intent` la deja, pero hoy requiere token. Se abre igual.

**Files:**
- Modify: `src/app/api/onboarding/intent/route.ts`
- Test: `e2e/landing-padelo.spec.ts` (añadir bloque)

- [ ] **Step 1: Write the failing e2e test** (añádelo a `e2e/landing-padelo.spec.ts`)

```ts
test.describe('alta abierta (intent)', () => {
  test('sin token, alta abierta → 307 a login y deja cookie signup_intent', async ({ page }) => {
    const res = await page.request.get('/api/onboarding/intent', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()['location']).toContain('/api/auth/login?from=');
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === 'signup_intent')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test e2e/landing-padelo.spec.ts -g "intent"`
Expected: FAIL — sin token la ruta redirige a `/crear-grupo` (no a login) y no deja cookie.

- [ ] **Step 3: Implement — modify the route**

Reemplaza `src/app/api/onboarding/intent/route.ts` por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyInviteToken } from '@/lib/onboarding/invite-token';
import { isPublicSignupEnabled } from '@/lib/onboarding/public-signup';
import { SIGNUP_INTENT_COOKIE, signSignupIntent } from '@/lib/onboarding/signup-intent';

// GET /api/onboarding/intent?t=<invite-token opcional> — deja la cookie signup_intent
// (autoriza crear cuenta para un email desconocido) y redirige a Google conservando el
// retorno a /crear-grupo. Con el alta ABIERTA el token es opcional; en beta cerrada,
// sin token válido, se vuelve a /crear-grupo (callejón sin salida controlado).
export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get('t');
  const tokenOk = await verifyInviteToken(t);
  if (!tokenOk && !isPublicSignupEnabled()) {
    return NextResponse.redirect(new URL('/crear-grupo', request.url));
  }

  const from = encodeURIComponent(tokenOk && t ? `/crear-grupo?t=${t}` : '/crear-grupo');
  const res = NextResponse.redirect(new URL(`/api/auth/login?from=${from}`, request.url));
  res.cookies.set(SIGNUP_INTENT_COOKIE, await signSignupIntent(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 60,
    path: '/',
  });
  return res;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test e2e/landing-padelo.spec.ts -g "intent"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/onboarding/intent/route.ts e2e/landing-padelo.spec.ts
git commit -m "feat(fase4): intent permite alta abierta (token opcional) para crear cuenta al loguear"
```

---

## Task 6: `/crear-grupo` con ramas de alta abierta + formulario con token opcional

**Files:**
- Modify: `src/components/onboarding/create-group-form.tsx` (prop `t` opcional; enviar `t` solo si existe)
- Modify: `src/app/crear-grupo/page.tsx` (ramas: alta abierta vs invitación)
- Test: `e2e/landing-padelo.spec.ts` (añadir bloque UI)

- [ ] **Step 1: Write the failing e2e test** (añádelo a `e2e/landing-padelo.spec.ts`)

```ts
async function loginFreshPage(page: import('@playwright/test').Page, tag: string) {
  const email = `padelo-ui-${tag}-${Date.now()}@test.com`;
  const res = await page.request.post('/api/auth/dev-login', { data: { email } });
  expect(res.status()).toBe(200);
}

test.describe('alta abierta (UI /crear-grupo)', () => {
  test('con sesión y sin token → formulario visible; crea y aterriza en su admin', async ({ page }) => {
    const slug = `ui-open-${Date.now()}`;
    await loginFreshPage(page, 'open');
    await page.goto('/crear-grupo'); // <-- sin ?t=
    await page.getByLabel(/nombre del grupo/i).fill('Panteras Abiertas');
    await page.getByLabel(/nombre corto/i).fill(slug);
    await page.getByRole('button', { name: /crear grupo/i }).click();
    await expect(page).toHaveURL(new RegExp(`/g/${slug}/admin$`));
  });

  test('sin sesión y sin token → botón "Entrar con Google" a la ruta intent', async ({ page }) => {
    await page.goto('/crear-grupo');
    const link = page.getByRole('link', { name: /entrar con google/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/api/onboarding/intent');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test e2e/landing-padelo.spec.ts -g "UI /crear-grupo"`
Expected: FAIL — hoy sin token se muestra «necesitas una invitación».

- [ ] **Step 3a: Implement — form con token opcional**

En `src/components/onboarding/create-group-form.tsx`:
- Cambia la firma del componente a `{ t }: { t?: string }`.
- En el `fetch`, envía `t` solo si existe. Sustituye la línea `body`:

```tsx
        body: JSON.stringify({ name, slug, ...(t ? { t } : {}) }),
```

- [ ] **Step 3b: Implement — página con ramas de alta abierta**

Reemplaza `src/app/crear-grupo/page.tsx` por:

```tsx
import { getSession } from '@/lib/auth/session';
import { verifyInviteToken } from '@/lib/onboarding/invite-token';
import { isPublicSignupEnabled } from '@/lib/onboarding/public-signup';
import { CreateGroupForm } from '@/components/onboarding/create-group-form';

export const dynamic = 'force-dynamic';

// Onboarding. Alta ABIERTA (PUBLIC_SIGNUP_ENABLED): cualquier usuario logueado crea grupo.
// Respaldo de beta cerrada: enlace /crear-grupo?t=<token firmado>. Ramas: no permitido /
// sin sesión / formulario.
export default async function CrearGrupoPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const tokenValid = await verifyInviteToken(t);
  const allowed = tokenValid || isPublicSignupEnabled();

  return (
    <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: 'var(--hero-bg)' }}>
      <div className="lpt-card card-pad w-full max-w-sm">
        <h1 className="display" style={{ fontSize: 26, margin: 0 }}>Crea tu grupo</h1>
        {!allowed ? (
          <p className="small muted" style={{ marginTop: 12 }}>
            Para crear un grupo necesitas una invitación. Pide un enlace al organizador.
          </p>
        ) : (
          <Gate t={tokenValid ? t : undefined} />
        )}
      </div>
    </div>
  );
}

async function Gate({ t }: { t?: string }) {
  const session = await getSession();
  if (session) return <CreateGroupForm t={t} />;

  // Sin sesión: el botón pasa por /api/onboarding/intent (Route Handler) para dejar la
  // cookie signup_intent y redirigir a Google conservando el retorno. En alta abierta va
  // sin token; con invitación conserva el token.
  const href = t ? `/api/onboarding/intent?t=${t}` : '/api/onboarding/intent';
  return (
    <div style={{ marginTop: 12 }}>
      <p className="small muted">Entra con tu cuenta de Google para continuar.</p>
      <a className="lpt-btn primary" style={{ width: '100%', marginTop: 16 }} href={href}>
        Entrar con Google
      </a>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test e2e/landing-padelo.spec.ts -g "UI /crear-grupo"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/create-group-form.tsx src/app/crear-grupo/page.tsx
git commit -m "feat(fase4): /crear-grupo abre el alta self-serve (formulario sin token)"
```

---

## Task 7: Layout de marketing + footer + páginas legales

**Files:**
- Create: `src/app/padelo/layout.tsx`
- Create: `src/components/marketing/site-footer.tsx`
- Create: `src/app/legal/layout.tsx`
- Create: `src/app/legal/privacidad/page.tsx`
- Create: `src/app/legal/terminos/page.tsx`
- Test: `e2e/landing-padelo.spec.ts` (añadir bloque legal/footer)

- [ ] **Step 1: Write the failing e2e test** (añádelo a `e2e/landing-padelo.spec.ts`)

```ts
test.describe('legal + footer', () => {
  test('/legal/privacidad y /legal/terminos renderizan', async ({ page }) => {
    await page.goto('/legal/privacidad');
    await expect(page.getByRole('heading', { name: /privacidad/i })).toBeVisible();
    await page.goto('/legal/terminos');
    await expect(page.getByRole('heading', { name: /términos/i })).toBeVisible();
  });

  test('el footer de /padelo enlaza la legal', async ({ page }) => {
    await page.goto('/padelo');
    await expect(page.getByRole('contentinfo').getByRole('link', { name: /privacidad/i })).toHaveAttribute('href', '/legal/privacidad');
    await expect(page.getByRole('contentinfo').getByRole('link', { name: /términos/i })).toHaveAttribute('href', '/legal/terminos');
  });
});
```

(El test del footer pasará al completar la Tarea 8, que crea `/padelo`. El de legal pasa ya.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test e2e/landing-padelo.spec.ts -g "legal"`
Expected: FAIL — 404 en `/legal/*`.

- [ ] **Step 3a: Site footer**

```tsx
// src/components/marketing/site-footer.tsx
import Link from 'next/link';
import { PLATFORM_NAME } from '@/lib/groups/constants';

export function SiteFooter() {
  return (
    <footer role="contentinfo" style={{ borderTop: '1px solid var(--line)', marginTop: 'calc(34px * var(--sp))' }}>
      <div className="lpt-container" style={{ padding: '24px 20px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="small muted">© {PLATFORM_NAME}</span>
        <nav style={{ display: 'flex', gap: 18 }}>
          <Link className="small" href="/legal/privacidad" style={{ color: 'var(--ink-2)' }}>Privacidad</Link>
          <Link className="small" href="/legal/terminos" style={{ color: 'var(--ink-2)' }}>Términos</Link>
          <Link className="small" href="/" style={{ color: 'var(--ink-2)' }}>Ver un tour en marcha</Link>
        </nav>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3b: Marketing layout** (header con wordmark Padelo + CTA; SIN Navbar/BottomNav del app)

```tsx
// src/app/padelo/layout.tsx
import Link from 'next/link';
import Crest from '@/components/shared/crest';
import { PLATFORM_NAME } from '@/lib/groups/constants';
import { SiteFooter } from '@/components/marketing/site-footer';

export default function PadeloLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header style={{ position: 'sticky', top: 0, zIndex: 20, backdropFilter: 'blur(12px)', background: 'color-mix(in oklab, var(--bg) 86%, transparent)', borderBottom: '1px solid var(--line)' }}>
        <div className="lpt-container" style={{ height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/padelo" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Crest size={26} wordmark={false} title={PLATFORM_NAME} />
            <span className="display" style={{ fontSize: 20 }}>{PLATFORM_NAME}</span>
          </Link>
          <Link className="lpt-btn primary" href="/crear-grupo" style={{ minHeight: 40 }}>Crea tu grupo</Link>
        </div>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 3c: Legal layout** (prosa legible, sin chrome del app)

```tsx
// src/app/legal/layout.tsx
import Link from 'next/link';
import { PLATFORM_NAME } from '@/lib/groups/constants';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      <header style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="lpt-container" style={{ height: 58, display: 'flex', alignItems: 'center' }}>
          <Link href="/padelo" className="display" style={{ fontSize: 20 }}>{PLATFORM_NAME}</Link>
        </div>
      </header>
      <main className="lpt-container" style={{ maxWidth: 720, padding: '32px 20px 64px', lineHeight: 1.6 }}>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3d: Legal pages**

```tsx
// src/app/legal/privacidad/page.tsx
import type { Metadata } from 'next';
import { PLATFORM_NAME } from '@/lib/groups/constants';

export const metadata: Metadata = { title: `Privacidad · ${PLATFORM_NAME}` };

export default function PrivacidadPage() {
  return (
    <article>
      <h1 className="display" style={{ fontSize: 30 }}>Privacidad</h1>
      <p className="small muted" style={{ marginTop: 4 }}>Aviso mínimo de la beta. No es asesoría legal.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Qué guardamos</h2>
      <p>Tu cuenta de Google (nombre, email y foto que Google comparte al iniciar sesión) y los
        datos de juego de tu grupo que tú y tu peña introducís: partidos, resultados, rankings,
        logros, disponibilidad y las fichas de La Timba.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Para qué</h2>
      <p>Solo para hacer funcionar {PLATFORM_NAME}: mostrar el ranking, el historial y las apuestas
        de tu grupo. No vendemos tus datos ni los usamos para publicidad de terceros.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>La Timba</h2>
      <p>Las apuestas de La Timba usan fichas de juego sin ningún valor monetario. No es dinero real
        ni hay premios en metálico.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Tus datos y contacto</h2>
      <p>Puedes pedir la baja de tu grupo o la eliminación de tus datos escribiendo al organizador
        de tu grupo o a quien gestiona {PLATFORM_NAME}.</p>
    </article>
  );
}
```

```tsx
// src/app/legal/terminos/page.tsx
import type { Metadata } from 'next';
import { PLATFORM_NAME } from '@/lib/groups/constants';

export const metadata: Metadata = { title: `Términos · ${PLATFORM_NAME}` };

export default function TerminosPage() {
  return (
    <article>
      <h1 className="display" style={{ fontSize: 30 }}>Términos de uso</h1>
      <p className="small muted" style={{ marginTop: 4 }}>Condiciones mínimas de la beta. No es asesoría legal.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Qué es {PLATFORM_NAME}</h2>
      <p>Una herramienta gratuita para llevar el ranking, los partidos y las apuestas con fichas de
        tu grupo de pádel. Se ofrece «tal cual», sin garantías, durante la beta.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Uso responsable</h2>
      <p>Creas tu grupo con tu cuenta de Google y eres responsable de a quién invitas y de los datos
        que introducís. No uses la plataforma para nada ilegal ni para acosar a otras personas.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Fichas, no dinero</h2>
      <p>La Timba funciona con fichas de juego sin valor monetario. No es una casa de apuestas ni hay
        transacciones con dinero real entre jugadores.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Pase de Temporada</h2>
      <p>Todo lo funcional es gratis. El Pase de Temporada (opcional) solo desbloquea la identidad
        visual de tu grupo (nombre, logo y colores propios) y se paga vía Stripe.</p>
    </article>
  );
}
```

- [ ] **Step 4: Run to verify legal passes**

Run: `npx playwright test e2e/landing-padelo.spec.ts -g "legal"`
Expected: el test de `/legal/*` PASA; el del footer de `/padelo` seguirá fallando hasta la Tarea 8.

- [ ] **Step 5: Commit**

```bash
git add src/app/padelo/layout.tsx src/components/marketing/site-footer.tsx src/app/legal
git commit -m "feat(fase4): layout de marketing + footer + legal mínima (privacidad/términos)"
```

---

## Task 8: La landing `/padelo` — estructura, secciones, metadata, CTAs

Implementación funcional y on-token de las 8 secciones. El pulido visual fino (escala de
tipos, motion, referencias) llega en la Tarea 10 (taste-skill); aquí se deja una base
correcta, accesible y verificable.

**Files:**
- Create: `src/components/marketing/marketing-section.tsx` (primitiva: kicker + título display + contenido)
- Create: `src/app/padelo/page.tsx`
- Test: `e2e/landing-padelo.spec.ts` (añadir bloque landing)

- [ ] **Step 1: Write the failing e2e test** (añádelo a `e2e/landing-padelo.spec.ts`)

```ts
test.describe('landing /padelo', () => {
  test('hero y ambos CTAs enrutan bien', async ({ page }) => {
    await page.goto('/padelo');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // CTA primario → /crear-grupo (hay uno en el header y otro en el hero: valen ambos)
    const crear = page.getByRole('link', { name: /crea tu grupo/i }).first();
    await expect(crear).toHaveAttribute('href', '/crear-grupo');
    // CTA secundario → / (demo Lomeros)
    await expect(page.getByRole('link', { name: /ver un tour en marcha/i }).first()).toHaveAttribute('href', '/');
  });

  test('la landing de plataforma NO contiene el literal «Lomeros»', async ({ page }) => {
    await page.goto('/padelo');
    const html = await page.content();
    expect(html).not.toContain('Lomeros');
  });

  test('la raíz sigue siendo «Lomeros Padel Tour» (insignia intacta)', async ({ page }) => {
    await page.goto('/');
    expect(await page.content()).toContain('Lomeros');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test e2e/landing-padelo.spec.ts -g "landing /padelo"`
Expected: FAIL — 404 en `/padelo`.

- [ ] **Step 3a: Primitiva de sección**

```tsx
// src/components/marketing/marketing-section.tsx
export function MarketingSection({
  kicker, title, children, stage = false,
}: { kicker: string; title: string; children: React.ReactNode; stage?: boolean }) {
  return (
    <section
      style={{
        padding: 'calc(64px * var(--sp)) 0',
        ...(stage ? { background: 'var(--hero-bg)', color: 'oklch(0.97 0.008 120)' } : {}),
      }}
    >
      <div className="lpt-container">
        <p className="kicker" style={{ color: stage ? 'var(--acc)' : 'var(--ink-3)' }}>{kicker}</p>
        <h2 className="display" style={{ fontSize: 'clamp(28px, 5vw, 44px)', marginTop: 10, maxWidth: 720 }}>{title}</h2>
        <div style={{ marginTop: 20 }}>{children}</div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3b: La página** (8 secciones; copy real, sin literal «Lomeros»)

```tsx
// src/app/padelo/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PLATFORM_NAME } from '@/lib/groups/constants';
import { MarketingSection } from '@/components/marketing/marketing-section';

export const metadata: Metadata = {
  title: `${PLATFORM_NAME} — la liga de tu peña de pádel`,
  description:
    'Convierte los partidos sueltos de tu grupo en una temporada con narrativa: ranking Elo 2vs2, apuestas con fichas, torneos, logros y planificador. Gratis para siempre.',
};

function Cta() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>
      <Link className="lpt-btn primary" href="/crear-grupo">Crea tu grupo gratis</Link>
      <Link className="lpt-btn" href="/">Ver un tour en marcha</Link>
    </div>
  );
}

export default function PadeloLanding() {
  return (
    <>
      {/* 1 · Hero broadcast */}
      <section style={{ background: 'var(--hero-bg)', color: 'oklch(0.97 0.008 120)' }}>
        <div className="lpt-container" style={{ padding: 'calc(88px * var(--sp)) 0 calc(72px * var(--sp))' }}>
          <p className="kicker" style={{ color: 'var(--acc)' }}>El ranking oficial de tu grupo</p>
          <h1 className="display" style={{ fontSize: 'clamp(40px, 9vw, 92px)', marginTop: 14, maxWidth: 900 }}>
            Tu peña merece una liga
          </h1>
          <p style={{ fontSize: 'clamp(16px, 2.4vw, 20px)', marginTop: 18, maxWidth: 620, color: 'oklch(0.9 0.01 150)' }}>
            Ranking Elo 2vs2, apuestas con fichas, torneos y logros. El pádel de tu grupo,
            tratado como una retransmisión.
          </p>
          <Cta />
          <p className="small" style={{ marginTop: 18, color: 'oklch(0.82 0.02 150)' }}>
            Gratis para siempre · se instala como app, sin nada que descargar.
          </p>
        </div>
      </section>

      {/* 2 · El giro */}
      <MarketingSection kicker="El problema" title="Tu ranking no debería vivir en un grupo de WhatsApp">
        <p style={{ maxWidth: 640, color: 'var(--ink-2)' }}>
          Hoy los resultados se pierden entre mensajes y una nota del móvil. {PLATFORM_NAME} los
          convierte en un marcador de verdad: quién sube, quién cae, qué racha hay.
        </p>
      </MarketingSection>

      {/* 3 · La capa social (el diferencial) */}
      <MarketingSection kicker="Lo que engancha" title="La Timba, logros y rankings de parejas" stage>
        <p style={{ maxWidth: 640, color: 'oklch(0.9 0.01 150)' }}>
          Apuestas internas con <strong>fichas de juego, nunca dinero real</strong>, logros que
          se desbloquean y rankings de parejas. La capa social que hace que una peña le enseñe
          la app a la siguiente.
        </p>
      </MarketingSection>

      {/* 4 · Motor competitivo */}
      <MarketingSection kicker="El motor" title="Elo 2vs2, historial, torneos y pozos">
        <p style={{ maxWidth: 640, color: 'var(--ink-2)' }}>
          Cada partido mueve el ranking Elo de la peña. Monta torneos y pozos, revisa el historial
          y sigue la temporada como una competición continua.
        </p>
      </MarketingSection>

      {/* 5 · Planificador */}
      <MarketingSection kicker="Organizaos" title="¿Cuándo puede jugar la peña?">
        <p style={{ maxWidth: 640, color: 'var(--ink-2)' }}>
          Cada jugador marca su disponibilidad semanal y el planificador enseña las coincidencias.
          Menos «¿quién puede el jueves?» y más pádel.
        </p>
      </MarketingSection>

      {/* 6 · Cómo funciona */}
      <MarketingSection kicker="En 3 pasos" title="Crea, invita, pícate">
        <ol style={{ display: 'grid', gap: 14, maxWidth: 640, paddingLeft: 20 }}>
          <li><strong>Crea tu grupo</strong> con tu cuenta de Google, en 30 segundos.</li>
          <li><strong>Invita a tu peña</strong> con un enlace; cada uno reclama su ficha.</li>
          <li><strong>Juega y pícate</strong>: registrad resultados y que empiece la temporada.</li>
        </ol>
      </MarketingSection>

      {/* 7 · Precio honesto */}
      <MarketingSection kicker="Precio" title="Todo gratis. Pagas solo por hacerlo tuyo" stage>
        <p style={{ maxWidth: 640, color: 'oklch(0.9 0.01 150)' }}>
          La función es gratis para siempre. Si quieres, el <strong>Pase de Temporada</strong>
          (~20 €/año) le pone a tu tour tu nombre, tu logo y tus colores, quita la atribución y
          luce el <strong>⭐ Tour Oficial</strong>. Sin suscripciones agresivas ni humo de casino.
        </p>
        <Cta />
      </MarketingSection>

      {/* 8 · Cierre */}
      <section>
        <div className="lpt-container" style={{ padding: 'calc(72px * var(--sp)) 0', textAlign: 'center' }}>
          <h2 className="display" style={{ fontSize: 'clamp(30px, 6vw, 56px)', maxWidth: 720, margin: '0 auto' }}>
            Empieza la temporada de tu peña
          </h2>
          <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 12, marginTop: 24, justifyContent: 'center' }}>
            <Link className="lpt-btn primary" href="/crear-grupo">Crea tu grupo gratis</Link>
            <Link className="lpt-btn" href="/">Ver un tour en marcha</Link>
          </div>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test e2e/landing-padelo.spec.ts`
Expected: PASS toda la spec (incluido el footer de la Tarea 7 y el guard «sin Lomeros»).

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/marketing-section.tsx src/app/padelo/page.tsx
git commit -m "feat(fase4): landing /padelo — hero broadcast + 8 secciones + CTAs"
```

---

## Task 9: Extender el guard «sin literal Lomeros» a las superficies nuevas

**Files:**
- Modify: `src/lib/groups/platform-name.test.ts`

- [ ] **Step 1: Write the failing test — recorrer los directorios de plataforma nuevos**

En `src/lib/groups/platform-name.test.ts`, añade un recorrido recursivo de los nuevos
directorios de plataforma. Añade el import de `readdirSync`/`statSync` y un bloque nuevo:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
// ... (mantener lo existente)

// Directorios de PLATAFORMA creados en la landing: NINGÚN .tsx debe mencionar «Lomeros».
const PLATFORM_DIRS = ['src/app/padelo', 'src/app/legal', 'src/components/marketing'];

function walkTsx(relDir: string): string[] {
  const abs = fileURLToPath(new URL(`../../../${relDir}`, import.meta.url));
  const out: string[] = [];
  for (const entry of readdirSync(abs)) {
    const rel = `${relDir}/${entry}`;
    const absEntry = fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
    if (statSync(absEntry).isDirectory()) out.push(...walkTsx(rel));
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(rel);
  }
  return out;
}

describe('superficies de la landing sin literal «Lomeros»', () => {
  const files = PLATFORM_DIRS.flatMap(walkTsx);
  it('hay ficheros que comprobar', () => expect(files.length).toBeGreaterThan(0));
  it.each(files)('%s no contiene el literal «Lomeros»', (file) => {
    expect(repoFile(file)).not.toMatch(/Lomeros/);
  });
});
```

- [ ] **Step 2: Run to verify it passes** (las superficies ya existen desde las Tareas 7-8 y no llevan «Lomeros»)

Run: `npx vitest run src/lib/groups/platform-name.test.ts`
Expected: PASS. Si algún fichero contuviera «Lomeros», el test lo señala → corrígelo usando `PLATFORM_NAME`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/groups/platform-name.test.ts
git commit -m "test(fase4): el guard sin-Lomeros recorre padelo/, legal/ y marketing/"
```

---

## Task 10: Pase de dirección visual con taste-skill (Broadcast elevado)

Base funcional lista; ahora el pulido de gusto. **REQUIRED SUB-SKILL:** invoca el skill
`taste-skill` (y `taste-skill:imagegen-frontend-web` para referencias). NO reintroducir un
sistema de color paralelo: trabajar sobre los tokens existentes (`--acc`, `--hero-bg`, `--ink*`,
`--surface*`, Barlow itálica, Archivo).

**Files:**
- Modify: `src/app/padelo/page.tsx`, `src/components/marketing/*`, y (si hace falta) añadir clases utilitarias a `src/app/globals.css` bajo una sección comentada `/* Landing Padelo (marketing) */`.

- [ ] **Step 1: Generar referencias por sección**

Invoca `taste-skill:imagegen-frontend-web` con el brief: dirección «Broadcast elevado»,
paleta lima `#c8f03c` sobre verde profundo `#0c1715`/`#1d2f2c`, display Barlow Condensed
itálica 800 mayúscula, cuerpo Archivo. **Una imagen horizontal por sección** (hero, giro,
capa social, motor, planificador, cómo funciona, precio, cierre). Guarda las referencias en
`docs/superpowers/assets/padelo-landing/`.

- [ ] **Step 2: Refinar la implementación para clavar las referencias**

Ajusta escala tipográfica, ritmo de espaciado (secciones amplias), alternancia de layout
(no todo texto-a-la-izquierda), tratamiento de datos como gráficos de broadcast, y añade las
capturas reales del app donde el brief lo pida (usa imágenes ya existentes en `public/` o
genera mockups). Reglas taste-skill: una idea por sección, escalas de hero variadas, CTAs
variados, «second-read moments». Mantén el copy sin «Lomeros».

- [ ] **Step 3: Motion con criterio (opcional, con kill-switch)**

Si añades micro-motion (tick de marcador, entrada del hero), respeta
`@media (prefers-reduced-motion: reduce)` y enumera las propiedades de `transition` (nunca
`transition: all`).

- [ ] **Step 4: Verificar que nada se rompió**

Run: `npx playwright test e2e/landing-padelo.spec.ts && npx vitest run src/lib/groups/platform-name.test.ts`
Expected: PASS (los selectores de los tests son por rol/nombre, robustos al restyle).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(fase4): dirección visual Broadcast elevado en la landing (taste-skill)"
```

---

## Task 11: Auditoría impeccable (guardarraíl) + fixes

**REQUIRED SUB-SKILL:** invoca el skill `impeccable` en modo crítica/auditoría sobre los
ficheros de la landing y legal.

**Files:**
- Modify: los que la crítica marque (`src/app/padelo/*`, `src/components/marketing/*`, `src/app/legal/*`, y `globals.css` si procede).

- [ ] **Step 1: Correr la crítica de impeccable**

Audita: contraste AA (texto sobre `--hero-bg` y sobre superficies), targets ≥44px en todos
los CTAs/enlaces táctiles, `prefers-reduced-motion`, regla «Tinta-sobre-Lima» (texto sobre
lima usa `--on-acc`, nunca blanco), regla «un solo acento protagonista por pantalla»,
rendimiento (imágenes optimizadas con `next/image` o `max-width:100%`, sin `transition: all`),
y que la landing respira en móvil (una columna, sin overflow horizontal).

- [ ] **Step 2: Aplicar los fixes** que la crítica devuelva.

- [ ] **Step 3: Verificar**

Run: `npx playwright test e2e/landing-padelo.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(fase4): correcciones de la crítica impeccable en la landing"
```

---

## Task 12: Verificación integral + PR

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: sin errores. (Lección de las Piezas 1/2: Vercel typechea el build; un tsc roto
tumba el deploy.)

- [ ] **Step 2: Unit test completo**

Run: `npm test`
Expected: toda la suite en verde (incluye `public-signup`, `platform-name` extendido, `paid`).

- [ ] **Step 3: e2e completo**

Run: `npm run e2e`
Expected: toda la suite en verde. Presta atención a `onboarding.spec.ts` (contrato de alta
abierta) y `landing-padelo.spec.ts`.

- [ ] **Step 4: Lint + build**

Run: `npm run lint && npm run build`
Expected: lint limpio y build OK (el build es la verificación real de tipos de Next).

- [ ] **Step 5: Push + draft PR**

```bash
git push -u origin worktree-fase4-landing-padelo
gh pr create --draft --title "feat(fase4): landing pública de Padelo + alta abierta" --body "$(cat <<'EOF'
Landing de plataforma **Padelo** en `/padelo` (la raíz sigue Lomeros), con CTA «Crea tu grupo
gratis» que funciona porque se abre el alta self-serve (`PUBLIC_SIGNUP_ENABLED`, ON por defecto;
kill-switch a «solo invitación»). Dirección visual «Broadcast elevado» sobre los tokens del app
(taste-skill), auditada con impeccable. Legal mínima (privacidad/términos). i18n y revisión legal
a fondo quedan fuera (piezas aparte de Fase 4).

Spec: `docs/superpowers/specs/2026-07-13-fase4-landing-padelo-design.md`
Plan: `docs/superpowers/plans/2026-07-13-fase4-landing-padelo.md`

## Cambios
- Flag `isPublicSignupEnabled()` + cap `MAX_GROUPS_PER_ADMIN`.
- `create-group` / `intent` / `/crear-grupo` aceptan alta abierta (token opcional, respaldo).
- Landing `/padelo` (8 secciones), layout de marketing, footer, legal `/legal/*`.
- Guard «sin literal Lomeros» extendido a las superficies nuevas.
- Cobertura: unit (`public-signup`, guard) + e2e (`landing-padelo.spec.ts`).

## Ojo al desplegar
- `PUBLIC_SIGNUP_ENABLED` ON por defecto ⟶ al desplegar, el alta queda ABIERTA. Poner la env a
  `false` en Vercel si se quiere seguir en beta cerrada.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review — cobertura del spec

| Requisito del spec | Tarea |
|---|---|
| Landing en `/padelo`, raíz intacta | 7 (layout), 8 (page), e2e raíz Lomeros en 8 |
| Alta abierta con flag `PUBLIC_SIGNUP_ENABLED` | 1 (flag), 4/5/6 (rutas+UI) |
| `/crear-grupo` acepta logueado sin token | 6 |
| Cap anti-abuso por usuario | 1 (constante), 2 (query), 4 (429) |
| CTA «Crea tu grupo gratis» + «Ver un tour en marcha» | 8 (hero/cierre), 7 (header/footer) |
| Dirección visual «Broadcast elevado» sobre tokens existentes | 8 (base), 10 (taste-skill) |
| taste-skill dirige, impeccable vigila | 10, 11 |
| Legal mínima (privacidad/términos) enlazada | 7 |
| Guard «sin literal Lomeros» cubre lo nuevo | 9 |
| e2e Playwright + unit | 1, 4, 5, 6, 7, 8, 9, 12 |
| Fuera: i18n, legal a fondo, pricing, discovery | no se implementan (correcto) |
| Lección deploy: tsc/build antes de mergear | 12 |

**Notas de decisión bloqueadas en el plan:**
- El modo cerrado (`PUBLIC_SIGNUP_ENABLED=false`) NO se e2e'a (el servidor de pruebas corre en
  modo abierto); queda cubierto por el unit del flag + la rama de código intacta. Es una omisión
  consciente, en la línea de lo ya no-e2e'ado (checkout Stripe).
- El splash de marca del root layout aparece también en `/padelo`; es on-brand y se acepta. Si
  molestara, condicionarlo por ruta es un fix menor fuera de este plan.
