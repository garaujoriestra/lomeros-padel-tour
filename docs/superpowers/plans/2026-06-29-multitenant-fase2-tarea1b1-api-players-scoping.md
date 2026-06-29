# Fase 2 · Tarea 1 · Paso B1 — `/api` group-aware: helpers + guard + dominio players — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las rutas `/api` del dominio **players** acepten un grupo objetivo explícito (GET → `?g=<slug>`; mutaciones → body `g`) y autoricen **contra ese grupo**, manteniendo el comportamiento de Lomeros idéntico cuando no se indica grupo. Introduce los dos componentes reutilizables por el resto de dominios del Paso B: el resolutor de grupo de la request y el guard `requireGroupAdmin`.

**Architecture:** Paso B del rollout expand→contract (spec `docs/superpowers/specs/2026-06-29-multitenant-fase2-tarea1-slug-routing-design.md`). Decisión (brainstorming 2026-06-29): el Paso B migra **por dominio** e **incluye la autorización por grupo objetivo** — aceptar un grupo en una ruta autenticada sin autorizar contra él sería un agujero (un admin de Lomeros podría escribir en otro grupo). Esto absorbe el refactor `requireAdmin → requireGroupAdmin` que el spec puso en Paso C; el Paso C queda reducido a quitar el horneado de rol en `getSession` + aterrizaje grupo-hogar.

**No-rotura de Lomeros (rector):** mientras ningún cliente envíe grupo, `?g=`/`body.g` ausente → `getGroupContext({})` resuelve la única membership (Lomeros) → comportamiento **idéntico**. `getSession`/`requireAdmin` NO se tocan (siguen para los dominios aún no migrados). Solo se modifican las 2 rutas de players + se añade al guard + setup e2e. La suite e2e existente (incluida no-fuga) debe quedar verde.

**Tech Stack:** Next.js 16.2.2 (App Router; `params`/route handlers async), Drizzle + Turso/libSQL, Vitest (unit), Playwright (e2e). Helpers de dominio (`@/lib/players/queries`) ya toman `groupId`. `getGroupBySlug` existe (Paso A, `src/lib/groups/resolve-slug.ts`). `getGroupContext({ targetGroupId })` ya autoriza (devuelve null si no hay membership ni super-admin en el grupo objetivo).

**Alcance de ESTE plan:** dominio **players** (`src/app/api/players/route.ts`, `src/app/api/players/[id]/route.ts`) + helpers/guard/fixtures reutilizables. **Fuera (planes B2+):** matches, betting/timba, tournaments, rewards, rankings, me. **Fuera (Paso C):** refactor de `getSession`, aterrizaje grupo-hogar, retirar `requireAdmin` cuando todos los dominios estén migrados.

**Convención de dónde viaja el grupo:** métodos sin body (GET, DELETE) → query `?g=<slug>`; mutaciones con body (POST, PUT, PATCH) → campo `g` del body. Valor = **slug** (se resuelve a id con `getGroupBySlug`). Ausente o slug inexistente → `null` → el caller cae al grupo por defecto / única membership.

---

## Estructura de ficheros

- **Crear** `src/lib/groups/request-group.ts` — `groupIdFromQuery(request)` y `groupIdFromValue(value)`: traducen el grupo de la request (slug) a `groupId` o `null`. Responsabilidad única.
- **Crear** `src/lib/groups/request-group.test.ts` — unit (mock de `getGroupBySlug`).
- **Modificar** `src/lib/auth/guard.ts` — añadir `requireGroupAdmin(targetGroupId?)` (no toca `requireAdmin`/`requireSession`).
- **Crear** `src/lib/auth/guard.test.ts` — unit de `requireGroupAdmin` (mock de `getSession` + `getGroupContext`).
- **Modificar** `e2e/global-setup.ts` — sembrar un usuario+membership **admin de grupo-test** y su `storageState` (`e2e/.auth/gt-admin.json`). Fixture reutilizable por todo el Paso B.
- **Modificar** `src/app/api/players/route.ts` y `src/app/api/players/[id]/route.ts` — group-aware + authz por grupo objetivo.
- **Crear** `e2e/players-scoping.spec.ts` — e2e del dominio.

---

## Task 0: Preparar el worktree

- [ ] **Step 1: Instalar dependencias** — Run: `npm install` → sin errores.
- [ ] **Step 2: Baseline verde** — Run: `npm test` → PASS (suite unit existente). Run: `npm run check:db-access` → `✅`.

---

## Task 1: Resolutor de grupo de la request

**Files:** Create `src/lib/groups/request-group.ts`, `src/lib/groups/request-group.test.ts`

- [ ] **Step 1: Test que falla** — Create `src/lib/groups/request-group.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getGroupBySlug = vi.fn();
vi.mock('./resolve-slug', () => ({ getGroupBySlug: (s: string) => getGroupBySlug(s) }));

import { groupIdFromQuery, groupIdFromValue } from './request-group';

beforeEach(() => getGroupBySlug.mockReset());

function req(qs: string) {
  return { nextUrl: { searchParams: new URLSearchParams(qs) } } as unknown as import('next/server').NextRequest;
}

describe('groupIdFromQuery', () => {
  it('null si no hay ?g=', async () => {
    expect(await groupIdFromQuery(req(''))).toBeNull();
    expect(getGroupBySlug).not.toHaveBeenCalled();
  });
  it('resuelve ?g=<slug> a su id', async () => {
    getGroupBySlug.mockResolvedValue({ id: 'gt-id', slug: 'grupo-test', name: 'Grupo Test' });
    expect(await groupIdFromQuery(req('g=grupo-test'))).toBe('gt-id');
  });
  it('null si el slug no existe', async () => {
    getGroupBySlug.mockResolvedValue(null);
    expect(await groupIdFromQuery(req('g=nope'))).toBeNull();
  });
});

describe('groupIdFromValue', () => {
  it('null para no-string o vacío', async () => {
    expect(await groupIdFromValue(undefined)).toBeNull();
    expect(await groupIdFromValue('')).toBeNull();
    expect(await groupIdFromValue(123)).toBeNull();
  });
  it('resuelve un slug a su id', async () => {
    getGroupBySlug.mockResolvedValue({ id: 'gt-id', slug: 'grupo-test', name: 'Grupo Test' });
    expect(await groupIdFromValue('grupo-test')).toBe('gt-id');
  });
});
```

- [ ] **Step 2: Falla** — Run: `npx vitest run src/lib/groups/request-group.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar** — Create `src/lib/groups/request-group.ts`:

```ts
import type { NextRequest } from 'next/server';
import { getGroupBySlug } from './resolve-slug';

// Grupo objetivo de una request por query (?g=<slug>). Para métodos sin body (GET, DELETE).
// Devuelve el groupId, o null si no se indicó grupo o el slug no existe (el caller cae al
// grupo por defecto / única membership).
export async function groupIdFromQuery(request: NextRequest): Promise<string | null> {
  return groupIdFromValue(request.nextUrl.searchParams.get('g'));
}

// Grupo objetivo a partir de un valor (campo `g` del body de una mutación, o un query param).
export async function groupIdFromValue(value: unknown): Promise<string | null> {
  if (typeof value !== 'string' || !value) return null;
  const group = await getGroupBySlug(value);
  return group?.id ?? null;
}
```

- [ ] **Step 4: Pasa** — Run: `npx vitest run src/lib/groups/request-group.test.ts` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/lib/groups/request-group.ts src/lib/groups/request-group.test.ts
git commit -m "feat(fase2): resolutor de grupo de la request (?g=/body) (Paso B)"
```

---

## Task 2: Guard `requireGroupAdmin`

**Files:** Modify `src/lib/auth/guard.ts`; Create `src/lib/auth/guard.test.ts`

- [ ] **Step 1: Test que falla** — Create `src/lib/auth/guard.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
const getGroupContext = vi.fn();
vi.mock('@/lib/auth/session', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/auth/group-context', () => ({ getGroupContext: (o: unknown) => getGroupContext(o) }));

import { requireGroupAdmin } from './guard';

beforeEach(() => { getSession.mockReset(); getGroupContext.mockReset(); });

function status(r: Awaited<ReturnType<typeof requireGroupAdmin>>) {
  return 'response' in r ? r.response.status : null;
}

describe('requireGroupAdmin', () => {
  it('401 sin sesión', async () => {
    getSession.mockResolvedValue(null);
    expect(status(await requireGroupAdmin('g1'))).toBe(401);
  });
  it('403 si no hay contexto en el grupo objetivo', async () => {
    getSession.mockResolvedValue({ userId: 'u', email: 'e' });
    getGroupContext.mockResolvedValue(null);
    expect(status(await requireGroupAdmin('g1'))).toBe(403);
  });
  it('403 si el rol no es admin (player/super_admin)', async () => {
    getSession.mockResolvedValue({ userId: 'u', email: 'e' });
    getGroupContext.mockResolvedValue({ groupId: 'g1', role: 'player', isSuperAdmin: false });
    expect(status(await requireGroupAdmin('g1'))).toBe(403);
    getGroupContext.mockResolvedValue({ groupId: 'g1', role: 'super_admin', isSuperAdmin: true });
    expect(status(await requireGroupAdmin('g1'))).toBe(403);
  });
  it('devuelve ctx si es admin del grupo objetivo', async () => {
    getSession.mockResolvedValue({ userId: 'u', email: 'e' });
    const ctx = { groupId: 'g1', role: 'admin', membershipId: 'm', playerId: null, isSuperAdmin: false };
    getGroupContext.mockResolvedValue(ctx);
    const r = await requireGroupAdmin('g1');
    expect('ctx' in r && r.ctx).toEqual(ctx);
  });
});
```

- [ ] **Step 2: Falla** — Run: `npx vitest run src/lib/auth/guard.test.ts` → FAIL (`requireGroupAdmin` no existe).

- [ ] **Step 3: Implementar** — En `src/lib/auth/guard.ts` añadir el import y la función (NO tocar `requireAdmin`/`requireSession`). El fichero pasa a empezar así:

```ts
import { NextResponse } from 'next/server';
import { getSession, type Session } from '@/lib/auth/session';
import { getGroupContext, type GroupContext } from '@/lib/auth/group-context';
```

y al final del fichero, añadir:

```ts
// Admin del GRUPO OBJETIVO (no del grupo por defecto). 401 sin sesión; 403 si el usuario
// no es admin de ese grupo (super_admin es solo-lectura → rechazado en escrituras admin).
// targetGroupId null/undefined → getGroupContext usa la única membership: comportamiento de
// Lomeros idéntico mientras los callers no envíen grupo. Reemplaza a requireAdmin en las
// rutas ya migradas al Paso B.
export async function requireGroupAdmin(
  targetGroupId?: string | null,
): Promise<{ ctx: GroupContext } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }
  const ctx = await getGroupContext(targetGroupId ? { targetGroupId } : {});
  if (!ctx || ctx.role !== 'admin') {
    return { response: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  }
  return { ctx };
}
```

- [ ] **Step 4: Pasa** — Run: `npx vitest run src/lib/auth/guard.test.ts` → PASS (4 tests).
- [ ] **Step 5: Commit**
```bash
git add src/lib/auth/guard.ts src/lib/auth/guard.test.ts
git commit -m "feat(fase2): guard requireGroupAdmin (admin del grupo objetivo) (Paso B)"
```

---

## Task 3: Fixture e2e — admin de grupo-test

**Files:** Modify `e2e/global-setup.ts`

Permite probar la autorización **positiva** cross-grupo (un admin de grupo-test sí puede escribir en grupo-test) y es reutilizable por todos los dominios del Paso B. El setup ya siembra grupo-test y sus jugadores; falta un usuario admin con membership en él.

- [ ] **Step 1: Sembrar usuario + membership admin de grupo-test.** En `e2e/global-setup.ts`, justo después del bloque que crea el grupo "Grupo Test" (tras el `INSERT ... INTO groups ... 'grupo-test' ...`), añadir:

```ts
  // Usuario admin del "Grupo Test" (con membership admin en grupo-test). Para probar
  // que un admin de su propio grupo SÍ puede escribir en él, y que un admin de Lomeros NO.
  const gtAdminUserId = 'e2e-gt-admin-user';
  await db.execute({
    sql: 'INSERT OR IGNORE INTO users (id, email, role) VALUES (?, ?, ?)',
    args: [gtAdminUserId, 'gt-admin@test.com', 'player'],
  });
  await db.execute({
    sql: 'INSERT OR IGNORE INTO memberships (id, user_id, group_id, role, player_id) VALUES (?, ?, ?, ?, ?)',
    args: ['mb-gt-admin', gtAdminUserId, 'grupo-test', 'admin', null],
  });
```

(Nota: `users.role` es legacy/ignorado — la fuente de verdad del rol es `memberships`; se pone `'player'` solo por si la columna es NOT NULL. El admin real sale de la membership.)

- [ ] **Step 2: Escribir su storageState.** Al final de `globalSetup`, junto a los otros `writeFile` de `e2e/.auth/*.json`, añadir:

```ts
  await writeFile('e2e/.auth/gt-admin.json', JSON.stringify(await sessionStorageState(gtAdminUserId, TEST_ENV.AUTH_SECRET)));
```

- [ ] **Step 3: Verificar que el setup sigue corriendo.** Run: `npx playwright test e2e/no-fuga-players.spec.ts` → PASS (el setup corre sin romper; las no-fuga existentes verdes). Expected: el global-setup genera `e2e/.auth/gt-admin.json` sin error.

- [ ] **Step 4: Commit**
```bash
git add e2e/global-setup.ts
git commit -m "test(fase2): fixture e2e admin de grupo-test (gt-admin.json) (Paso B)"
```

---

## Task 4: Migrar el dominio players (e2e-TDD)

**Files:** Create `e2e/players-scoping.spec.ts`; Modify `src/app/api/players/route.ts`, `src/app/api/players/[id]/route.ts`

- [ ] **Step 1: e2e que falla** — Create `e2e/players-scoping.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

type P = { id: string; name: string };

test.describe('paso B · players · lecturas públicas con ?g=', () => {
  test('GET /api/players?g=grupo-test devuelve jugadores de grupo-test, no de Lomeros', async ({ request }) => {
    const res = await request.get('/api/players?g=grupo-test');
    expect(res.ok()).toBeTruthy();
    const names = ((await res.json()) as P[]).map((p) => p.name);
    expect(names).toContain('Jugador GT');
    expect(names).not.toContain('Jugador 1');
  });

  test('GET /api/players (sin g) sigue devolviendo Lomeros', async ({ request }) => {
    const res = await request.get('/api/players');
    const names = ((await res.json()) as P[]).map((p) => p.name);
    expect(names).toContain('Jugador 1');
    expect(names).not.toContain('Jugador GT');
  });

  test('GET /api/players/gt-pl1?g=grupo-test → 200 (público del grupo)', async ({ request }) => {
    const res = await request.get('/api/players/gt-pl1?g=grupo-test');
    expect(res.status()).toBe(200);
  });
});

test.describe('paso B · players · authz como admin de Lomeros', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('NO puede crear jugador en grupo-test (403)', async ({ request }) => {
    const res = await request.post('/api/players', { data: { g: 'grupo-test', name: 'Intruso' } });
    expect(res.status()).toBe(403);
  });

  test('crea jugador en SU grupo (sin g) → 201', async ({ request }) => {
    const res = await request.post('/api/players', { data: { name: 'Nuevo Lomeros' } });
    expect(res.status()).toBe(201);
  });

  test('NO puede borrar un jugador de grupo-test (403)', async ({ request }) => {
    const res = await request.delete('/api/players/gt-pl1?g=grupo-test');
    expect(res.status()).toBe(403);
  });
});

test.describe('paso B · players · authz como admin de grupo-test', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  test('crea jugador en grupo-test (g) → 201', async ({ request }) => {
    const res = await request.post('/api/players', { data: { g: 'grupo-test', name: 'Nuevo GT' } });
    expect(res.status()).toBe(201);
  });
});
```

- [ ] **Step 2: Falla** — Run: `npx playwright test e2e/players-scoping.spec.ts` → FAIL (las rutas aún ignoran `?g=`/`g`; `?g=grupo-test` devuelve Lomeros y el admin de Lomeros puede crear en grupo-test).

- [ ] **Step 3: Migrar `src/app/api/players/route.ts`** — reemplazar el fichero entero por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { upsertPlayerUser } from '@/lib/auth/users';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { groupIdFromQuery, groupIdFromValue } from '@/lib/groups/request-group';
import { listPlayersByElo, createPlayerInGroup } from '@/lib/players/queries';

// GET /api/players?g=<slug> - jugadores del grupo indicado (público; por defecto = Lomeros)
export async function GET(request: NextRequest) {
  try {
    const groupId = (await groupIdFromQuery(request)) ?? (await getDefaultGroupId());
    const all = await listPlayersByElo(groupId);
    return NextResponse.json(all);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al obtener jugadores' }, { status: 500 });
  }
}

// POST /api/players - crear jugador (admin DEL GRUPO objetivo; grupo en body.g)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;

  try {
    const { name, nickname, avatarUrl, isLeftHanded, email, juegaPadel } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const player = await createPlayerInGroup(groupId, {
      name: name.trim(),
      nickname: nickname?.trim() || null,
      avatarUrl: avatarUrl?.trim() || null,
      isLeftHanded: !!isLeftHanded,
      juegaPadel: juegaPadel === false ? false : true,
      // La Timba v2: se arranca a 0; las fichas solo entran pagando el buy-in.
      tokenBalance: 0,
    });

    const result = await upsertPlayerUser(groupId, player.id, email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(player, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear jugador' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Migrar `src/app/api/players/[id]/route.ts`** — reemplazar el fichero entero por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { upsertPlayerUser } from '@/lib/auth/users';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { groupIdFromQuery, groupIdFromValue } from '@/lib/groups/request-group';
import { getPlayerInGroup, updatePlayerInGroup, deletePlayerInGroup } from '@/lib/players/queries';

// GET /api/players/[id]?g=<slug> (público; grupo por defecto = Lomeros)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const groupId = (await groupIdFromQuery(request)) ?? (await getDefaultGroupId());
    const player = await getPlayerInGroup(groupId, id);
    if (!player) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });
    return NextResponse.json(player);
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PUT /api/players/[id] (admin del grupo objetivo; grupo en body.g)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;

  try {
    const { id } = await params;
    const { name, nickname, avatarUrl, isLeftHanded, juegaPadel, email } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const updated = await updatePlayerInGroup(groupId, id, {
      name: name.trim(),
      nickname: nickname?.trim() || null,
      avatarUrl: avatarUrl?.trim() || null,
      isLeftHanded: !!isLeftHanded,
      // Solo se toca si viene en el body; una edición parcial no debe
      // resetear a un apostante (juegaPadel=false) de vuelta a jugador.
      ...(typeof juegaPadel === 'boolean' ? { juegaPadel } : {}),
    });

    if (!updated) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });

    const result = await upsertPlayerUser(groupId, id, email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// DELETE /api/players/[id]?g=<slug> (admin del grupo objetivo)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGroupAdmin(await groupIdFromQuery(request));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;
  try {
    const { id } = await params;
    await deletePlayerInGroup(groupId, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Pasan** — Run: `npx playwright test e2e/players-scoping.spec.ts` → PASS (todos). Run: `npm run check:db-access` → `✅` (las rutas siguen usando helpers de dominio, no acceso directo).

- [ ] **Step 6: Lint** — Run: `npm run lint` → sin errores nuevos (puede quedar el warning preexistente en `event-form.tsx`).

- [ ] **Step 7: Commit**
```bash
git add e2e/players-scoping.spec.ts "src/app/api/players/route.ts" "src/app/api/players/[id]/route.ts"
git commit -m "feat(fase2): players /api group-aware + authz por grupo objetivo (Paso B)"
```

---

## Task 5: Regresión + no-rotura de Lomeros

- [ ] **Step 1: Unit completa** — Run: `npm test` → PASS (incluye `request-group.test.ts` y `guard.test.ts`).
- [ ] **Step 2: e2e completa** — Run: `npm run e2e` → PASS (toda la suite existente, no-fuga incluida, + `players-scoping.spec.ts`). Es la prueba de que Lomeros no se rompe: las rutas players sin `?g=`/`g` se comportan igual.
- [ ] **Step 3: Guard** — Run: `npm run check:db-access` → `✅`.
- [ ] **Step 4: Diff acotado** — Run: `git diff --name-status main`. Esperado: solo `A` salvo `M` en `src/lib/auth/guard.ts`, `e2e/global-setup.ts`, `src/app/api/players/route.ts`, `src/app/api/players/[id]/route.ts`. `getSession`, `requireAdmin`, `proxy.ts`, y todos los demás dominios `/api` SIN tocar.
- [ ] **Step 5: Commit (si hubo fixup)** — si todo pasó sin cambios, nada que commitear.

---

## Self-Review (autor del plan)

**Cobertura:** resolutor de grupo (Task 1) ✓; guard authz por grupo objetivo (Task 2) ✓; fixture admin grupo-test (Task 3) ✓; players group-aware + authz, GET público `?g=`, mutaciones body `g`, DELETE `?g=` (Task 4) ✓; no-rotura (Task 5: sin `g` → default = Lomeros, suite existente verde) ✓.

**No-placeholders:** cada step lleva comando y código completos.

**Consistencia de nombres:** `groupIdFromQuery`/`groupIdFromValue` (Task 1) se consumen idénticos en Task 4; `requireGroupAdmin` (Task 2) idem; `getGroupBySlug`/`getDefaultGroupId`/helpers de players ya existen.

**Seguridad:** la authz va contra el grupo objetivo (un admin de Lomeros → 403 en grupo-test); super_admin es solo-lectura (403 en escrituras). Sin `g` → única membership (Lomeros) → idéntico.

---

## Próximo paso tras B1

Plan B2 (matches), reutilizando `groupIdFromQuery`/`groupIdFromValue` + `requireGroupAdmin`. Luego betting/timba (necesitará además un `requireGroupSession` para rutas de jugador), tournaments, rewards, rankings, me.
