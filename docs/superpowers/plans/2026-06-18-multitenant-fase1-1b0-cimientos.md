# Fase 1 · Paso 1B-0 — Cimientos del DAL scopeado (plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sentar los cimientos del scoping multi-tenant — declarar `groupId` en el schema Drizzle de las tablas raíz, crear el resolutor `getGroupContext()`/`getDefaultGroupId()` con tests, y sembrar las `memberships` de los usuarios e2e — **sin scopear ninguna query de negocio todavía y sin cambiar nada visible**.

**Architecture:** Aditivo y de comportamiento idéntico. `groupId` entra en el schema Drizzle con `.default(LOMEROS_GROUP_ID)` para no romper inserts ni el build; la lógica de resolución de contexto se extrae a una función pura testeable (`resolveGroupContext`) más finas envolturas de DB. No hay migración de base de datos (la columna física ya existe desde 1A). No se toca ningún call-site de negocio ni los guards de auth.

**Tech Stack:** Next.js (App Router) · Drizzle ORM · `@libsql/client` (Turso/SQLite) · Vitest · Playwright.

**Alcance:** SOLO el sub-paso 1B-0 (ver `docs/superpowers/specs/2026-06-18-multitenant-fase1-1b-design.md`, §1-2). Los sub-pasos 1B-1..1B-5 (scopear cada dominio, arnés y aserciones de no-fuga, capstone) tendrán su propio plan.

> **Nota de alcance (refinamiento TDD):** el **arnés del test e2e de no-fuga** se construye en **1B-1**, junto a su primera aserción real. En 1B-0 todavía no hay ninguna query scopeada, así que no habría nada que aseverar; construir el arnés ahora sería infra sin consumidor. 1B-0 sí deja sembradas las `memberships` e2e que 1B-1 necesitará.

---

## Decisiones clave (leer antes de empezar)

1. **`groupId` con `.default(LOMEROS_GROUP_ID)` en el schema Drizzle.** Mantiene el campo opcional en los inserts → todos los call-sites existentes siguen compilando y escribiendo Lomeros sin tocarlos. El `.default()` se ELIMINARÁ en el capstone 1B-5, cuando el DAL fije `groupId` explícito siempre.
2. **Drizzle inyecta el default en cada INSERT y enumera columnas en cada SELECT.** Como la columna física ya existe en prod (1A), reads/writes no fallan (deploy ventana-cero). Pero el **harness de torneo en memoria** (`schema-ddl.ts`, `test-db.ts`) sí necesita la columna `group_id` (Drizzle la referencia en sus INSERT/SELECT) — se re-añade aquí (1A la había revertido).
3. **Lógica de resolución pura y separada.** `resolveGroupContext()` es una función pura (sin DB) — fácil de testear, espejo del patrón `decideAccess()` en `src/lib/auth/authorize.ts`. Las envolturas con DB (`getGroupContext`, `getDefaultGroupId`) son finas y se ejercitan vía e2e a partir de 1B-1.
4. **No se tocan los guards (`requireAdmin`/`requireSession`) ni el JWT.** El rol sigue saliendo del JWT hasta 1C. `getGroupContext` es una pieza nueva e independiente, aún no cableada en rutas.

---

## File Structure

**Crear:**
- `src/lib/auth/group-context.ts` — `GroupContext`, `resolveGroupContext` (pura), `isSuperAdminEmail` (pura), `getDefaultGroupId` y `getGroupContext` (DB). Responsabilidad única: resolver el tenant de un request.
- `src/lib/auth/group-context.test.ts` — Unit de las partes puras.

**Modificar:**
- `src/lib/db/schema.ts` — `groupId` en `players`, `matches`, `rewards`, `tournaments`.
- `src/lib/tournament/schema-ddl.ts` — `group_id` en el CREATE de `tournaments`.
- `src/lib/tournament/test-db.ts` — tabla stub `groups` + `group_id` en el stub `players`.
- `e2e/global-setup.ts` — sembrar `memberships` en Lomeros para los usuarios e2e.

---

## Task 1: `groupId` en el schema Drizzle + harness de torneo

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/tournament/schema-ddl.ts`
- Modify: `src/lib/tournament/test-db.ts`

- [ ] **Step 1: Importar la constante del grupo ancla en el schema**

En `src/lib/db/schema.ts`, añadir tras `import { sql } from 'drizzle-orm';`:

```ts
import { LOMEROS_GROUP_ID } from '@/lib/groups/constants';
```

- [ ] **Step 2: Añadir `groupId` a las 4 tablas raíz**

En `src/lib/db/schema.ts`, en `players`, `matches`, `rewards` y `tournaments`, añadir como primer campo tras la línea `id: ...,`:

```ts
  // TEMPORAL 1B: default = Lomeros para no romper inserts/build. El .default se elimina en 1B-5.
  groupId: text('group_id').notNull().default(LOMEROS_GROUP_ID).references(() => groups.id),
```

(`groups` ya está declarada arriba del todo del fichero, así que la referencia resuelve.)

- [ ] **Step 3: Añadir `group_id` al DDL de `tournaments` del harness**

En `src/lib/tournament/schema-ddl.ts`, en el `CREATE TABLE IF NOT EXISTS tournaments (`, añadir tras `id TEXT PRIMARY KEY,`:

```sql
    group_id TEXT NOT NULL DEFAULT 'lomeros',
```

- [ ] **Step 4: Añadir `groups` y `group_id` al stub de test**

En `src/lib/tournament/test-db.ts`, reemplazar el array `TEST_STUB_DDL` por:

```ts
const TEST_STUB_DDL = [
  `CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL DEFAULT 'lomeros',
    name TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'player'
  )`,
];
```

- [ ] **Step 5: Verificar tipos y suite unit completa**

Run: `npx tsc --noEmit`
Expected: sin errores (los inserts existentes siguen compilando gracias a `.default()`).

Run: `npx vitest run`
Expected: toda la suite unit en verde (los tests de torneo pasan porque el harness ya tiene `group_id`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/lib/tournament/schema-ddl.ts src/lib/tournament/test-db.ts
git commit -m "feat(multitenant): groupId en el schema Drizzle de las tablas raíz (1B-0)"
```

---

## Task 2: Resolutor de contexto de grupo (TDD)

**Files:**
- Create: `src/lib/auth/group-context.ts`
- Test: `src/lib/auth/group-context.test.ts`

- [ ] **Step 1: Escribir los tests de las partes puras (fallarán)**

`src/lib/auth/group-context.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { resolveGroupContext, isSuperAdminEmail, type MembershipRow } from './group-context';

const lomerosMember: MembershipRow = { id: 'm1', groupId: 'lomeros', role: 'admin', playerId: 'p1' };

describe('resolveGroupContext', () => {
  it('usa la única membership cuando no se pide un grupo concreto', () => {
    const ctx = resolveGroupContext({ memberships: [lomerosMember], isSuperAdmin: false, targetGroupId: null });
    expect(ctx).toEqual({ groupId: 'lomeros', role: 'admin', membershipId: 'm1', playerId: 'p1', isSuperAdmin: false });
  });

  it('usa la membership del grupo objetivo si existe', () => {
    const other: MembershipRow = { id: 'm2', groupId: 'g2', role: 'player', playerId: 'p9' };
    const ctx = resolveGroupContext({ memberships: [lomerosMember, other], isSuperAdmin: false, targetGroupId: 'g2' });
    expect(ctx).toEqual({ groupId: 'g2', role: 'player', membershipId: 'm2', playerId: 'p9', isSuperAdmin: false });
  });

  it('en su propio grupo, un super-admin es miembro normal (la membership manda)', () => {
    const ctx = resolveGroupContext({ memberships: [lomerosMember], isSuperAdmin: true, targetGroupId: 'lomeros' });
    expect(ctx?.role).toBe('admin');
    expect(ctx?.isSuperAdmin).toBe(true);
    expect(ctx?.playerId).toBe('p1');
  });

  it('da contexto super_admin solo-lectura en un grupo donde NO es miembro', () => {
    const ctx = resolveGroupContext({ memberships: [lomerosMember], isSuperAdmin: true, targetGroupId: 'g2' });
    expect(ctx).toEqual({ groupId: 'g2', role: 'super_admin', membershipId: null, playerId: null, isSuperAdmin: true });
  });

  it('devuelve null si no hay membership y no es super-admin', () => {
    expect(resolveGroupContext({ memberships: [], isSuperAdmin: false, targetGroupId: 'g2' })).toBeNull();
  });

  it('devuelve null si hay varias memberships y no se especifica grupo objetivo', () => {
    const other: MembershipRow = { id: 'm2', groupId: 'g2', role: 'player', playerId: null };
    expect(resolveGroupContext({ memberships: [lomerosMember, other], isSuperAdmin: false, targetGroupId: null })).toBeNull();
  });
});

describe('isSuperAdminEmail', () => {
  const original = process.env.SUPER_ADMIN_EMAILS;
  afterEach(() => { process.env.SUPER_ADMIN_EMAILS = original; });

  it('reconoce un email del allowlist (case-insensitive, con espacios)', () => {
    process.env.SUPER_ADMIN_EMAILS = 'Owner@Example.com , otro@x.com';
    expect(isSuperAdminEmail('owner@example.com')).toBe(true);
    expect(isSuperAdminEmail(' OTRO@x.com ')).toBe(true);
  });

  it('rechaza emails fuera del allowlist y con el env vacío', () => {
    process.env.SUPER_ADMIN_EMAILS = 'owner@example.com';
    expect(isSuperAdminEmail('intruso@x.com')).toBe(false);
    process.env.SUPER_ADMIN_EMAILS = '';
    expect(isSuperAdminEmail('owner@example.com')).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx vitest run src/lib/auth/group-context.test.ts`
Expected: FAIL — `Failed to resolve import "./group-context"`.

- [ ] **Step 3: Implementar el módulo**

`src/lib/auth/group-context.ts`:

```ts
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groups, memberships } from '@/lib/db/schema';
import { LOMEROS_GROUP_ID, LOMEROS_GROUP_SLUG } from '@/lib/groups/constants';
import { getSession } from './session';

export interface GroupContext {
  groupId: string;
  role: 'admin' | 'player' | 'super_admin';
  membershipId: string | null;
  playerId: string | null;
  isSuperAdmin: boolean;
}

export interface MembershipRow {
  id: string;
  groupId: string;
  role: 'admin' | 'player';
  playerId: string | null;
}

// Pura: decide el contexto a partir de las memberships del usuario, si es super-admin,
// y el grupo objetivo (null = usar la única membership; hasta que la Fase 2 lo meta en la URL).
export function resolveGroupContext(input: {
  memberships: MembershipRow[];
  isSuperAdmin: boolean;
  targetGroupId: string | null;
}): GroupContext | null {
  const { memberships: rows, isSuperAdmin, targetGroupId } = input;

  const membership = targetGroupId
    ? rows.find((m) => m.groupId === targetGroupId)
    : rows.length === 1
      ? rows[0]
      : undefined;

  if (membership) {
    return {
      groupId: membership.groupId,
      role: membership.role,
      membershipId: membership.id,
      playerId: membership.playerId,
      isSuperAdmin,
    };
  }

  if (isSuperAdmin && targetGroupId) {
    return {
      groupId: targetGroupId,
      role: 'super_admin',
      membershipId: null,
      playerId: null,
      isSuperAdmin: true,
    };
  }

  return null;
}

// Pura: ¿el email está en el allowlist de súper-admins (env SUPER_ADMIN_EMAILS)?
export function isSuperAdminEmail(email: string): boolean {
  const allow = (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.trim().toLowerCase());
}

// Id del grupo por defecto para páginas públicas/no-auth (env DEFAULT_GROUP_SLUG, hoy 'lomeros').
export async function getDefaultGroupId(): Promise<string> {
  const slug = (process.env.DEFAULT_GROUP_SLUG ?? LOMEROS_GROUP_SLUG).trim();
  const [g] = await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, slug));
  return g?.id ?? LOMEROS_GROUP_ID;
}

// Contexto de grupo de un request autenticado (o null si no hay acceso). Aún no cableado en rutas (1B-1+).
export async function getGroupContext(
  opts: { targetGroupId?: string } = {},
): Promise<GroupContext | null> {
  const session = await getSession();
  if (!session) return null;

  const rows = await db
    .select({
      id: memberships.id,
      groupId: memberships.groupId,
      role: memberships.role,
      playerId: memberships.playerId,
    })
    .from(memberships)
    .where(eq(memberships.userId, session.userId));

  return resolveGroupContext({
    memberships: rows as MembershipRow[],
    isSuperAdmin: isSuperAdminEmail(session.email),
    targetGroupId: opts.targetGroupId ?? null,
  });
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `npx vitest run src/lib/auth/group-context.test.ts`
Expected: PASS — 8 tests verdes.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/group-context.ts src/lib/auth/group-context.test.ts
git commit -m "feat(multitenant): resolutor getGroupContext/getDefaultGroupId con lógica pura testeada (1B-0)"
```

---

## Task 3: Sembrar `memberships` de los usuarios e2e

**Files:**
- Modify: `e2e/global-setup.ts`

- [ ] **Step 1: Insertar las memberships en Lomeros tras sembrar los usuarios**

En `e2e/global-setup.ts`, justo después del bloque que resuelve `adminId` (la línea `if (!adminId) throw new Error(...)`) y antes del comentario `// 3) storageStates`, insertar:

```ts
  // memberships en Lomeros para los usuarios e2e. migrate-multitenant corrió en el paso 1
  // (antes de sembrar estos usuarios), así que su backfill no los cubrió: los añadimos aquí.
  await db.execute({
    sql: 'INSERT OR IGNORE INTO memberships (id, user_id, group_id, role, player_id) VALUES (?, ?, ?, ?, ?)',
    args: ['mb-admin', adminId, 'lomeros', 'admin', null],
  });
  await db.execute({
    sql: 'INSERT OR IGNORE INTO memberships (id, user_id, group_id, role, player_id) VALUES (?, ?, ?, ?, ?)',
    args: ['mb-player', playerUserId, 'lomeros', 'player', 'pl1'],
  });
```

- [ ] **Step 2: Actualizar el comentario del bucle de migraciones**

En `e2e/global-setup.ts`, el comentario `// OJO (para 1B): migrate-multitenant backfilla ...` que precede al bucle de migraciones del paso 1 ya no aplica (1B-0 siembra las memberships). Reemplazar ese bloque de comentario (las 4 líneas que empiezan por `// OJO (para 1B):`) por:

```ts
  // (Las memberships de estos usuarios e2e se siembran en el paso 2, porque migrate-multitenant
  // corre aquí antes de que existan los usuarios.)
```

- [ ] **Step 3: Ejecutar la suite e2e completa**

Run: `npm run e2e`
Expected: PASS — todos los specs verdes (comportamiento idéntico; solo se han añadido filas en `memberships`).

- [ ] **Step 4: Commit**

```bash
git add e2e/global-setup.ts
git commit -m "test(e2e): siembra memberships en Lomeros para los usuarios e2e (1B-0)"
```

---

## Self-review (cobertura del spec 1B, §1-2 para 1B-0)

- **`groupId` al schema Drizzle (4 raíz) con `.default` temporal (spec §1):** Task 1. ✔
- **Re-añadir `group_id` al harness de torneo (spec §1, decisión 2):** Task 1. ✔
- **`getGroupContext()` + `getDefaultGroupId()` con tests unit (spec §1, §3):** Task 2 (lógica pura testeada; envolturas DB ejercitadas vía e2e desde 1B-1). ✔
- **Sembrar memberships e2e (spec §3 nota / hallazgo de review de 1A):** Task 3. ✔
- **Sin scopear queries de negocio aún / comportamiento idéntico (spec §0, §2 fila 1B-0):** ninguna query de negocio se toca; suite existente verde. ✔
- **Arnés del test e2e de no-fuga:** se difiere a 1B-1 (refinamiento TDD documentado arriba), con su primera aserción real. ✔

Sin placeholders. Nombres consistentes: `resolveGroupContext` / `getGroupContext` / `getDefaultGroupId` / `isSuperAdminEmail` / `MembershipRow` / `GroupContext` usados igual en módulo y tests.
