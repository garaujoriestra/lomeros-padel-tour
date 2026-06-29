# Fase 2 · Paridad `/g/[slug]` · Paso 1 — Fundamentos + home de grupo — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps con checkbox (`- [ ]`).

**Goal:** Que `/g/[slug]` sirva una home de grupo de verdad (nombre + ranking + partidos) con su propio chrome (navbar group-aware), reutilizando componentes existentes y sin tocar el comportamiento de Lomeros en raíz.

**Architecture:** Se introduce `resolvePageContext(slug?)` (resolutor de grupo + relación del visitante con él + `basePath`, con dedupe por request vía React `cache()`). La navbar/bottom-nav aceptan `basePath` opcional (default `''` → idéntico a hoy). Se crea `GroupHomeBody` (home de grupo lean) que renderiza `/g/[slug]/page.tsx`, y un `g/[slug]/layout.tsx` con chrome mínimo group-aware. **La home bespoke de Lomeros en raíz NO se toca** (es marketing flagship: hero de marca + eventos + feed; la home de grupo es una versión lean — divergen a propósito).

**Tech Stack:** Next 16 (App Router, server components, layouts con `params: Promise`, `notFound`/`permanentRedirect`), Drizzle/Turso, Vitest, Playwright. Componentes/queries existentes reutilizados: `Podium`, `MatchCard`, `buildPodiumGroups`, `listRankedPlayers`, `listRecentMatches`, `listScheduledMatches`, `listMatchSetsForMatches`, `listAllPlayersInGroup`. Pieza de Paso A: `getGroupBySlug` (`src/lib/groups/resolve-slug.ts`).

**Alcance de ESTE plan:** fundamentos (`resolvePageContext`, navbar/bottom-nav basePath) + home de grupo. **Fuera (Pasos 2/3):** `/g/[slug]/me`, `/g/[slug]/admin*`. **Fuera (decisión):** torneos/pozos/eventos en chrome de grupo.

---

## 0. NO romper Lomeros
- `(public)/page.tsx` (home bespoke de Lomeros), `Navbar`/`BottomNav` en raíz, `getSession`, `getGroupContext`: **comportamiento idéntico**. La navbar/bottom-nav reciben `basePath` **opcional** (default `''`), así los callers de raíz no cambian.
- Toda la suite e2e existente verde.

---

## Estructura de ficheros
- **Crear** `src/lib/auth/page-context.ts` — `resolvePageContext(slug?)` + tipo `PageContext`. Resuelve grupo + relación del visitante + basePath. Responsabilidad única.
- **Crear** `src/lib/auth/page-context.test.ts` — unit (mock de dependencias).
- **Modificar** `src/components/shared/navbar.tsx` — prop `basePath?: string` (default `''`) + prop `links?: NavLink[]` (default `navLinks`); prefijar hrefs con basePath.
- **Modificar** `src/components/shared/bottom-nav.tsx` — prop `basePath?: string` (default `''`); prefijar hrefs.
- **Crear** `src/components/pages/group-home-body.tsx` — `GroupHomeBody` (home de grupo lean).
- **Crear** `src/app/g/[slug]/layout.tsx` — chrome group-aware (navbar mínima, sin bottom-nav) + resuelve/valida el grupo.
- **Modificar** `src/app/g/[slug]/page.tsx` — renderiza `GroupHomeBody` para el grupo del slug.
- **Crear** `e2e/group-home.spec.ts`.
- **NO se toca** `src/app/(public)/page.tsx` ni `(public)/layout.tsx` ni `me/layout.tsx` ni `admin/layout.tsx`.

---

## Task 0: Preparar worktree
- [ ] **Step 1:** `npm install` → sin errores.
- [ ] **Step 2:** Baseline `npm test` → PASS; `npm run check:db-access` → `✅`.

---

## Task 1: `resolvePageContext(slug?)`

**Files:** Create `src/lib/auth/page-context.ts`, `src/lib/auth/page-context.test.ts`

- [ ] **Step 1: Test que falla** — Create `src/lib/auth/page-context.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getGroupBySlug = vi.fn();
const getDefaultGroupId = vi.fn();
const getGroupContext = vi.fn();
const getGroupById = vi.fn();
const getPlayerInGroup = vi.fn();
const notFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); });

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/groups/resolve-slug', () => ({ getGroupBySlug: (s: string) => getGroupBySlug(s) }));
vi.mock('@/lib/groups/queries', () => ({ getGroupById: (id: string) => getGroupById(id) }));
vi.mock('@/lib/auth/group-context', () => ({
  getDefaultGroupId: () => getDefaultGroupId(),
  getGroupContext: (o: unknown) => getGroupContext(o),
}));
vi.mock('@/lib/players/queries', () => ({ getPlayerInGroup: (g: string, p: string) => getPlayerInGroup(g, p) }));
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));

import { resolvePageContext } from './page-context';

beforeEach(() => { [getGroupBySlug, getDefaultGroupId, getGroupContext, getGroupById, getPlayerInGroup, notFound].forEach((f) => f.mockReset()); });

const GT = { id: 'gt', slug: 'grupo-test', name: 'Grupo Test' };
const LOM = { id: 'lomeros', slug: 'lomeros', name: 'Lomeros Padel Tour' };

describe('resolvePageContext', () => {
  it('sin slug → grupo por defecto, basePath vacío', async () => {
    getDefaultGroupId.mockResolvedValue('lomeros');
    getGroupById.mockResolvedValue(LOM);
    getGroupContext.mockResolvedValue({ groupId: 'lomeros', role: 'admin', playerId: null, isSuperAdmin: false });
    const ctx = await resolvePageContext();
    expect(ctx.groupId).toBe('lomeros');
    expect(ctx.basePath).toBe('');
    expect(ctx.role).toBe('admin');
  });

  it('con slug → grupo del slug, basePath /g/<slug>', async () => {
    getGroupBySlug.mockResolvedValue(GT);
    getDefaultGroupId.mockResolvedValue('lomeros');
    getGroupContext.mockResolvedValue({ groupId: 'gt', role: 'player', playerId: 'gt-pl1', isSuperAdmin: false });
    getPlayerInGroup.mockResolvedValue({ id: 'gt-pl1', name: 'Jugador GT' });
    const ctx = await resolvePageContext('grupo-test');
    expect(ctx.groupId).toBe('gt');
    expect(ctx.basePath).toBe('/g/grupo-test');
    expect(ctx.role).toBe('player');
    expect(ctx.player?.id).toBe('gt-pl1');
  });

  it('slug inexistente → notFound()', async () => {
    getGroupBySlug.mockResolvedValue(null);
    await expect(resolvePageContext('nope')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('visitante sin membership en el grupo → role/player null (público)', async () => {
    getGroupBySlug.mockResolvedValue(GT);
    getDefaultGroupId.mockResolvedValue('lomeros');
    getGroupContext.mockResolvedValue(null); // no es miembro ni super-admin de gt
    const ctx = await resolvePageContext('grupo-test');
    expect(ctx.groupId).toBe('gt');
    expect(ctx.role).toBeNull();
    expect(ctx.player).toBeNull();
  });
});
```

- [ ] **Step 2: Falla** — `npx vitest run src/lib/auth/page-context.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar** — Create `src/lib/auth/page-context.ts`:

```ts
import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Player } from '@/lib/db/schema';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getGroupBySlug } from '@/lib/groups/resolve-slug';
import { getGroupById, type GroupRow } from '@/lib/groups/queries';
import { getPlayerInGroup } from '@/lib/players/queries';

export interface PageContext {
  groupId: string;
  group: GroupRow;
  role: 'admin' | 'player' | 'super_admin' | null; // null = visitante sin membership (página pública)
  player: Player | null;                            // ficha del visitante EN este grupo (objeto completo)
  isSuperAdmin: boolean;
  basePath: '' | `/g/${string}`;
}

// Resuelve, una vez por request (dedupe con React cache), el grupo de la página y la
// relación del visitante con él. NO autoriza: páginas/layouts que requieran rol lo
// comprueban sobre el `role` devuelto. slug inexistente → notFound().
export const resolvePageContext = cache(async (slug?: string): Promise<PageContext> => {
  let group: GroupRow | null;
  let basePath: '' | `/g/${string}`;

  if (slug) {
    group = await getGroupBySlug(slug);
    if (!group) notFound();
    basePath = `/g/${slug}`;
  } else {
    const id = await getDefaultGroupId();
    group = await getGroupById(id);
    if (!group) notFound();
    basePath = '';
  }

  // Relación del visitante con ESTE grupo (null si anónimo o no-miembro → página pública).
  const ctx = await getGroupContext({ targetGroupId: group.id });
  const role = ctx ? ctx.role : null;
  const player =
    ctx && ctx.playerId ? ((await getPlayerInGroup(group.id, ctx.playerId)) ?? null) : null;

  return {
    groupId: group.id,
    group,
    role,
    player,
    isSuperAdmin: ctx?.isSuperAdmin ?? false,
    basePath,
  };
});
```

- [ ] **Step 4: Pasa** — `npx vitest run src/lib/auth/page-context.test.ts` → PASS (4 tests).
- [ ] **Step 5: Commit**
```bash
git add src/lib/auth/page-context.ts src/lib/auth/page-context.test.ts
git commit -m "feat(fase2): resolvePageContext(slug?) — contexto de grupo para páginas (paridad Paso 1)"
```

---

## Task 2: `basePath` en navbar + bottom-nav (retrocompatible)

**Files:** Modify `src/components/shared/navbar.tsx`, `src/components/shared/bottom-nav.tsx`

- [ ] **Step 1: Navbar** — en `src/components/shared/navbar.tsx`, cambiar la firma y prefijar hrefs. La interfaz pasa a:

```tsx
export function Navbar({
  session = null,
  basePath = '',
  links = navLinks,
}: { session?: NavSession | null; basePath?: string; links?: NavLink[] }) {
```

(importar el tipo: `import { navLinks, isNavActive, type NavLink } from './nav-links';`)

Y prefijar TODOS los `href` con `basePath`:
- Brand: `href={basePath || '/'}`.
- nav-tabs: iterar `links`; `const href = `${basePath}${link.href === '/' ? '' : link.href}` || '/';` y usar ese `href` tanto en `href=` como en `isNavActive(href, pathname)`.
- Admin: `href={`${basePath}/admin`}`.
- Me: `href={`${basePath}/me`}`.
- Login: `href="/login"` (global, sin basePath).
- Logout: tras el POST, `router.push(basePath || '/')`.

(En raíz `basePath=''` → todos los hrefs quedan idénticos a hoy.)

- [ ] **Step 2: BottomNav** — en `src/components/shared/bottom-nav.tsx`, añadir `basePath = ''` a la firma:

```tsx
export function BottomNav({ basePath = '' }: { basePath?: string }) {
```

y prefijar los hrefs de `LEFT`/`RIGHT`/timba con `basePath` (p. ej. `href={`${basePath}${l.href === '/' ? '' : l.href}` || '/'}` y `href={`${basePath}/rankings/tokens`}`), y `isNavActive(`${basePath}${...}`, pathname)`. En raíz idéntico.

- [ ] **Step 3: Typecheck + lint** — `npm run lint` → sin errores nuevos. (No hay test unit de componentes client; se cubre vía e2e + la no-rotura de la suite existente.)

- [ ] **Step 4: Commit**
```bash
git add src/components/shared/navbar.tsx src/components/shared/bottom-nav.tsx
git commit -m "feat(fase2): navbar/bottom-nav aceptan basePath (default '' = idéntico) (paridad Paso 1)"
```

---

## Task 3: `GroupHomeBody` (home de grupo lean)

**Files:** Create `src/components/pages/group-home-body.tsx`

Home de grupo reutilizando componentes existentes. NO replica el hero/eventos/feed bespoke de Lomeros.

- [ ] **Step 1: Implementar** — Create `src/components/pages/group-home-body.tsx`:

```tsx
import Link from 'next/link';
import { Trophy, Calendar } from 'lucide-react';
import { Podium } from '@/components/shared/podium';
import { MatchCard } from '@/components/shared/match-card';
import { SectionHead } from '@/components/lpt/ui';
import { buildPodiumGroups } from '@/lib/rankings/podium-groups';
import { listRankedPlayers, listAllPlayersInGroup } from '@/lib/players/queries';
import { listScheduledMatches } from '@/lib/matches/queries';

// Home de grupo (lean): nombre + clasificación + próximos partidos. Para /g/[slug] y
// cualquier grupo no-flagship. `basePath` para los enlaces internos.
export async function GroupHomeBody({ groupId, groupName, basePath }: { groupId: string; groupName: string; basePath: string }) {
  const [topPlayers, upcoming, allPlayers] = await Promise.all([
    listRankedPlayers(groupId, 20),
    listScheduledMatches(groupId, 3),
    listAllPlayersInGroup(groupId),
  ]);
  const playerMap: Record<string, (typeof allPlayers)[number]> = {};
  for (const p of allPlayers) playerMap[p.id] = p;
  const podiumPlayers = topPlayers.map((p) => ({ ...p, delta: null }));

  return (
    <div className="section" style={{ padding: 'calc(26px * var(--sp))' }}>
      <h1 className="display" style={{ fontSize: 'clamp(30px, 6vw, 48px)', margin: '0 0 4px' }}>{groupName}</h1>
      <p className="small muted" style={{ margin: '0 0 24px' }}>
        {allPlayers.length} {allPlayers.length === 1 ? 'jugador' : 'jugadores'}
      </p>

      {topPlayers.length >= 3 && (
        <section className="section">
          <SectionHead icon={Trophy} title="Clasificación" />
          <Podium groups={buildPodiumGroups(podiumPlayers)} />
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="section">
          <SectionHead icon={Calendar} title="Próximos partidos" />
          <div className="grid-2 stagger">
            {upcoming.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                team1={[playerMap[m.team1Player1Id], playerMap[m.team1Player2Id]]}
                team2={[playerMap[m.team2Player1Id], playerMap[m.team2Player2Id]]}
                href={`${basePath}/matches/${m.id}`}
              />
            ))}
          </div>
        </section>
      )}

      {allPlayers.length === 0 && (
        <p className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>Este grupo aún no tiene jugadores.</p>
      )}
    </div>
  );
}
```

*Nota:* si la firma de `Podium`/`MatchCard`/`SectionHead`/`buildPodiumGroups` difiere de lo aquí asumido, ajustarla leyendo `src/app/(public)/page.tsx` (que ya las usa) — replicar su uso exacto. No cambiar esos componentes.

- [ ] **Step 2: Typecheck/lint** — `npm run lint` → sin errores nuevos.
- [ ] **Step 3: Commit**
```bash
git add src/components/pages/group-home-body.tsx
git commit -m "feat(fase2): GroupHomeBody (home de grupo lean) (paridad Paso 1)"
```

---

## Task 4: Layout group-aware `g/[slug]/layout.tsx`

**Files:** Create `src/app/g/[slug]/layout.tsx`

- [ ] **Step 1: Implementar** — Create `src/app/g/[slug]/layout.tsx`:

```tsx
import { permanentRedirect } from 'next/navigation';
import { Navbar } from '@/components/shared/navbar';
import { resolvePageContext } from '@/lib/auth/page-context';

export const dynamic = 'force-dynamic';

export default async function GroupLayout({
  children,
  params,
}: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug); // notFound() si el slug no existe

  // El grupo por defecto (Lomeros) es canónico en la raíz.
  if (ctx.basePath === '') permanentRedirect('/');

  const navSession =
    ctx.role && ctx.role !== 'super_admin'
      ? { role: ctx.role, player: ctx.player ? { id: ctx.player.id, name: ctx.player.name, nickname: ctx.player.nickname, avatarUrl: ctx.player.avatarUrl } : null }
      : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Chrome mínimo de grupo: sin nav-tabs (las secciones aún no existen bajo /g/[slug]) ni bottom-nav. */}
      <Navbar session={navSession} basePath={ctx.basePath} links={[]} />
      <main className="screen">
        <div className="lpt-container">{children}</div>
      </main>
    </div>
  );
}
```

*Nota:* `resolvePageContext(slug)` ya hace `notFound()` para slug inexistente; el `permanentRedirect('/')` cubre `/g/lomeros`. Como `resolvePageContext` está envuelto en React `cache()`, la página puede volver a llamarlo sin coste de DB extra.

- [ ] **Step 2: Commit**
```bash
git add "src/app/g/[slug]/layout.tsx"
git commit -m "feat(fase2): layout group-aware /g/[slug] (chrome mínimo) (paridad Paso 1)"
```

---

## Task 5: `g/[slug]/page.tsx` renderiza la home de grupo (e2e-TDD)

**Files:** Modify `src/app/g/[slug]/page.tsx`; Create `e2e/group-home.spec.ts`

- [ ] **Step 1: e2e que falla** — Create `e2e/group-home.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('paridad · home de grupo /g/[slug]', () => {
  test('muestra el nombre y la clasificación del grupo, no de Lomeros', async ({ page }) => {
    const res = await page.goto('/g/grupo-test');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Grupo Test' })).toBeVisible();
    await expect(page.getByText('Jugador GT', { exact: false }).first()).toBeVisible();
  });

  test('el chrome de grupo enlaza dentro del grupo (marca → /g/grupo-test)', async ({ page }) => {
    await page.goto('/g/grupo-test');
    const brand = page.getByRole('link', { name: /Inicio/i }).first();
    await expect(brand).toHaveAttribute('href', '/g/grupo-test');
  });

  test('/g/lomeros redirige a la raíz', async ({ page }) => {
    await page.goto('/g/lomeros');
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('slug inexistente → 404', async ({ page }) => {
    const res = await page.goto('/g/no-existe');
    expect(res?.status()).toBe(404);
  });
});
```

- [ ] **Step 2: Falla** — `npx playwright test e2e/group-home.spec.ts` → FAIL (la página actual solo muestra el roster; el heading "Clasificación"/chrome no está como se espera).

- [ ] **Step 3: Implementar** — reemplazar `src/app/g/[slug]/page.tsx` ENTERAMENTE por:

```tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { GroupHomeBody } from '@/components/pages/group-home-body';

export const dynamic = 'force-dynamic';

export default async function GroupHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug); // notFound si no existe (dedupe con el layout vía React cache)
  return <GroupHomeBody groupId={ctx.groupId} groupName={ctx.group.name} basePath={ctx.basePath} />;
}
```

(El `permanentRedirect('/')` de `/g/lomeros` lo hace el layout; aquí no hace falta repetirlo. El layout ya valida el slug.)

- [ ] **Step 4: Pasa** — `npx playwright test e2e/group-home.spec.ts` → PASS (4 tests).
- [ ] **Step 5: Commit**
```bash
git add "src/app/g/[slug]/page.tsx" e2e/group-home.spec.ts
git commit -m "feat(fase2): home de grupo /g/[slug] (ranking + partidos) (paridad Paso 1)"
```

---

## Task 6: Regresión + no-rotura de Lomeros
- [ ] **Step 1:** `npm test` → PASS (incluye `page-context.test.ts`).
- [ ] **Step 2:** `npm run e2e` → PASS (toda la suite existente + `group-home.spec.ts`). La home de Lomeros (`/`), `/me`, `/admin` y la navbar de raíz renderizan idéntico (basePath default `''`).
- [ ] **Step 3:** `npm run check:db-access` → `✅`.
- [ ] **Step 4:** `git diff --name-status main` → solo `A` salvo `M` en `navbar.tsx`, `bottom-nav.tsx`, `g/[slug]/page.tsx`. **NO** se modifican `(public)/page.tsx`, `(public)/layout.tsx`, `me/layout.tsx`, `admin/layout.tsx`, `getSession`, `proxy.ts`, ni nada de tournaments.

---

## Self-Review (autor)
**Cobertura spec (Paso 1):** resolvePageContext (Task 1); navbar/bottom-nav basePath (Task 2); home de grupo lean = GroupHomeBody + page (Tasks 3,5); chrome group-aware sin tabs/bottom-nav + 404/redirect (Task 4); no-rotura Lomeros (Task 6, diff acotado, home bespoke intacta). ✅ Diferido por diseño: migrar layouts de raíz (Pasos 2/3, cuando se compartan /me y admin).
**Placeholders:** cada step con comando/código; la nota en Task 3 remite a `(public)/page.tsx` por si una firma de componente difiere (ajuste, no placeholder).
**Consistencia:** `resolvePageContext`/`PageContext`/`basePath` definidos en Task 1 y consumidos idénticos en Tasks 4,5; `GroupHomeBody({groupId, groupName, basePath})` definido en Task 3 y usado en Task 5.

---

## Próximo paso
Plan del Paso 2 (`/g/[slug]/me`: extraer `MeBody`, compartir con `/me` raíz, gating de ficha, matcher de proxy para sesión).
