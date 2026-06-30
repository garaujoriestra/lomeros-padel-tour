# Fase 2 · Paridad `/g/[slug]` · Paso 2 — `/me` compartido — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) o superpowers:executing-plans para implementar tarea a tarea. Steps con checkbox (`- [ ]`).

**Goal:** Que `/g/[slug]/me` muestre el perfil del jugador **en ese grupo** (con gating de sesión + de ficha), extrayendo un `MeBody` compartido que la `/me` de raíz (Lomeros) también renderiza, sin cambiar el comportamiento de Lomeros.

**Architecture:** Se extrae el cuerpo de `me/page.tsx` a `MeBody({ ctx }: { ctx: PageContext })` (server component en `src/components/pages/`). La ruta raíz lo renderiza con `resolvePageContext()` (grupo por defecto) y la ruta `/g/[slug]/me` con `resolvePageContext(slug)`. `MeBody` decide por `ctx.player` (sin ficha → bienvenida; con ficha → `PlayerProfileView` del grupo) y por `ctx.basePath` (la cartera de La Timba y el enlace de edición solo en raíz, porque sus rutas están diferidas/excluidas del MVP de grupo). El gating de sesión lo añade el edge: `decideAccess` exige sesión en `/g/<slug>/me` y el matcher del proxy cubre `/g/:slug/me/:path*`. `/g/[slug]/me` hereda el chrome group-aware de `g/[slug]/layout.tsx` (Paso 1) — no se crea layout nuevo.

**Tech Stack:** Next 16 (App Router, server components, `params: Promise`, proxy/`decideAccess`), Drizzle/Turso, Vitest, Playwright. Reutiliza: `resolvePageContext`/`PageContext` (Paso 1), `loadPlayerProfile`, `PlayerProfileView`, `PushNotificationsToggle`, `getPlayerInGroup` (vía `resolvePageContext`).

**Alcance de ESTE plan:** `/me` raíz + `/g/[slug]/me` compartiendo `MeBody`; gating de sesión (edge) + de ficha (server). **Fuera (diferido/decisión):** `/me/edit`, `/me/tokens` bajo grupo (La Timba es modo test solo-Lomeros), páginas de detalle `matches/[id]`/`players/[id]` (los enlaces internos de `PlayerProfileView` siguen apuntando a raíz — limitación conocida del MVP, no introducida aquí). **Fuera:** `/g/[slug]/admin*` (Paso 3).

---

## 0. NO romper Lomeros
- `me/layout.tsx` (con `BottomNav`) **NO se toca**: la `/me` de raíz sigue con su chrome actual. Solo cambia el **cuerpo** de `me/page.tsx`, que pasa a renderizar `MeBody` con `resolvePageContext()` (grupo por defecto) — render idéntico para un jugador de Lomeros con ficha (perfil + cartera de La Timba + push) y para uno sin ficha (mensaje de bienvenida).
- `getSession` **intacto** (lo consumen páginas no migradas + `requireAdmin`/torneos). `resolvePageContext` usa `getGroupContext` internamente.
- `decideAccess` para `/admin*` y `/me*` en raíz: **sin cambios de semántica**; solo se **añade** una rama nueva para `/g/<slug>/me`.
- Toda la suite e2e existente verde.

---

## Estructura de ficheros
- **Modificar** `src/lib/auth/authorize.ts` — `decideAccess` añade rama `/g/<slug>/me` (exige sesión). Raíz inalterado.
- **Modificar** `src/lib/auth/authorize.test.ts` — casos para la rama nueva.
- **Modificar** `src/proxy.ts` — añadir `/g/:slug/me/:path*` al `config.matcher`.
- **Crear** `src/components/pages/me-body.tsx` — `MeBody({ ctx })`, cuerpo compartido.
- **Modificar** `src/app/me/page.tsx` — renderiza `MeBody` con `resolvePageContext()`.
- **Crear** `src/app/g/[slug]/me/page.tsx` — renderiza `MeBody` con `resolvePageContext(slug)`.
- **Crear** `e2e/group-me.spec.ts`.
- **NO se toca** `me/layout.tsx`, `g/[slug]/layout.tsx`, `PlayerProfileView`, `getSession`, `resolvePageContext`, ni nada de admin/torneos.

---

## Task 0: Baseline en el worktree
- [ ] **Step 1:** `npm install` → sin errores.
- [ ] **Step 2:** `npm test` → PASS; `npm run check:db-access` → `✅`.

---

## Task 1: Gating edge de `/g/<slug>/me` (`decideAccess` + matcher)

**Files:**
- Modify: `src/lib/auth/authorize.test.ts`
- Modify: `src/lib/auth/authorize.ts`
- Modify: `src/proxy.ts`

- [ ] **Step 1: Test que falla** — en `src/lib/auth/authorize.test.ts`, añadir dentro de `describe('decideAccess', ...)` (tras el `it('gatea /me solo por sesión', ...)`):

```ts
  it('gatea /g/<slug>/me solo por sesión (igual que /me en raíz)', () => {
    expect(decideAccess('/g/grupo-test/me', null)).toBe('redirect-login');
    expect(decideAccess('/g/grupo-test/me', { userId: 'u' })).toBe('allow');
    expect(decideAccess('/g/grupo-test/me/edit', null)).toBe('redirect-login');
  });

  it('no gatea la landing pública del grupo /g/<slug>', () => {
    expect(decideAccess('/g/grupo-test', null)).toBe('allow');
  });
```

- [ ] **Step 2: Falla** — `npx vitest run src/lib/auth/authorize.test.ts` → FAIL (`/g/grupo-test/me` con `null` devuelve hoy `'allow'`, no `'redirect-login'`).

- [ ] **Step 3: Implementar** — en `src/lib/auth/authorize.ts`, añadir la rama nueva ANTES del `return 'allow'` final:

```ts
  if (path === '/me' || path.startsWith('/me/')) {
    return payload ? 'allow' : 'redirect-login';
  }
  // Paso 2: /g/<slug>/me (y sub-rutas) exigen sesión, igual que /me en raíz.
  // La landing pública /g/<slug> (sin /me) no entra aquí.
  if (/^\/g\/[^/]+\/me(?:\/|$)/.test(path)) {
    return payload ? 'allow' : 'redirect-login';
  }
  return 'allow';
```

- [ ] **Step 4: Pasa** — `npx vitest run src/lib/auth/authorize.test.ts` → PASS.

- [ ] **Step 5: Matcher del proxy** — en `src/proxy.ts`, ampliar `config.matcher` a:

```ts
export const config = {
  matcher: ['/admin/:path*', '/me/:path*', '/g/:slug', '/g/:slug/me/:path*'],
};
```

(El bloque `slugMatch` (`^\/g\/([^/]+)$`) solo casa un segmento, así que `/g/<slug>/me` cae al `verifySession`+`decideAccess`, que ahora lo gatea. La landing `/g/<slug>` sigue gestionada por el bloque de slug.)

- [ ] **Step 6: Lint** — `npm run lint` → sin errores nuevos.

- [ ] **Step 7: Commit**
```bash
git add src/lib/auth/authorize.ts src/lib/auth/authorize.test.ts src/proxy.ts
git commit -m "feat(fase2): gating edge de /g/[slug]/me (sesión requerida) (paridad Paso 2)"
```

---

## Task 2: `MeBody` (cuerpo compartido de `/me`)

**Files:** Create `src/components/pages/me-body.tsx`

Extrae la lógica de render de `me/page.tsx`. Recibe el `PageContext` ya resuelto. Sin ficha → bienvenida (sin redirect-loop); con ficha → `PlayerProfileView` del grupo. La cartera de La Timba y el enlace de edición (`PlayerProfileView editable`) **solo en raíz** (`basePath === ''`), porque `/me/tokens` y `/me/edit` no existen bajo `/g/[slug]` y La Timba es modo test solo-Lomeros.

- [ ] **Step 1: Implementar** — Create `src/components/pages/me-body.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadPlayerProfile } from '@/lib/players/profile-data';
import { PlayerProfileView } from '@/components/players/player-profile-view';
import { PushNotificationsToggle } from '@/components/me/push-notifications-toggle';
import type { PageContext } from '@/lib/auth/page-context';

// Cuerpo compartido de /me (raíz) y /g/[slug]/me. Recibe el contexto de página resuelto.
// - Sin ficha en el grupo → mensaje de bienvenida (no redirect-loop; el edge ya exigió sesión).
// - Con ficha → perfil del jugador EN ese grupo. Cartera de La Timba y edición solo en raíz
//   (rutas /me/tokens y /me/edit no existen bajo /g/[slug]; La Timba es modo test solo-Lomeros).
export async function MeBody({ ctx }: { ctx: PageContext }) {
  const { player, groupId, basePath } = ctx;
  const isRoot = basePath === '';
  const home = basePath || '/';

  if (!player) {
    return (
      <div className="max-w-md mx-auto mt-10 text-center space-y-4">
        <div className="text-4xl">👋</div>
        <h1 className="display" style={{ fontSize: 28 }}>¡Bienvenido!</h1>
        <p className="muted">
          {isRoot
            ? 'Tu cuenta está activa pero aún no está vinculada a un jugador del tour. Pide al organizador que te vincule a tu ficha.'
            : 'Tu cuenta no está vinculada a un jugador de este grupo. Pide al organizador que te vincule a tu ficha.'}
        </p>
        <Link href={home} className="sec-link" style={{ justifyContent: 'center' }}>
          {isRoot ? 'Ver el tour →' : 'Ver el grupo →'}
        </Link>
        <div className="mt-6 text-left">
          <PushNotificationsToggle />
        </div>
      </div>
    );
  }

  const data = await loadPlayerProfile(groupId, player.id);
  if (!data) redirect(home);

  return (
    <div className="space-y-6">
      <PlayerProfileView data={data} editable={isRoot} />
      {isRoot && (
        <Link href="/me/tokens" className="lpt-card flex items-center justify-between" style={{ padding: 14 }}>
          <span>🪙 Mi cartera de La Timba</span>
          <span className="font-semibold">{player.tokenBalance} tk →</span>
        </Link>
      )}
      <PushNotificationsToggle />
    </div>
  );
}
```

- [ ] **Step 2: Lint** — `npm run lint` → sin errores nuevos.

- [ ] **Step 3: Commit**
```bash
git add src/components/pages/me-body.tsx
git commit -m "feat(fase2): MeBody (cuerpo compartido de /me, group-aware) (paridad Paso 2)"
```

---

## Task 3: `/me` raíz renderiza `MeBody` (Lomeros idéntico)

**Files:** Modify `src/app/me/page.tsx`

Refactor de comportamiento idéntico: la `/me` raíz pasa a renderizar `MeBody` con el contexto del grupo por defecto. El gating de sesión lo cubre el proxy (`/me/:path*` → `decideAccess` → `redirect-login`), igual que hoy.

- [ ] **Step 1: Reemplazar** `src/app/me/page.tsx` ENTERAMENTE por:

```tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { MeBody } from '@/components/pages/me-body';

export const dynamic = 'force-dynamic';

// /me de raíz: contexto = grupo por defecto. El cuerpo es compartido con /g/[slug]/me.
export default async function MePage() {
  const ctx = await resolvePageContext();
  return <MeBody ctx={ctx} />;
}
```

- [ ] **Step 2: Lint + typecheck** — `npm run lint` → sin errores nuevos.

- [ ] **Step 3: Regresión e2e de Lomeros** — `npx playwright test e2e/dev-login.spec.ts` → PASS (el flujo que aterriza en `/me` de Lomeros sigue verde). Si `dev-login.spec.ts` no cubre `/me`, este check se valida en Task 5 con la suite completa.

- [ ] **Step 4: Commit**
```bash
git add src/app/me/page.tsx
git commit -m "feat(fase2): /me raíz usa MeBody compartido (Lomeros idéntico) (paridad Paso 2)"
```

---

## Task 4: `/g/[slug]/me` + e2e (TDD)

**Files:**
- Create: `src/app/g/[slug]/me/page.tsx`
- Create: `e2e/group-me.spec.ts`

- [ ] **Step 1: e2e que falla** — Create `e2e/group-me.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('paridad · /g/[slug]/me · jugador del grupo', () => {
  test.use({ storageState: 'e2e/.auth/gt-player.json' });

  test('ve su ficha (Jugador GT) en el grupo, con status 200', async ({ page }) => {
    const res = await page.goto('/g/grupo-test/me');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Jugador GT', exact: true })).toBeVisible();
  });

  test('no muestra la cartera de La Timba bajo grupo', async ({ page }) => {
    await page.goto('/g/grupo-test/me');
    await expect(page.getByText('Mi cartera de La Timba')).toHaveCount(0);
  });
});

test.describe('paridad · /g/[slug]/me · gating de sesión', () => {
  test('sin sesión → redirect a /login', async ({ page }) => {
    await page.goto('/g/grupo-test/me');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('paridad · /g/[slug]/me · gating de ficha (admin de Lomeros, sin ficha en el grupo)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('200 con mensaje de bienvenida; NO muestra la ficha ajena gt-pl1', async ({ page }) => {
    const res = await page.goto('/g/grupo-test/me');
    expect(res?.status()).toBe(200);
    await expect(page.getByText(/no está vinculada a un jugador de este grupo/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Jugador GT', exact: true })).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Falla** — `npx playwright test e2e/group-me.spec.ts` → FAIL (la ruta `/g/grupo-test/me` aún no existe → 404).

- [ ] **Step 3: Implementar** — Create `src/app/g/[slug]/me/page.tsx`:

```tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { MeBody } from '@/components/pages/me-body';

export const dynamic = 'force-dynamic';

// /g/[slug]/me: perfil del jugador EN el grupo del slug. Hereda el chrome group-aware
// de g/[slug]/layout.tsx (Paso 1). El edge exige sesión (decideAccess); el gating de
// ficha lo hace MeBody (sin ficha → bienvenida, sin redirect-loop).
export default async function GroupMePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug); // notFound() si el slug no existe
  return <MeBody ctx={ctx} />;
}
```

- [ ] **Step 4: Pasa** — `npx playwright test e2e/group-me.spec.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add "src/app/g/[slug]/me/page.tsx" e2e/group-me.spec.ts
git commit -m "feat(fase2): /g/[slug]/me (perfil del jugador en el grupo + gating de ficha) (paridad Paso 2)"
```

---

## Task 5: Regresión + no-rotura de Lomeros
- [ ] **Step 1:** `npm test` → PASS (incluye `authorize.test.ts` con la rama nueva).
- [ ] **Step 2:** `npm run e2e` → PASS (toda la suite existente + `group-me.spec.ts`). La `/me` de Lomeros (raíz), su `BottomNav` y la cartera de La Timba renderizan idéntico (contexto = grupo por defecto, `basePath=''`).
- [ ] **Step 3:** `npm run check:db-access` → `✅`.
- [ ] **Step 4:** `git diff --name-status main` → solo `A` salvo `M` en `authorize.ts`, `authorize.test.ts`, `proxy.ts`, `me/page.tsx`. **NO** se modifican `me/layout.tsx`, `g/[slug]/layout.tsx`, `PlayerProfileView`, `getSession`, `resolvePageContext`, ni nada de admin/torneos.

---

## Self-Review (autor)
**Cobertura spec (Paso 2):** extraer `MeBody` (Task 2); `/me` raíz + `/g/[slug]/me` compartiendo cuerpo (Tasks 3,4); gating de ficha = rama `!player` de `MeBody` + test admin-ajeno (Tasks 2,4); gating de sesión edge = `decideAccess` + matcher (Task 1); chrome group-aware heredado de `g/[slug]/layout.tsx` (Paso 1, no se duplica); `/me` de Lomeros idéntico (Tasks 3,5). ✅
**Decisiones de alcance:** cartera/edición solo en raíz (rutas diferidas/excluidas bajo grupo); enlaces internos de `PlayerProfileView` a `matches/[id]`/`players/[id]` siguen a raíz — páginas de detalle diferidas del MVP, no se tocan aquí (cambiarlas sería ampliar `PlayerProfileView`, fuera de Paso 2). Documentado.
**Placeholders:** cada step con código/comando completo. Sin TBD.
**Consistencia:** `MeBody({ ctx }: { ctx: PageContext })` definido en Task 2 y consumido idéntico en Tasks 3,4; `PageContext`/`resolvePageContext` del Paso 1 (sin cambios); `decideAccess` rama `/g/<slug>/me` definida en Task 1 y verificada por el matcher + e2e de sesión (Tasks 1,4).

---

## Próximo paso
Plan del Paso 3 (`/g/[slug]/admin*`: `AdminDashboardBody` + `AdminPlayersBody` + `AdminMatchesBody`; gating de rol por grupo + matcher de proxy `/g/:slug/admin/:path*`). Tras la paridad: retomar Paso C (limpieza de `getSession`) y migrar torneos (con OK del usuario).
