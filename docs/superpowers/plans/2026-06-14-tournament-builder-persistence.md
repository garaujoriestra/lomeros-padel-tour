# Constructor de torneos — Plan 4: Persistencia estática (DB + harness)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir y leer un torneo: crear su configuración (pistas, participantes, bloques, parejas, grupos), reconstruirla en la forma que consume el orquestador, y generar + guardar la parrilla completa en `tournament_matches` (remapeando las referencias del cuadro a UUIDs reales). Todo testeado contra una DB libSQL en memoria.

**Architecture:** Funciones de acceso a datos en `src/lib/tournament/store.ts` que reciben la instancia `db` como primer parámetro (inyección de dependencias para poder testear). Un harness `src/lib/tournament/test-db.ts` crea una DB libSQL `:memory:` con el esquema aplicado, reutilizando el DDL extraído a `src/lib/tournament/schema-ddl.ts` (que también usa el endpoint de migración). Las rutas HTTP (Plan 6) llamarán a estas funciones con el `db` singleton.

**Tech Stack:** TypeScript, Drizzle ORM, `@libsql/client` (`:memory:` para tests), Vitest.

**Roadmap de planes (contexto):**
- Planes 1-3 (hechos): esquema + migración, motores puros (pozo, parejas fijas), orquestador de generación (`generate.ts`).
- **Plan 4 (este):** harness de DB en memoria + `createTournament` + `loadTournamentConfig` + `generateAndStore`.
- Plan 5: registro de resultados + progresión (rondas del pozo, propagación del cuadro, clasificaciones).
- Plan 6: rutas HTTP + UI admin.
- Plan 7: vista pública.

**Referencia del diseño:** `docs/superpowers/specs/2026-06-13-tournament-builder-design.md`
**Planes previos:** foundation, fixed-pairs, generate (en `docs/superpowers/plans/`).

---

## Estructura de ficheros (este plan)

- Modificar: `src/lib/db/schema.ts` — renombrar la columna DB `order` → `sort_order` en `tournamentCourts` y `tournamentBlocks` (propiedad JS sigue siendo `order`).
- Crear: `src/lib/tournament/schema-ddl.ts` — `TOURNAMENT_DDL: string[]` (sentencias CREATE TABLE), fuente única del DDL.
- Modificar: `src/app/api/migrate-tournaments/route.ts` — usar `TOURNAMENT_DDL` en vez del DDL inline.
- Crear: `src/lib/tournament/test-db.ts` — `createTestDb()` (DB en memoria con esquema). Solo lo importan los tests (no es `*.test.ts`, así que Vitest no lo ejecuta como test).
- Crear: `src/lib/tournament/test-db.test.ts` — smoke test del harness.
- Crear: `src/lib/tournament/store.ts` — `createTournament`, `loadTournamentConfig`, `generateAndStore`.
- Crear: `src/lib/tournament/store.test.ts` — tests contra DB en memoria.

**Decisiones de v1 (documentadas):**
- **Timing de bloques:** los bloques corren secuenciales y consecutivos (back-to-back) empezando en el `availableFrom` más temprano de las pistas. `loadTournamentConfig` calcula el `startMin` acumulado por orden de bloque. (Si en el futuro se quieren huecos entre bloques, se añade una columna `starts_at`.)
- **Participantes del pozo:** el orden de sembrado del pozo se guarda en el `config` del bloque como `participantOrder: string[]` (playerIds). Así un bloque pozo puede usar todos o un subconjunto, con orden explícito, sin tocar el esquema de participantes.
- **Parejas fijas:** las parejas (`tournament_pairs`) y grupos (`tournament_groups`) se guardan por bloque. Si el bloque tiene grupos, el cuadro sale de ellos (placeholders); si no, las `knockoutSeeds` son las parejas ordenadas por `seed`.
- **Refs del cuadro:** `generateTournament` produce slots `matchWinner` con `matchId` posicional del motor (`'r0m0'`). `generateAndStore` pre-genera un UUID por partido, mapea `engineMatchId → UUID` **por bloque** (las refs son intra-bloque) y reescribe los slots antes de insertar (inserción en una sola pasada, sin UPDATE posterior).
- **Inyección de `db`:** todas las funciones reciben `db` como primer parámetro (tipado `LibSQLDatabase<typeof schema>`), compatible con el singleton de `src/lib/db/index.ts` y con la DB de test.

Convenciones (Planes 1-3): tests `*.test.ts` junto al código; alias `@` → `src`; `npx vitest run <ruta>`; imports consolidados al principio de los tests; imports de `store.ts` incrementales por tarea (no dejar imports sin usar en commits intermedios).

---

## Task 1: Extraer DDL + renombrar columna `order`

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/tournament/schema-ddl.ts`
- Modify: `src/app/api/migrate-tournaments/route.ts`

- [ ] **Step 1: Renombrar la columna DB `order` → `sort_order` en el esquema**

En `src/lib/db/schema.ts`, en la tabla `tournamentCourts`, cambia:
```ts
  order: integer('order').notNull(), // 1 = pista más alta (top del pozo)
```
por:
```ts
  order: integer('sort_order').notNull(), // 1 = pista más alta (top del pozo)
```

Y en la tabla `tournamentBlocks`, cambia:
```ts
  order: integer('order').notNull(),
```
por:
```ts
  order: integer('sort_order').notNull(),
```

(La propiedad JS sigue siendo `order`; solo cambia el nombre de la columna en la DB para evitar la palabra reservada `order` en SQL.)

- [ ] **Step 2: Crear `src/lib/tournament/schema-ddl.ts`**

```ts
// Fuente única del DDL de las tablas del torneo. Lo usan el endpoint de migración
// y el harness de test en memoria. Idempotente (CREATE TABLE IF NOT EXISTS).
export const TOURNAMENT_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    location TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_courts (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    available_from TEXT NOT NULL,
    available_to TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_participants (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id),
    UNIQUE(tournament_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_blocks (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    config TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_groups (
    id TEXT PRIMARY KEY,
    block_id TEXT NOT NULL REFERENCES tournament_blocks(id) ON DELETE CASCADE,
    name TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_pairs (
    id TEXT PRIMARY KEY,
    block_id TEXT NOT NULL REFERENCES tournament_blocks(id) ON DELETE CASCADE,
    player1_id TEXT NOT NULL REFERENCES players(id),
    player2_id TEXT NOT NULL REFERENCES players(id),
    seed INTEGER,
    label TEXT,
    group_id TEXT REFERENCES tournament_groups(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    block_id TEXT NOT NULL REFERENCES tournament_blocks(id) ON DELETE CASCADE,
    court_id TEXT REFERENCES tournament_courts(id) ON DELETE SET NULL,
    round INTEGER NOT NULL DEFAULT 0,
    phase_tag TEXT,
    scheduled_start TEXT,
    scheduled_end TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    slot_a1 TEXT, slot_a2 TEXT, slot_b1 TEXT, slot_b2 TEXT,
    team_a_score INTEGER,
    team_b_score INTEGER,
    sets_json TEXT,
    winner TEXT
  )`,
];
```

- [ ] **Step 3: Refactorizar el endpoint de migración para usar el DDL compartido**

Sustituye el contenido de `src/app/api/migrate-tournaments/route.ts` por:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { TOURNAMENT_DDL } from '@/lib/tournament/schema-ddl';

// POST /api/migrate-tournaments — crea las tablas del constructor de torneos.
// Idempotente: CREATE TABLE IF NOT EXISTS. DDL en src/lib/tournament/schema-ddl.ts.
export async function POST() {
  try {
    for (const stmt of TOURNAMENT_DDL) {
      await db.run(sql.raw(stmt));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error en migrate-tournaments', detail: String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verificar tipos y tests existentes**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (solo el preexistente y ajeno de `web-push`).

Run: `npx vitest run src/lib/tournament`
Expected: PASS (los 50 tests previos siguen verdes — el renombrado de columna no afecta a la lógica pura).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/tournament/schema-ddl.ts src/app/api/migrate-tournaments/route.ts
git commit -m "refactor(tournaments): DDL compartido + renombra columna order->sort_order"
```

---

## Task 2: Harness de DB en memoria

**Files:**
- Create: `src/lib/tournament/test-db.ts`
- Test: `src/lib/tournament/test-db.test.ts`

- [ ] **Step 1: Escribir el smoke test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { tournaments } from '@/lib/db/schema';

describe('createTestDb', () => {
  it('crea las tablas del torneo y permite insertar y leer', async () => {
    const db = await createTestDb();
    const [t] = await db.insert(tournaments).values({ name: 'Cumple', date: '2026-06-13' }).returning();
    expect(t.id).toBeTruthy();
    expect(t.status).toBe('draft');
    const all = await db.select().from(tournaments);
    expect(all).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/test-db.test.ts`
Expected: FAIL — `./test-db` no existe.

- [ ] **Step 3: Implementar el harness**

```ts
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { TOURNAMENT_DDL } from './schema-ddl';

// DB libSQL en memoria con el esquema del torneo aplicado. Solo para tests.
// (Las FK a players/users no se exigen: SQLite tiene foreign_keys OFF por defecto.)
export async function createTestDb() {
  const client = createClient({ url: ':memory:' });
  for (const stmt of TOURNAMENT_DDL) {
    await client.execute(stmt);
  }
  return drizzle(client, { schema });
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/test-db.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/test-db.ts src/lib/tournament/test-db.test.ts
git commit -m "test(tournaments): harness de DB libSQL en memoria"
```

---

## Task 3: `createTournament`

Inserta toda la configuración de un torneo (torneo + pistas + participantes + bloques + grupos + parejas) y devuelve el id del torneo.

**Files:**
- Create: `src/lib/tournament/store.ts`
- Test: `src/lib/tournament/store.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createTournament } from './store';
import type { CreateTournamentInput } from './store';
import { tournamentCourts, tournamentParticipants, tournamentBlocks, tournamentGroups, tournamentPairs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const sampleInput: CreateTournamentInput = {
  name: 'Cumple 2026', date: '2026-06-13',
  courts: [
    { label: 'Pista 1', order: 1, availableFrom: '17:00', availableTo: '20:00' },
    { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '18:30' },
  ],
  participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4'],
  blocks: [
    {
      order: 1, type: 'pozo', name: 'Pozo', durationMinutes: 90,
      config: { matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' }, bufferMinutes: 0, roundMinutes: 15, participantOrder: ['pl1', 'pl2', 'pl3', 'pl4'] },
    },
    {
      order: 2, type: 'fixed_pairs', name: 'Torneo', durationMinutes: 90,
      config: { matchFormat: { kind: 'best_of_3' }, bufferMinutes: 5, advancePerGroup: 1, knockout: true },
      groupNames: ['A'],
      pairs: [
        { player1Id: 'pl1', player2Id: 'pl2', seed: 1, groupName: 'A' },
        { player1Id: 'pl3', player2Id: 'pl4', seed: 2, groupName: 'A' },
      ],
    },
  ],
};

describe('createTournament', () => {
  it('inserta torneo, pistas, participantes, bloques, grupos y parejas', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, sampleInput);
    expect(id).toBeTruthy();

    const courts = await db.select().from(tournamentCourts).where(eq(tournamentCourts.tournamentId, id));
    expect(courts).toHaveLength(2);

    const participants = await db.select().from(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
    expect(participants).toHaveLength(4);

    const blocks = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.tournamentId, id));
    expect(blocks).toHaveLength(2);
    const pozo = blocks.find((b) => b.type === 'pozo')!;
    expect(JSON.parse(pozo.config).participantOrder).toEqual(['pl1', 'pl2', 'pl3', 'pl4']);

    const fixedBlock = blocks.find((b) => b.type === 'fixed_pairs')!;
    const groups = await db.select().from(tournamentGroups).where(eq(tournamentGroups.blockId, fixedBlock.id));
    expect(groups).toHaveLength(1);
    const pairs = await db.select().from(tournamentPairs).where(eq(tournamentPairs.blockId, fixedBlock.id));
    expect(pairs).toHaveLength(2);
    // Las parejas quedan ligadas al grupo A.
    expect(pairs.every((p) => p.groupId === groups[0].id)).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/store.test.ts`
Expected: FAIL — `./store` / `createTournament` no existe.

- [ ] **Step 3: Implementar**

```ts
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import {
  tournaments, tournamentCourts, tournamentParticipants,
  tournamentBlocks, tournamentGroups, tournamentPairs,
} from '@/lib/db/schema';
import type { MatchFormat } from './types';

type Db = LibSQLDatabase<typeof schema>;

export interface BlockConfig {
  matchFormat: MatchFormat;
  bufferMinutes: number;
  roundMinutes?: number;        // pozo: duración de cada ronda
  participantOrder?: string[];  // pozo: playerIds en orden de sembrado
  advancePerGroup?: number;     // fixed_pairs con grupos
  knockout?: boolean;           // fixed_pairs: ¿hay cuadro?
}

export interface CreateCourtInput {
  label: string; order: number; availableFrom: string; availableTo: string;
}
export interface CreatePairInput {
  player1Id: string; player2Id: string; seed?: number; groupName?: string;
}
export interface CreateBlockInput {
  order: number;
  type: 'pozo' | 'fixed_pairs';
  name: string;
  durationMinutes: number;
  config: BlockConfig;
  groupNames?: string[];        // fixed_pairs
  pairs?: CreatePairInput[];    // fixed_pairs
}
export interface CreateTournamentInput {
  name: string; date: string; location?: string; notes?: string; createdBy?: string;
  courts: CreateCourtInput[];
  participantPlayerIds: string[];
  blocks: CreateBlockInput[];
}

// Inserta toda la configuración del torneo. Devuelve el id del torneo.
export async function createTournament(db: Db, input: CreateTournamentInput): Promise<string> {
  const [tournament] = await db.insert(tournaments).values({
    name: input.name,
    date: input.date,
    location: input.location ?? null,
    notes: input.notes ?? null,
    createdBy: input.createdBy ?? null,
    status: 'draft',
  }).returning();

  for (const c of input.courts) {
    await db.insert(tournamentCourts).values({
      tournamentId: tournament.id, label: c.label, order: c.order,
      availableFrom: c.availableFrom, availableTo: c.availableTo,
    });
  }

  for (const playerId of input.participantPlayerIds) {
    await db.insert(tournamentParticipants).values({ tournamentId: tournament.id, playerId });
  }

  for (const block of input.blocks) {
    const [blockRow] = await db.insert(tournamentBlocks).values({
      tournamentId: tournament.id, order: block.order, type: block.type,
      name: block.name, durationMinutes: block.durationMinutes,
      config: JSON.stringify(block.config),
    }).returning();

    if (block.type === 'fixed_pairs') {
      const groupIdByName = new Map<string, string>();
      for (const name of block.groupNames ?? []) {
        const [g] = await db.insert(tournamentGroups).values({ blockId: blockRow.id, name }).returning();
        groupIdByName.set(name, g.id);
      }
      for (const p of block.pairs ?? []) {
        await db.insert(tournamentPairs).values({
          blockId: blockRow.id, player1Id: p.player1Id, player2Id: p.player2Id,
          seed: p.seed ?? null,
          groupId: p.groupName ? (groupIdByName.get(p.groupName) ?? null) : null,
        });
      }
    }
  }

  return tournament.id;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/store.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/store.ts src/lib/tournament/store.test.ts
git commit -m "feat(tournaments): createTournament persiste la configuración"
```

---

## Task 4: `loadTournamentConfig`

Lee la configuración persistida y la reconstruye en la forma que consume `generateTournament` (`GenBlock[]` + `GenCourt[]`), con timing de bloques secuencial.

**Files:**
- Modify: `src/lib/tournament/store.ts`
- Modify: `src/lib/tournament/store.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade al import combinado del test `loadTournamentConfig` y los tipos del orquestador:

```ts
import { createTournament, loadTournamentConfig } from './store';
import type { CreateTournamentInput } from './store';
import type { GenPozoBlock, GenFixedPairsBlock } from './generate';
```

Y añade este bloque:

```ts
describe('loadTournamentConfig', () => {
  it('reconstruye GenBlock[]/GenCourt[] con timing de bloques secuencial', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, sampleInput);
    const { blocks, courts } = await loadTournamentConfig(db, id);

    // Pistas: minutos desde medianoche.
    expect(courts).toHaveLength(2);
    expect(courts[0]).toMatchObject({ order: 1, fromMin: 17 * 60, toMin: 20 * 60 });

    // Inicio del torneo = availableFrom más temprano = 17:00. Bloque 1 a 17:00, bloque 2 a 18:30.
    expect(blocks).toHaveLength(2);
    const pozo = blocks.find((b) => b.type === 'pozo') as GenPozoBlock;
    expect(pozo.startMin).toBe(17 * 60);
    expect(pozo.participantIds).toEqual(['pl1', 'pl2', 'pl3', 'pl4']);
    expect(pozo.roundMinutes).toBe(15);

    const fixed = blocks.find((b) => b.type === 'fixed_pairs') as GenFixedPairsBlock;
    expect(fixed.startMin).toBe(17 * 60 + 90); // 18:30
    expect(fixed.knockout).toBe(true);
    expect(fixed.advancePerGroup).toBe(1);
    expect(fixed.groups).toHaveLength(1);
    expect(fixed.groups[0].name).toBe('A');
    expect(fixed.groups[0].pairIds).toHaveLength(2);
    // Con grupos, knockoutSeeds vacío.
    expect(fixed.knockoutSeeds).toEqual([]);
  });

  it('cuadro sin grupos: knockoutSeeds = parejas ordenadas por seed', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, {
      name: 'KO', date: '2026-06-13',
      courts: [{ label: 'P1', order: 1, availableFrom: '10:00', availableTo: '12:00' }],
      participantPlayerIds: ['a', 'b', 'c', 'd'],
      blocks: [{
        order: 1, type: 'fixed_pairs', name: 'Cuadro', durationMinutes: 60,
        config: { matchFormat: { kind: 'best_of_3' }, bufferMinutes: 0, knockout: true },
        pairs: [
          { player1Id: 'c', player2Id: 'd', seed: 2 },
          { player1Id: 'a', player2Id: 'b', seed: 1 },
        ],
      }],
    });
    const { blocks } = await loadTournamentConfig(db, id);
    const fixed = blocks[0] as GenFixedPairsBlock;
    expect(fixed.groups).toEqual([]);
    expect(fixed.knockoutSeeds).toHaveLength(2);
    // El primer seed (seed 1 = pareja a/b) va primero.
    expect(fixed.knockoutSeeds.length).toBe(2);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/store.test.ts`
Expected: FAIL — `loadTournamentConfig` no existe.

- [ ] **Step 3: Implementar**

Primero añade los imports que faltan al principio de `src/lib/tournament/store.ts`:

```ts
import { eq, asc } from 'drizzle-orm';
import { hhmmToMin } from './time';
import type { GenBlock, GenCourt } from './generate';
```

Luego añade:

```ts
export interface LoadedConfig {
  blocks: GenBlock[];
  courts: GenCourt[];
}

// Reconstruye la configuración en la forma que consume generateTournament.
// Timing de bloques: secuenciales y consecutivos desde el availableFrom más temprano.
export async function loadTournamentConfig(db: Db, tournamentId: string): Promise<LoadedConfig> {
  const courtRows = await db.select().from(tournamentCourts)
    .where(eq(tournamentCourts.tournamentId, tournamentId))
    .orderBy(asc(tournamentCourts.order));
  const courts: GenCourt[] = courtRows.map((c) => ({
    courtId: c.id, order: c.order,
    fromMin: hhmmToMin(c.availableFrom), toMin: hhmmToMin(c.availableTo),
  }));

  const tournamentStart = courts.length > 0 ? Math.min(...courts.map((c) => c.fromMin)) : 0;

  const blockRows = await db.select().from(tournamentBlocks)
    .where(eq(tournamentBlocks.tournamentId, tournamentId))
    .orderBy(asc(tournamentBlocks.order));

  const blocks: GenBlock[] = [];
  let cursor = tournamentStart;
  for (const b of blockRows) {
    const config = JSON.parse(b.config) as BlockConfig;
    const startMin = cursor;
    cursor += b.durationMinutes;

    if (b.type === 'pozo') {
      blocks.push({
        type: 'pozo', blockId: b.id, startMin, durationMinutes: b.durationMinutes,
        matchFormat: config.matchFormat, bufferMinutes: config.bufferMinutes,
        roundMinutes: config.roundMinutes ?? 0,
        participantIds: config.participantOrder ?? [],
      });
    } else {
      const groupRows = await db.select().from(tournamentGroups).where(eq(tournamentGroups.blockId, b.id));
      const pairRows = await db.select().from(tournamentPairs).where(eq(tournamentPairs.blockId, b.id));
      const groups = groupRows.map((g) => ({
        groupId: g.id, name: g.name,
        pairIds: pairRows.filter((p) => p.groupId === g.id).map((p) => p.id),
      }));
      const knockoutSeeds = groups.length === 0
        ? [...pairRows].sort((a, b2) => (a.seed ?? 0) - (b2.seed ?? 0)).map((p) => p.id)
        : [];
      blocks.push({
        type: 'fixed_pairs', blockId: b.id, startMin, durationMinutes: b.durationMinutes,
        matchFormat: config.matchFormat, bufferMinutes: config.bufferMinutes,
        groups, knockout: config.knockout ?? false,
        advancePerGroup: config.advancePerGroup ?? 0, knockoutSeeds,
      });
    }
  }

  return { blocks, courts };
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/store.test.ts`
Expected: PASS (3 tests en el fichero).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/store.ts src/lib/tournament/store.test.ts
git commit -m "feat(tournaments): loadTournamentConfig reconstruye la entrada del orquestador"
```

---

## Task 5: `generateAndStore`

Genera la parrilla (con `generateTournament`) y la guarda en `tournament_matches`, remapeando las referencias `matchWinner` del cuadro de claves posicionales del motor a UUIDs reales. Convierte minutos a "HH:MM". Marca el torneo como `scheduled`.

**Files:**
- Modify: `src/lib/tournament/store.ts`
- Modify: `src/lib/tournament/store.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade al import combinado del test `generateAndStore`, la tabla `tournamentMatches` y `tournaments`:

```ts
import { createTournament, loadTournamentConfig, generateAndStore } from './store';
```
y amplía el import de `@/lib/db/schema` del test para incluir `tournamentMatches` y `tournaments`.

Y añade este bloque:

```ts
describe('generateAndStore', () => {
  it('guarda la parrilla y remapea las refs del cuadro a UUIDs reales', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, {
      name: 'KO', date: '2026-06-13',
      courts: [
        { label: 'P1', order: 1, availableFrom: '10:00', availableTo: '13:00' },
        { label: 'P2', order: 2, availableFrom: '10:00', availableTo: '13:00' },
      ],
      participantPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      blocks: [{
        order: 1, type: 'fixed_pairs', name: 'Cuadro', durationMinutes: 180,
        config: { matchFormat: { kind: 'timed', minutes: 30, tieRule: 'golden_point' }, bufferMinutes: 0, knockout: true },
        pairs: [
          { player1Id: 'a', player2Id: 'b', seed: 1 },
          { player1Id: 'c', player2Id: 'd', seed: 2 },
          { player1Id: 'e', player2Id: 'f', seed: 3 },
          { player1Id: 'g', player2Id: 'h', seed: 4 },
        ],
      }],
    });

    const res = await generateAndStore(db, id);
    expect(res.matchCount).toBe(3); // 2 de ronda 0 + final
    expect(res.warnings).toEqual([]);

    const rows = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    expect(rows).toHaveLength(3);
    // Las horas se guardan como "HH:MM".
    expect(rows.every((r) => r.scheduledStart && /^\d{2}:\d{2}$/.test(r.scheduledStart))).toBe(true);

    const r0Ids = new Set(rows.filter((r) => r.phaseTag === 'ko:r0').map((r) => r.id));
    expect(r0Ids.size).toBe(2);
    const final = rows.find((r) => r.phaseTag === 'ko:r1')!;
    const slotA = JSON.parse(final.slotA1!);
    const slotB = JSON.parse(final.slotB1!);
    // Los matchWinner del cuadro apuntan a UUIDs reales de los partidos de ronda 0, no a 'r0m0'.
    expect(slotA.type).toBe('matchWinner');
    expect(r0Ids.has(slotA.matchId)).toBe(true);
    expect(r0Ids.has(slotB.matchId)).toBe(true);
    expect(slotA.matchId).not.toBe(slotB.matchId);

    // El torneo queda marcado como scheduled.
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    expect(t.status).toBe('scheduled');
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/store.test.ts`
Expected: FAIL — `generateAndStore` no existe.

- [ ] **Step 3: Implementar**

Primero añade los imports que faltan al principio de `src/lib/tournament/store.ts` (amplía el import de `@/lib/db/schema`, el de `./time` y el de `./generate`, y añade `SlotRef`):

```ts
// añade tournamentMatches al import nombrado de '@/lib/db/schema'
// añade minToHHMM al import de './time'
// añade generateTournament al import de './generate'
import type { SlotRef } from './types';
```

Luego añade:

```ts
export interface StoreResult {
  matchCount: number;
  warnings: string[];
}

// Genera la parrilla y la guarda. Pre-genera un UUID por partido, mapea engineMatchId->UUID
// por bloque, y reescribe los slots matchWinner antes de insertar (una sola pasada).
export async function generateAndStore(db: Db, tournamentId: string): Promise<StoreResult> {
  const { blocks, courts } = await loadTournamentConfig(db, tournamentId);
  const { matches, warnings } = generateTournament(blocks, courts);

  const idByEngine = new Map<string, string>(); // `${blockId}:${engineMatchId}` -> uuid
  const rows = matches.map((m) => {
    const id = crypto.randomUUID();
    if (m.engineMatchId) idByEngine.set(`${m.blockId}:${m.engineMatchId}`, id);
    return { id, m };
  });

  const slotJson = (blockId: string, slot: SlotRef | null): string | null => {
    if (!slot) return null;
    if (slot.type === 'matchWinner') {
      const mapped = idByEngine.get(`${blockId}:${slot.matchId}`);
      return JSON.stringify(mapped ? { type: 'matchWinner', matchId: mapped } : slot);
    }
    return JSON.stringify(slot);
  };

  for (const { id, m } of rows) {
    await db.insert(tournamentMatches).values({
      id, tournamentId, blockId: m.blockId, courtId: m.courtId,
      round: m.round, phaseTag: m.phaseTag,
      scheduledStart: m.startMin !== null ? minToHHMM(m.startMin) : null,
      scheduledEnd: m.endMin !== null ? minToHHMM(m.endMin) : null,
      status: 'pending',
      slotA1: slotJson(m.blockId, m.slotA1),
      slotA2: slotJson(m.blockId, m.slotA2),
      slotB1: slotJson(m.blockId, m.slotB1),
      slotB2: slotJson(m.blockId, m.slotB2),
    });
  }

  await db.update(tournaments).set({ status: 'scheduled' }).where(eq(tournaments.id, tournamentId));

  return { matchCount: rows.length, warnings };
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/store.test.ts`
Expected: PASS (4 tests en el fichero).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/store.ts src/lib/tournament/store.test.ts
git commit -m "feat(tournaments): generateAndStore guarda la parrilla con refs remapeadas"
```

---

## Task 6: Verificación final del plan

- [ ] **Step 1: Ejecutar toda la suite de tournament**

Run: `npx vitest run src/lib/tournament`
Expected: PASS — incluye `time`, `scheduler`, `pozo`, `fixed-pairs`, `generate`, `test-db` y `store`.

- [ ] **Step 2: Comprobar tipos del proyecto**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (solo el preexistente y ajeno de `web-push`).

- [ ] **Step 3: Lint**

Run: `npx eslint src/lib/tournament src/app/api/migrate-tournaments`
Expected: sin errores.

---

## Self-review (cubierto en este plan vs. spec)

- **Persistencia independiente del torneo** (crear configuración completa): `createTournament` (Task 3). ✓
- **Reconstrucción de la config para generar** (pistas con ventanas, bloques en secuencia con su formato): `loadTournamentConfig` (Task 4). ✓
- **Generar la distribución de partidos y guardarla**: `generateAndStore` (Task 5). ✓
- **Cuadro pre-dibujado con refs resolubles** (matchWinner → UUID real para que el Plan 5 pueda propagar resultados): remapeo por bloque en `generateAndStore` (Task 5). ✓
- **Harness de DB reutilizable** para testear la persistencia: `createTestDb` (Task 2), DDL compartido (Task 1). ✓
- **Avisos de viabilidad** propagados desde el orquestador a `StoreResult.warnings`: Task 5. ✓

**Fuera de este plan (planes posteriores):** registro de resultados y progresión (Plan 5: rellenar rondas TBD del pozo recalculando movimiento; propagar ganadores del cuadro con `resolveBracket` sobre los UUIDs ya remapeados; clasificaciones con `groupStandings`), rutas HTTP + UI admin (Plan 6), vista pública (Plan 7). Validaciones de entrada (p.ej. `advancePerGroup >= 1` con grupos+cuadro; participantOrder ⊆ participantes) van en la capa API del Plan 6.
