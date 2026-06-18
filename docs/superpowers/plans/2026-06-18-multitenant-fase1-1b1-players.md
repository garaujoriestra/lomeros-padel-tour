# Fase 1 · Paso 1B-1 — Scoping del dominio de jugadores + arnés de no-fuga (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scopear por `group_id` toda la superficie CRUD/listado de la tabla `players` (rutas `api/players*` y páginas `admin/players*`) a través de un módulo de consulta por dominio, y montar el arnés del **test e2e de no-fuga** con sus primeras aserciones de aislamiento entre grupos — sin cambiar nada visible para Lomeros.

**Architecture:** Un módulo `src/lib/players/queries.ts` expone funciones que SIEMPRE reciben `groupId` e inyectan el filtro (`eq(players.groupId, groupId)`) en cada read/write, y fijan `groupId` en los inserts. Las rutas/páginas obtienen el `groupId` del contexto: `getGroupContext()` en lo autenticado, `getDefaultGroupId()` en lo público. Comportamiento idéntico para Lomeros (un solo grupo real); el aislamiento se demuestra sembrando un 2º grupo en e2e.

**Tech Stack:** Next.js (App Router) · Drizzle ORM · libSQL/Turso · Vitest · Playwright.

**Alcance (afinado respecto al spec):** SOLO la tabla raíz `players` en su superficie directa (listar, CRUD, admin). El inventario reveló que **rankings y perfil agregan tablas hijas** (`ratingHistory`, `pairStats`, `playerAchievements`, `penalties`) que no tienen `group_id` y se scopean vía FK al padre; esas vistas viajan con sus hijas en **1B-2** (matches + rating). Aquí NO se tocan: `profile-data.ts`, las páginas `rankings/*`, `api/rankings`, la home, `pairings/preview`, ni `potEuros`. Resolutor: `src/lib/auth/group-context.ts` (de 1B-0).

---

## Decisiones clave

1. **`groupId` del contexto, no del caller.** Lo público usa `getDefaultGroupId()` (hoy Lomeros). Lo autenticado usa `getGroupContext()`; como en Fase 1 no hay rol-por-membership cableado aún, se usa `ctx?.groupId ?? await getDefaultGroupId()` (el fallback solo cubre el caso imposible de admin sin contexto; en un solo grupo equivale a Lomeros).
2. **Los guards no se tocan.** `requireAdmin()` sigue autorizando por rol del JWT; `getGroupContext()` se usa SOLO para obtener el `groupId`. Unificar guard+contexto es trabajo posterior (1C).
3. **El test de scoping es el e2e de no-fuga** (Task 3). Las funciones de `queries.ts` son finas; su garantía (el filtro `groupId`) se verifica end-to-end por las aserciones de aislamiento, no por un unit con DB mockeada.
4. **Aserciones de no-fuga posibles en Fase 1 (sin routing por slug):** lo público siempre resuelve al grupo por defecto (Lomeros) y nunca ve el 2º grupo; y un admin de Lomeros no puede tocar por id un jugador de otro grupo (404). La vista *positiva* cross-grupo es Fase 2.

---

## File Structure

**Crear:**
- `src/lib/players/queries.ts` — funciones de consulta de `players` scopeadas por `groupId`.
- `e2e/no-fuga-players.spec.ts` — aserciones de aislamiento del dominio de jugadores.

**Modificar:**
- `src/app/api/players/route.ts` — GET (público) y POST (admin) vía el módulo.
- `src/app/api/players/[id]/route.ts` — GET (público), PUT/DELETE (admin) vía el módulo.
- `src/app/admin/players/page.tsx` — listado vía el módulo.
- `src/app/admin/players/[id]/edit/page.tsx` — lectura del jugador vía el módulo.
- `e2e/global-setup.ts` — sembrar un 2º grupo "Grupo Test" con un jugador propio.

---

## Task 1: Módulo de consulta de jugadores scopeado

**Files:**
- Create: `src/lib/players/queries.ts`

- [ ] **Step 1: Crear el módulo**

`src/lib/players/queries.ts`:

```ts
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, type NewPlayer, type Player } from '@/lib/db/schema';

// Jugadores del grupo, ordenados por ELO descendente.
export async function listPlayersByElo(groupId: string): Promise<Player[]> {
  return db.select().from(players).where(eq(players.groupId, groupId)).orderBy(desc(players.eloRating));
}

// Un jugador del grupo (undefined si no existe o es de otro grupo).
export async function getPlayerInGroup(groupId: string, id: string): Promise<Player | undefined> {
  const [p] = await db
    .select()
    .from(players)
    .where(and(eq(players.id, id), eq(players.groupId, groupId)));
  return p;
}

// Crea un jugador en el grupo (fija groupId del contexto, no del caller).
export async function createPlayerInGroup(
  groupId: string,
  values: Omit<NewPlayer, 'id' | 'groupId'>,
): Promise<Player> {
  const [p] = await db.insert(players).values({ ...values, groupId }).returning();
  return p;
}

// Actualiza un jugador del grupo. undefined si no existe en el grupo (id de otro grupo no se toca).
export async function updatePlayerInGroup(
  groupId: string,
  id: string,
  values: Partial<Omit<NewPlayer, 'id' | 'groupId'>>,
): Promise<Player | undefined> {
  const [p] = await db
    .update(players)
    .set(values)
    .where(and(eq(players.id, id), eq(players.groupId, groupId)))
    .returning();
  return p;
}

// Borra un jugador del grupo (un id de otro grupo no borra nada).
export async function deletePlayerInGroup(groupId: string, id: string): Promise<void> {
  await db.delete(players).where(and(eq(players.id, id), eq(players.groupId, groupId)));
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/players/queries.ts
git commit -m "feat(multitenant): módulo de consulta de players scopeado por groupId (1B-1)"
```

---

## Task 2: Cablear las rutas y páginas de jugadores

**Files:**
- Modify: `src/app/api/players/route.ts`
- Modify: `src/app/api/players/[id]/route.ts`
- Modify: `src/app/admin/players/page.tsx`
- Modify: `src/app/admin/players/[id]/edit/page.tsx`

- [ ] **Step 1: `api/players/route.ts`**

Reemplazar el contenido por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { upsertPlayerUser } from '@/lib/auth/users';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { listPlayersByElo, createPlayerInGroup } from '@/lib/players/queries';

// GET /api/players - listar los jugadores del grupo por defecto (público)
export async function GET() {
  try {
    const groupId = await getDefaultGroupId();
    const all = await listPlayersByElo(groupId);
    return NextResponse.json(all);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al obtener jugadores' }, { status: 500 });
  }
}

// POST /api/players - crear jugador (admin)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const body = await request.json();
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

    const result = await upsertPlayerUser(player.id, email);
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

- [ ] **Step 2: `api/players/[id]/route.ts`**

Reemplazar el contenido por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { upsertPlayerUser } from '@/lib/auth/users';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getPlayerInGroup, updatePlayerInGroup, deletePlayerInGroup } from '@/lib/players/queries';

// GET /api/players/[id] (público; grupo por defecto)
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const groupId = await getDefaultGroupId();
    const player = await getPlayerInGroup(groupId, id);
    if (!player) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });
    return NextResponse.json(player);
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PUT /api/players/[id] (admin)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const body = await request.json();
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

    const result = await upsertPlayerUser(id, email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// DELETE /api/players/[id] (admin)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    await deletePlayerInGroup(groupId, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
```

- [ ] **Step 3: `admin/players/page.tsx`**

Reemplazar las dos primeras líneas de imports + el cuerpo de obtención de datos. Cambiar el bloque de imports superior:

```ts
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
```

por:

```ts
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { listPlayersByElo } from '@/lib/players/queries';
```

Y cambiar la línea de la query:

```ts
  const allPlayers = await db.select().from(players).orderBy(desc(players.eloRating));
```

por:

```ts
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const allPlayers = await listPlayersByElo(groupId);
```

- [ ] **Step 4: `admin/players/[id]/edit/page.tsx`**

Cambiar los imports superiores:

```ts
import { db } from '@/lib/db';
import { players, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
```

por:

```ts
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getPlayerInGroup } from '@/lib/players/queries';
```

Y cambiar:

```ts
  const { id } = await params;
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) notFound();
```

por:

```ts
  const { id } = await params;
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const player = await getPlayerInGroup(groupId, id);
  if (!player) notFound();
```

(La query de `users` por `playerId` se deja igual: `users` no es tabla tenant.)

- [ ] **Step 5: Verificar tipos y suite unit**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx vitest run`
Expected: toda la suite unit en verde (no hay tests unit nuevos; confirma que nada se rompió).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/players/route.ts "src/app/api/players/[id]/route.ts" src/app/admin/players/page.tsx "src/app/admin/players/[id]/edit/page.tsx"
git commit -m "feat(multitenant): rutas y páginas de jugadores scopeadas por grupo (1B-1)"
```

---

## Task 3: Arnés y test e2e de no-fuga (jugadores)

**Files:**
- Modify: `e2e/global-setup.ts`
- Create: `e2e/no-fuga-players.spec.ts`

- [ ] **Step 1: Sembrar un 2º grupo en el global-setup**

En `e2e/global-setup.ts`, justo después del bloque que siembra las `memberships` (las dos `INSERT OR IGNORE INTO memberships ...`) y antes del comentario `// 3) storageStates`, insertar:

```ts
  // Segundo grupo "Grupo Test" con un jugador propio, para los tests de no-fuga.
  // Lomeros nunca debe ver a gt-pl1, ni poder tocarlo por id.
  await db.execute({
    sql: 'INSERT OR IGNORE INTO groups (id, slug, name) VALUES (?, ?, ?)',
    args: ['grupo-test', 'grupo-test', 'Grupo Test'],
  });
  await db.execute({
    sql: 'INSERT OR IGNORE INTO players (id, group_id, name) VALUES (?, ?, ?)',
    args: ['gt-pl1', 'grupo-test', 'Jugador GT'],
  });
```

- [ ] **Step 2: Crear el spec de no-fuga (fallará sin el scoping)**

`e2e/no-fuga-players.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// Aislamiento entre grupos para el dominio de jugadores. El global-setup crea un
// segundo grupo "Grupo Test" con el jugador gt-pl1; el grupo por defecto es Lomeros.
test.describe('no-fuga · jugadores (público)', () => {
  test('la lista pública solo muestra el grupo por defecto (Lomeros)', async ({ request }) => {
    const res = await request.get('/api/players');
    expect(res.ok()).toBeTruthy();
    const list = (await res.json()) as Array<{ id: string }>;
    const ids = list.map((p) => p.id);
    expect(ids).toContain('pl1');       // jugador de Lomeros, sí
    expect(ids).not.toContain('gt-pl1'); // jugador de otro grupo, no
  });

  test('GET por id de un jugador de otro grupo da 404', async ({ request }) => {
    const res = await request.get('/api/players/gt-pl1');
    expect(res.status()).toBe(404);
  });
});

test.describe('no-fuga · jugadores (admin de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('un admin de Lomeros no puede editar por id un jugador de otro grupo (404)', async ({ request }) => {
    const res = await request.put('/api/players/gt-pl1', { data: { name: 'Hackeado' } });
    expect(res.status()).toBe(404);
  });
});
```

- [ ] **Step 3: Ejecutar la suite e2e completa**

Run: `npm run e2e`
Expected: PASS — todos los specs verdes, incluido `no-fuga-players` (3 tests). Las aserciones de no-fuga pasan porque el dominio de jugadores ya va scopeado; el resto de specs siguen verdes (comportamiento idéntico para Lomeros).

(Nota TDD: si se ejecutase `no-fuga-players` ANTES de la Task 2, el primer test fallaría — la lista pública incluiría `gt-pl1` —, lo que confirma que el test verifica el scoping real.)

- [ ] **Step 4: Commit**

```bash
git add e2e/global-setup.ts e2e/no-fuga-players.spec.ts
git commit -m "test(e2e): no-fuga del dominio de jugadores + seed de 2º grupo (1B-1)"
```

---

## Self-review (cobertura del spec 1B para 1B-1)

- **Módulo de consulta por dominio que inyecta groupId (spec §1):** `players/queries.ts` con read/write scopeados e insert que fija groupId. Task 1. ✔
- **Rutas/páginas dejan de tocar `db` directo para `players` (spec §1):** las 4 sitios migrados al módulo. Task 2. ✔
- **groupId del contexto: público→default, autenticado→getGroupContext (spec §1):** aplicado por sitio. Task 2. ✔
- **Test e2e de no-fuga + seed de 2º grupo (spec §3):** arnés + 3 aserciones de aislamiento. Task 3. ✔
- **Comportamiento idéntico para Lomeros (spec §0):** un solo grupo real; suite existente verde. ✔
- **Alcance afinado (rankings/perfil → 1B-2 con sus hijas):** documentado arriba; aquí solo la tabla `players`. ✔

Sin placeholders. Nombres consistentes: `listPlayersByElo` / `getPlayerInGroup` / `createPlayerInGroup` / `updatePlayerInGroup` / `deletePlayerInGroup` usados igual en módulo, rutas, páginas y referidos por el e2e.
