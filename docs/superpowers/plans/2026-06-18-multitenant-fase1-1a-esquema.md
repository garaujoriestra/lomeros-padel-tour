# Fase 1 · Paso 1A — Esquema + backfill multi-tenant (plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introducir el modelo multi-tenant en la base de datos (tabla `groups` con Lomeros como grupo #1, tabla `memberships` backfilada desde `users`, y columna `group_id` en las tablas raíz tenant) **sin cambiar absolutamente nada visible ni romper Lomeros en producción**.

**Architecture:** Migración idempotente, aditiva y testeable, extraída a una función pura `migrateMultitenant(client)` que comparten la ruta `/api/migrate-multitenant` (prod + dev), el setup de e2e y un test de integración contra una DB libSQL en memoria. La columna `group_id` se añade como `NOT NULL DEFAULT 'lomeros'`: el DEFAULT backfilla las filas existentes y actúa como **red de seguridad** para escrituras durante la migración ruta-a-ruta del paso 1B. No se borra nada de `users` (el contract es el paso 1C).

**Tech Stack:** Next.js (App Router) · Drizzle ORM · `@libsql/client` (Turso/SQLite) · Vitest · Playwright.

**Alcance:** SOLO el paso 1A del rollout de la Fase 1 (ver spec `docs/superpowers/specs/2026-06-18-multitenant-fase1-design.md`, §9). Los pasos 1B (contexto + DAL scopeado), 1C (roles/enlace → memberships) y 1D (namespacing transversal) tendrán su propio plan cuando 1A esté en producción.

---

## File Structure

**Crear:**
- `src/lib/groups/constants.ts` — Constantes del grupo ancla Lomeros (id/slug/name). Sin dependencias; importable desde schema, migración y tests.
- `src/lib/db/migrations/multitenant.ts` — `migrateMultitenant(client)`: lógica de migración idempotente + reporte de verificación. Única fuente de verdad de la migración.
- `src/lib/db/migrations/multitenant.test.ts` — Test de integración contra libSQL en memoria.
- `src/app/api/migrate-multitenant/route.ts` — Endpoint POST que ejecuta la migración (patrón `/api/migrate-*` del repo).

**Modificar:**
- `src/lib/db/schema.ts` — Añadir SOLO las tablas `groups` y `memberships` + sus tipos. (`groupId` en las tablas raíz se difiere a 1B por seguridad de deploy; ver Decisión #3.)
- `src/lib/db/index.ts` — Exportar el `client` libSQL (lo necesita la ruta de migración).
- `e2e/global-setup.ts` — Ejecutar `migrate-multitenant` en la lista de migraciones de arranque.

**Por qué esta forma:** la lógica de migración vive en UN módulo (`migrations/multitenant.ts`) y la consumen tres sitios (ruta, e2e vía la ruta, y test directo). DRY: no se duplica el SQL. El reporte de verificación lo devuelve la propia función, así sirve de check de integridad tanto en el test como tras el `curl` de producción.

---

## Decisiones clave (leer antes de empezar)

1. **`group_id` = `NOT NULL DEFAULT 'lomeros'` vía `ALTER TABLE ADD COLUMN`.** SQLite permite añadir una columna NOT NULL si tiene DEFAULT no nulo → no hace falta recrear tablas. El DEFAULT backfilla las filas existentes a Lomeros en el acto.
2. **Sin `REFERENCES` en el `ALTER`.** SQLite prohíbe `ADD COLUMN` con `REFERENCES` y DEFAULT no nulo a la vez. La columna física no lleva FK; la FK lógica se declarará en el schema Drizzle en 1B. Es intencional y suficiente.
3. **`group_id` NO se declara en el schema Drizzle de las tablas raíz en 1A (deploy ventana-cero).** Drizzle inyecta el `.default()` en cada INSERT y enumera columnas en cada SELECT. Si declarásemos `groupId` en el schema de `players`/`matches`/`rewards`/`tournaments` ahora, entre el deploy de 1A y el `curl` de migración las lecturas del núcleo (home, jugadores, partidos) harían `SELECT group_id` sobre una columna inexistente → **500 en toda la web**. Por eso 1A solo declara en el schema las tablas NUEVAS `groups`/`memberships` (que ningún código de 1A consulta aún), y la columna física `group_id` la crea la migración. `groupId` entra en el schema Drizzle en el paso **1B**, cuando las queries lo usan y la columna **ya existe** en prod → sin ventana. Los call-sites de insert existentes no se tocan en 1A.
4. **`users` no se toca** (`role`/`player_id` siguen). Borrarlos es el contract del paso 1C.
5. **Idempotencia:** cada paso comprueba existencia (tabla/columna/fila) antes de actuar; ejecutar la migración dos veces es seguro.

---

## Task 1: Migración + constantes (TDD con test de integración)

**Files:**
- Create: `src/lib/groups/constants.ts`
- Create: `src/lib/db/migrations/multitenant.ts`
- Test: `src/lib/db/migrations/multitenant.test.ts`

- [ ] **Step 1: Crear las constantes del grupo ancla**

`src/lib/groups/constants.ts`:

```ts
/** Grupo ancla (tenant #1). Sus filas existentes se backfillan a este id en la
 *  migración 1A; el id se usa además como DEFAULT de la columna group_id. */
export const LOMEROS_GROUP_ID = 'lomeros';
export const LOMEROS_GROUP_SLUG = 'lomeros';
export const LOMEROS_GROUP_NAME = 'Lomeros Padel Tour';
```

- [ ] **Step 2: Escribir el test de integración (fallará)**

`src/lib/db/migrations/multitenant.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { migrateMultitenant } from './multitenant';
import { LOMEROS_GROUP_ID, LOMEROS_GROUP_SLUG } from '@/lib/groups/constants';

// Crea un esquema pre-migración mínimo y lo siembra con datos sin group_id.
async function seedPreMigration(client: Client) {
  await client.execute(`CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  await client.execute(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'player', player_id TEXT)`);
  await client.execute(`CREATE TABLE matches (id TEXT PRIMARY KEY, date TEXT NOT NULL)`);
  await client.execute(`CREATE TABLE rewards (id TEXT PRIMARY KEY, title TEXT NOT NULL)`);
  await client.execute(`CREATE TABLE tournaments (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);

  await client.execute(`INSERT INTO players (id, name) VALUES ('p1','Ana'), ('p2','Bea')`);
  await client.execute(`INSERT INTO users (id, email, role, player_id) VALUES ('u1','admin@x.com','admin','p1'), ('u2','bea@x.com','player','p2')`);
  await client.execute(`INSERT INTO matches (id, date) VALUES ('m1','2026-01-01')`);
  await client.execute(`INSERT INTO rewards (id, title) VALUES ('r1','Cerveza')`);
  await client.execute(`INSERT INTO tournaments (id, name) VALUES ('t1','Open')`);
}

describe('migrateMultitenant', () => {
  let client: Client;
  beforeEach(async () => {
    client = createClient({ url: ':memory:' });
    await seedPreMigration(client);
  });

  it('crea el grupo Lomeros como grupo #1', async () => {
    await migrateMultitenant(client);
    const res = await client.execute(`SELECT id, slug FROM groups`);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0][0]).toBe(LOMEROS_GROUP_ID);
    expect(res.rows[0][1]).toBe(LOMEROS_GROUP_SLUG);
  });

  it('backfilla una membership en Lomeros por cada user, preservando role y player_id', async () => {
    await migrateMultitenant(client);
    const res = await client.execute(`SELECT user_id, group_id, role, player_id FROM memberships ORDER BY user_id`);
    expect(res.rows.length).toBe(2);
    expect(res.rows[0][0]).toBe('u1');
    expect(res.rows[0][1]).toBe(LOMEROS_GROUP_ID);
    expect(res.rows[0][2]).toBe('admin');
    expect(res.rows[0][3]).toBe('p1');
    expect(res.rows[1][0]).toBe('u2');
    expect(res.rows[1][2]).toBe('player');
    expect(res.rows[1][3]).toBe('p2');
  });

  it('añade group_id=Lomeros a todas las filas de las tablas raíz tenant', async () => {
    await migrateMultitenant(client);
    for (const table of ['players', 'matches', 'rewards', 'tournaments']) {
      const withGroup = await client.execute(`SELECT count(*) FROM ${table} WHERE group_id = '${LOMEROS_GROUP_ID}'`);
      const all = await client.execute(`SELECT count(*) FROM ${table}`);
      expect(Number(all.rows[0][0])).toBeGreaterThan(0);
      expect(Number(withGroup.rows[0][0])).toBe(Number(all.rows[0][0]));
    }
  });

  it('aplica group_id=Lomeros por DEFAULT a inserts que lo omiten (red de seguridad)', async () => {
    await migrateMultitenant(client);
    await client.execute(`INSERT INTO players (id, name) VALUES ('p3','Caro')`);
    const res = await client.execute(`SELECT group_id FROM players WHERE id = 'p3'`);
    expect(res.rows[0][0]).toBe(LOMEROS_GROUP_ID);
  });

  it('es idempotente: ejecutarla dos veces no duplica ni falla', async () => {
    await migrateMultitenant(client);
    const report = await migrateMultitenant(client);
    expect(report.groupsTotal).toBe(1);
    expect(report.usersTotal).toBe(2);
    expect(report.membershipsTotal).toBe(2);
    expect(report.tables.players).toEqual({ total: 2, withGroup: 2 });
  });
});
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/lib/db/migrations/multitenant.test.ts`
Expected: FAIL — `Failed to resolve import "./multitenant"` (el módulo aún no existe).

- [ ] **Step 4: Implementar la migración**

`src/lib/db/migrations/multitenant.ts`:

```ts
import type { Client } from '@libsql/client';
import {
  LOMEROS_GROUP_ID,
  LOMEROS_GROUP_SLUG,
  LOMEROS_GROUP_NAME,
} from '@/lib/groups/constants';

/** Tablas raíz tenant que reciben la columna group_id en la Fase 1. */
const TENANT_ROOT_TABLES = ['players', 'matches', 'rewards', 'tournaments'] as const;

export interface MultitenantMigrationReport {
  groupsTotal: number;
  usersTotal: number;
  membershipsTotal: number;
  tables: Record<string, { total: number; withGroup: number }>;
}

async function tableExists(client: Client, table: string): Promise<boolean> {
  const res = await client.execute({
    sql: `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
    args: [table],
  });
  return res.rows.length > 0;
}

async function columnExists(client: Client, table: string, column: string): Promise<boolean> {
  const res = await client.execute(`PRAGMA table_info(${table})`);
  return res.rows.some((r) => r[1] === column); // r[1] = nombre de la columna
}

async function count(client: Client, sqlText: string): Promise<number> {
  const res = await client.execute(sqlText);
  return Number(res.rows[0][0]);
}

/**
 * Migración idempotente de la Fase 1 multi-tenant (paso 1A).
 * - Crea `groups` y siembra Lomeros (grupo #1).
 * - Crea `memberships` y backfilla una membership en Lomeros por cada user
 *   (preservando role y player_id).
 * - Añade `group_id` NOT NULL DEFAULT '<lomeros>' a las tablas raíz tenant: el
 *   DEFAULT backfilla las filas existentes y sirve de red de seguridad durante
 *   la migración ruta-a-ruta del paso 1B.
 * NO borra `users.role` ni `users.player_id` (contract del paso 1C).
 */
export async function migrateMultitenant(client: Client): Promise<MultitenantMigrationReport> {
  // 1) groups + Lomeros
  await client.execute(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await client.execute({
    sql: `INSERT INTO groups (id, slug, name) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    args: [LOMEROS_GROUP_ID, LOMEROS_GROUP_SLUG, LOMEROS_GROUP_NAME],
  });

  // 2) memberships + backfill desde users
  await client.execute(`
    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'player',
      player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, group_id)
    )
  `);
  await client.execute({
    sql: `
      INSERT INTO memberships (id, user_id, group_id, role, player_id)
      SELECT lower(hex(randomblob(16))), u.id, ?, u.role, u.player_id
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.group_id = ?
      )
    `,
    args: [LOMEROS_GROUP_ID, LOMEROS_GROUP_ID],
  });

  // 3) group_id en tablas raíz tenant (NOT NULL DEFAULT lomeros = backfill + red de seguridad)
  for (const table of TENANT_ROOT_TABLES) {
    if (!(await tableExists(client, table))) continue;
    if (await columnExists(client, table, 'group_id')) continue;
    await client.execute(
      `ALTER TABLE ${table} ADD COLUMN group_id TEXT NOT NULL DEFAULT '${LOMEROS_GROUP_ID}'`,
    );
  }

  // 4) Reporte de verificación (sirve de check de integridad tras el curl en prod)
  const tables: MultitenantMigrationReport['tables'] = {};
  for (const table of TENANT_ROOT_TABLES) {
    if (!(await tableExists(client, table))) continue;
    tables[table] = {
      total: await count(client, `SELECT count(*) FROM ${table}`),
      withGroup: await count(
        client,
        `SELECT count(*) FROM ${table} WHERE group_id = '${LOMEROS_GROUP_ID}'`,
      ),
    };
  }

  return {
    groupsTotal: await count(client, `SELECT count(*) FROM groups`),
    usersTotal: await count(client, `SELECT count(*) FROM users`),
    membershipsTotal: await count(client, `SELECT count(*) FROM memberships`),
    tables,
  };
}
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `npx vitest run src/lib/db/migrations/multitenant.test.ts`
Expected: PASS — 5 tests verdes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/groups/constants.ts src/lib/db/migrations/multitenant.ts src/lib/db/migrations/multitenant.test.ts
git commit -m "feat(multitenant): migración 1A idempotente (groups + memberships + group_id) con test de integración"
```

---

## Task 2: Schema Drizzle — SOLO tablas nuevas `groups` y `memberships`

> **Ventana-cero (ver Decisión #3):** en 1A NO se declara `groupId` en el schema Drizzle de `players`/`matches`/`rewards`/`tournaments`. Solo se añaden las tablas NUEVAS `groups` y `memberships` (que ningún código de 1A consulta aún) y sus tipos. La columna física `group_id` la crea la migración (Task 1); su declaración en el schema Drizzle es trabajo del paso 1B.

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Declarar la tabla `groups` (antes de `players`)**

Insertar justo antes del bloque `// ─── PLAYERS ───`:

```ts
// ─── GROUPS (tenant raíz) ────────────────────────────────────────────────────
export const groups = sqliteTable('groups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: Declarar la tabla `memberships` (tras `users`)**

Insertar justo después del bloque `export const users = sqliteTable('users', {...});`:

```ts
// ─── MEMBERSHIPS (rol + enlace user↔ficha, por grupo) ────────────────────────
export const memberships = sqliteTable('memberships', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('player'), // 'admin' | 'player'
  playerId: text('player_id').references(() => players.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ([
  unique().on(t.userId, t.groupId),
]));
```

- [ ] **Step 3: Añadir los tipos al final (junto al resto de `export type`)**

```ts
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
```

NO tocar `players`/`matches`/`rewards`/`tournaments` ni añadir el import de `LOMEROS_GROUP_ID` (no se usa en el schema en 1A).

- [ ] **Step 4: Verificar que TODO compila y la suite unit sigue verde**

Run: `npx tsc --noEmit`
Expected: sin errores. (Los call-sites de insert no cambian porque el schema de las tablas raíz no cambia.)

Run: `npx vitest run`
Expected: toda la suite unit en verde (incluido `multitenant.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(multitenant): schema Drizzle de las tablas groups y memberships"
```

---

## Task 3: Ruta de migración + export del client

**Files:**
- Modify: `src/lib/db/index.ts`
- Create: `src/app/api/migrate-multitenant/route.ts`

- [ ] **Step 1: Exportar el client libSQL**

En `src/lib/db/index.ts`, cambiar `const client = createClient({...})` por `export const client = createClient({...})`. Resultado:

```ts
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

export const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

export const db = drizzle(client, { schema });
export type DB = typeof db;
```

- [ ] **Step 2: Crear el endpoint POST**

`src/app/api/migrate-multitenant/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { client } from '@/lib/db';
import { migrateMultitenant } from '@/lib/db/migrations/multitenant';

// POST /api/migrate-multitenant
// Migración 1A (groups + memberships + group_id). Idempotente. Ejecutar UNA vez
// tras desplegar:  curl -X POST https://<dominio>/api/migrate-multitenant
// El JSON de respuesta es el check de integridad (membershipsTotal debe igualar
// usersTotal, y para cada tabla withGroup debe igualar total).
export async function POST() {
  try {
    const report = await migrateMultitenant(client);
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al migrar multitenant' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/index.ts src/app/api/migrate-multitenant/route.ts
git commit -m "feat(multitenant): endpoint POST /api/migrate-multitenant"
```

---

## Task 4: Integrar la migración en e2e y verificar suite completa

**Files:**
- Modify: `e2e/global-setup.ts`

- [ ] **Step 1: Ejecutar `migrate-multitenant` en el arranque de e2e**

En `e2e/global-setup.ts`, en el bucle de migraciones del paso 1, añadir `'migrate-multitenant'` AL FINAL de la lista (necesita que `users`/`players`/`tournaments` ya existan). Cambiar:

```ts
  for (const ep of ['init-db', 'migrate-auth', 'migrate-tournaments']) {
```

por:

```ts
  for (const ep of ['init-db', 'migrate-auth', 'migrate-tournaments', 'migrate-multitenant']) {
```

(No hace falta tocar el seed de `players`/`users`: omiten `group_id` y reciben Lomeros por el DEFAULT de la columna. `rewards` no existe en e2e → el guard `tableExists` lo salta sin error.)

- [ ] **Step 2: Ejecutar la suite e2e completa**

Run: `npm run e2e`
Expected: PASS — todos los specs verdes (eventos, pozo-*, torneo-*, public). Prueba que la migración corre contra un `next dev` real + DB SQLite de fichero y que la app sigue funcionando idéntica con las columnas `group_id` y las tablas nuevas.

- [ ] **Step 3: Commit**

```bash
git add e2e/global-setup.ts
git commit -m "test(e2e): aplica la migración multitenant 1A en el setup de arranque"
```

---

## Task 5: Verificación final y runbook de despliegue

- [ ] **Step 1: Verificación local agregada**

Run: `npx vitest run && npx tsc --noEmit`
Expected: toda la suite unit verde y sin errores de tipos.

Run: `npm run e2e`
Expected: e2e completa verde.

- [ ] **Step 2: Anotar el runbook de producción**

La migración en prod NO es automática: se dispara con un `curl` (mismo patrón que el resto de `/api/migrate-*`). Pasos cuando se despliegue 1A:

1. Mergear la rama e ir a producción (Vercel auto-despliega).
2. Ejecutar: `curl -X POST https://<dominio-de-produccion>/api/migrate-multitenant`
3. **Verificar el reporte** del JSON de respuesta:
   - `membershipsTotal` === `usersTotal` (un membership por user).
   - `groupsTotal` === 1.
   - Para cada tabla en `tables`: `withGroup` === `total` (toda fila quedó en Lomeros).
4. Si algo no cuadra, la migración es idempotente: arreglar y reejecutar.

(Este runbook es documental; no es un paso de código. La ejecución real en prod la decide el usuario.)

---

## Self-review (cobertura del spec)

- **Modelo de datos (spec §2):** `groups`, `memberships(userId,groupId,role,playerId)` con único `(userId,groupId)` → schema en Task 2; columna física `group_id` en raíz tenant (players/matches/rewards/tournaments) → migración Task 1 (su declaración en el schema Drizzle se difiere a 1B). Hijas heredan vía FK (no se tocan). ✔
- **Principio "no romper Lomeros" (spec §0):** aditivo, DEFAULT backfilla, idempotente, e2e existente verde, reporte de verificación → Tasks 1,4,5. ✔
- **Red de seguridad default=Lomeros (spec §0/§8):** DEFAULT de la columna física (vía migración, Task 1) cubre los inserts en SQL crudo durante 1B. El `.default()` en el schema Drizzle se difiere a 1B (junto con la declaración de `groupId`). ✔
- **Patrón de migración del repo (spec §8):** ruta `/api/migrate-*` idempotente + integración en e2e → Tasks 3-4. ✔
- **`users` intacto hasta 1C (spec §0/§5):** no se borra `role`/`player_id` → confirmado en migración. ✔
- **Súper-admin (spec §6):** fuera de 1A (es env + resolver, paso 1B). No requiere cambios de datos. ✔
- **Testing (spec §10):** test de integración de la migración (Task 1) + suite e2e verde (Task 4). El test e2e de no-fuga entre grupos es del paso 1B (cuando exista el scoping). ✔

Sin placeholders. Nombres consistentes: `migrateMultitenant` / `MultitenantMigrationReport` / `LOMEROS_GROUP_ID` usados igual en migración, test, ruta y schema.
