# Pozo/Torneo — Plan 1: Foundation (modelo + creación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestructurar el evento como **un solo formato** (Pozo o Torneo) en vez de una lista de bloques, con su modelo de datos, capa de store, validación, navegación separada (Pozos/Torneos) y flujo de creación que persiste pozos/torneos como borradores.

**Architecture:** Reescritura limpia (sin migración de datos; la feature actual de bloques se reemplaza). El evento (`tournaments`) gana `kind` (`pozo`|`torneo`), `format` y `config` JSON; se elimina `tournament_blocks` y `groups`/`pairs`/`matches` pasan a colgar de `tournament_id`. Los motores puros (`scheduler`, `pozo`, `fixed-pairs`, `generate`) NO se tocan en este plan (se reconectan en los Planes 2 y 3); aquí solo se construye la base y la creación de borradores.

**Tech Stack:** Next.js 16 (App Router, RSC + client components), drizzle-orm + libSQL/Turso, vitest (unit), Playwright (e2e), zod-free validación a mano (patrón del repo en `validation.ts`).

**Spec:** `docs/superpowers/specs/2026-06-15-pozo-torneo-split-design.md`

---

## File Structure

- **Modify:** `src/lib/tournament/schema-ddl.ts` — DDL nuevo (kind/format/config; sin blocks).
- **Modify:** `src/lib/tournament/types.ts` — tipos de dominio del evento (kind, configs de formato).
- **Create:** `src/lib/tournament/event-store.ts` — store del nuevo modelo (`createEvent`, `loadEvent`, `listEvents`, `updateEvent`). Sustituye a `store.ts` para la base; `store.ts` antiguo se retira en la Task 8.
- **Modify:** `src/lib/tournament/validation.ts` — `validateEventInput` + `validatePozoConfig` + `validateTorneoConfig`.
- **Modify:** `src/lib/db/schema.ts` — columnas drizzle nuevas en `tournaments`.
- **Create:** `src/app/api/tournaments/route.ts` (reescribe POST + añade GET con filtro `kind`).
- **Modify:** `src/app/api/tournaments/[id]/route.ts` — PATCH del nuevo shell.
- **Create:** `src/app/admin/pozos/page.tsx`, `src/app/admin/torneos/page.tsx` — listados separados.
- **Create:** `src/app/admin/pozos/new/page.tsx`, `src/app/admin/torneos/new/page.tsx` — alta.
- **Create:** `src/components/admin/event-form.tsx` — formulario base (jugadores, pistas, fecha) + sub-config por tipo.
- **Modify:** `src/components/admin/admin-sidebar.tsx` — enlaces "Pozos" y "Torneos".
- **Delete (Task 8):** `src/components/admin/blocks-editor.tsx`, `src/app/admin/tournaments/[id]/blocks/`, `src/app/admin/tournaments/new/`, `src/app/admin/tournaments/page.tsx`, y funciones de bloques en `store.ts`.

---

## Task 1: DDL nuevo (sin bloques)

**Files:**
- Modify: `src/lib/tournament/schema-ddl.ts`
- Test: `src/lib/tournament/event-store.test.ts` (se crea aquí con un primer test de esquema)

- [ ] **Step 1: Reescribir el DDL**

Reemplaza el contenido de `src/lib/tournament/schema-ddl.ts` por:

```ts
// Fuente única del DDL del evento (pozo o torneo). Lo usan el endpoint de migración
// y el harness de test en memoria. Idempotente (CREATE TABLE IF NOT EXISTS).
// Modelo nuevo: UN formato por evento (sin tournament_blocks).
export const TOURNAMENT_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    location TEXT,
    notes TEXT,
    kind TEXT NOT NULL,            -- 'pozo' | 'torneo'
    format TEXT NOT NULL,          -- pozo: 'fixed_pairs'|'americano' ; torneo: 'single_elim'|'groups_elim'
    config TEXT NOT NULL DEFAULT '{}',
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
  `CREATE TABLE IF NOT EXISTS tournament_groups (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_pairs (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player1_id TEXT NOT NULL REFERENCES players(id),
    player2_id TEXT NOT NULL REFERENCES players(id),
    seed INTEGER,
    label TEXT,
    group_id TEXT REFERENCES tournament_groups(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
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

- [ ] **Step 2: Test de que el harness crea el esquema nuevo**

Crea `src/lib/tournament/event-store.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';

describe('schema nuevo (event)', () => {
  it('tournaments tiene kind/format/config y no existe tournament_blocks', async () => {
    const { client } = await createTestDb();
    const cols = await client.execute(`PRAGMA table_info(tournaments)`);
    const names = cols.rows.map((r) => r.name as string);
    expect(names).toContain('kind');
    expect(names).toContain('format');
    expect(names).toContain('config');

    const blocks = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='tournament_blocks'`,
    );
    expect(blocks.rows.length).toBe(0);

    const pairs = await client.execute(`PRAGMA table_info(tournament_pairs)`);
    expect(pairs.rows.map((r) => r.name as string)).toContain('tournament_id');
  });
});
```

- [ ] **Step 3: Verificar harness expone `client`**

Run: `grep -n "client" src/lib/tournament/test-db.ts`
Expected: `createTestDb` devuelve `{ db, client }` (o similar). Si NO expone el `client` libSQL crudo, añádelo: en `test-db.ts`, donde se crea `createClient`, retorna también ese cliente como `client` en el objeto de retorno (no rompe llamadas existentes que desestructuran solo `db`).

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run src/lib/tournament/event-store.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/schema-ddl.ts src/lib/tournament/event-store.test.ts src/lib/tournament/test-db.ts
git commit -m "feat(tournaments): DDL del nuevo modelo de evento (kind/format/config, sin bloques)"
```

---

## Task 2: Tipos de dominio del evento

**Files:**
- Modify: `src/lib/tournament/types.ts`

- [ ] **Step 1: Añadir tipos del evento al final de `types.ts`**

Añade (no borres lo existente — `MatchFormat`, `SlotRef` se mantienen):

```ts
// --- Modelo de evento (un formato por evento) ---
export type EventKind = 'pozo' | 'torneo';

export type PozoFormat = 'fixed_pairs' | 'americano';
export type TorneoFormat = 'single_elim' | 'groups_elim';

// Config persistida en tournaments.config (JSON) según kind/format.
export interface PozoConfig {
  rounds: number;                 // nº de rondas del pozo
  matchFormat: MatchFormat;       // formato por ronda (por defecto timed/golden_point)
}

export interface TorneoConfig {
  matchFormat: MatchFormat;       // formato del cuadro
  thirdPlace: boolean;            // partido 3er/4º puesto (default false)
  // solo groups_elim:
  numGroups?: number;
  advancePerGroup?: number;       // default 2
}

export type EventConfig = PozoConfig | TorneoConfig;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: el mismo número que antes del cambio (no introduce errores nuevos). Si sube, corrige imports.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tournament/types.ts
git commit -m "feat(tournaments): tipos de dominio del evento (kind/format/config)"
```

---

## Task 3: Store del evento (crear / cargar / listar / actualizar)

**Files:**
- Create: `src/lib/tournament/event-store.ts`
- Test: `src/lib/tournament/event-store.test.ts` (añadir tests)

- [ ] **Step 1: Test de round-trip de creación**

Añade a `src/lib/tournament/event-store.test.ts`:

```ts
import { createEvent, loadEvent, listEvents, updateEvent } from './event-store';
import type { PozoConfig } from './types';

async function seedPlayers(client: import('@libsql/client').Client, ids: string[]) {
  for (const id of ids) {
    await client.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [id, id.toUpperCase()] });
  }
}

describe('event-store', () => {
  it('crea un pozo y lo recarga con pistas, participantes y config', async () => {
    const { db, client } = await createTestDb();
    await seedPlayers(client, ['p1', 'p2', 'p3', 'p4']);

    const id = await createEvent(db, {
      name: 'Pozo del jueves', date: '2026-07-01', location: 'Club',
      kind: 'pozo', format: 'americano',
      config: { rounds: 4, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } } as PozoConfig,
      createdBy: null,
      courts: [
        { label: 'Central', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' },
        { label: 'Pista 8', sortOrder: 2, availableFrom: '17:00', availableTo: '20:00' },
      ],
      participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
    });

    const loaded = await loadEvent(db, id);
    expect(loaded.kind).toBe('pozo');
    expect(loaded.format).toBe('americano');
    expect((loaded.config as PozoConfig).rounds).toBe(4);
    expect(loaded.courts.map((c) => c.label)).toEqual(['Central', 'Pista 8']);
    expect(loaded.participantPlayerIds.sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(loaded.status).toBe('draft');
  });

  it('lista eventos filtrando por kind', async () => {
    const { db, client } = await createTestDb();
    await seedPlayers(client, ['p1', 'p2']);
    await createEvent(db, baseInput('A', 'pozo', 'americano'));
    await createEvent(db, baseInput('B', 'torneo', 'single_elim'));
    const pozos = await listEvents(db, 'pozo');
    expect(pozos.map((e) => e.name)).toEqual(['A']);
    const torneos = await listEvents(db, 'torneo');
    expect(torneos.map((e) => e.name)).toEqual(['B']);

    function baseInput(name: string, kind: 'pozo' | 'torneo', format: string) {
      return {
        name, date: '2026-07-01', location: null, kind, format,
        config: kind === 'pozo'
          ? { rounds: 3, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } }
          : { matchFormat: { kind: 'best_of_3' }, thirdPlace: false },
        createdBy: null,
        courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' }],
        participantPlayerIds: ['p1', 'p2'],
      } as Parameters<typeof createEvent>[1];
    }
  });

  it('updateEvent reemplaza meta, pistas y participantes (no toca kind/format)', async () => {
    const { db, client } = await createTestDb();
    await seedPlayers(client, ['p1', 'p2', 'p3']);
    const id = await createEvent(db, {
      name: 'X', date: '2026-07-01', location: null, kind: 'pozo', format: 'americano',
      config: { rounds: 3, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
      createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: ['p1', 'p2'],
    });
    await updateEvent(db, id, {
      name: 'X2', date: '2026-07-02', location: 'Sitio',
      config: { rounds: 5, matchFormat: { kind: 'timed', minutes: 10, tieRule: 'golden_point' } },
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '18:00', availableTo: '21:00' }],
      participantPlayerIds: ['p1', 'p2', 'p3'],
    });
    const loaded = await loadEvent(db, id);
    expect(loaded.name).toBe('X2');
    expect((loaded.config as PozoConfig).rounds).toBe(5);
    expect(loaded.participantPlayerIds.length).toBe(3);
    expect(loaded.courts[0].availableFrom).toBe('18:00');
  });
});
```

- [ ] **Step 2: Ejecutar (debe FALLAR: no existe event-store)**

Run: `npx vitest run src/lib/tournament/event-store.test.ts`
Expected: FAIL — `Cannot find module './event-store'`.

- [ ] **Step 3: Implementar `event-store.ts`**

Crea `src/lib/tournament/event-store.ts`:

```ts
import { eq, asc } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import {
  tournaments, tournamentCourts, tournamentParticipants,
} from '@/lib/db/schema';
import type { EventKind, EventConfig } from './types';

type Db = LibSQLDatabase<typeof schema>;

export interface EventCourtInput {
  label: string;
  sortOrder: number;
  availableFrom: string;
  availableTo: string;
}

export interface CreateEventInput {
  name: string;
  date: string;
  location: string | null;
  kind: EventKind;
  format: string;
  config: EventConfig;
  createdBy: string | null;
  courts: EventCourtInput[];
  participantPlayerIds: string[];
}

export interface UpdateEventInput {
  name: string;
  date: string;
  location: string | null;
  config: EventConfig;
  courts: EventCourtInput[];
  participantPlayerIds: string[];
}

export interface LoadedEvent {
  id: string;
  name: string;
  date: string;
  location: string | null;
  kind: EventKind;
  format: string;
  config: EventConfig;
  status: string;
  courts: { id: string; label: string; sortOrder: number; availableFrom: string; availableTo: string }[];
  participantPlayerIds: string[];
}

export async function createEvent(db: Db, input: CreateEventInput): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(tournaments).values({
    id, name: input.name, date: input.date, location: input.location ?? null,
    kind: input.kind, format: input.format, config: JSON.stringify(input.config),
    status: 'draft', createdBy: input.createdBy ?? null,
  });
  await insertCourtsAndParticipants(db, id, input.courts, input.participantPlayerIds);
  return id;
}

async function insertCourtsAndParticipants(
  db: Db, tournamentId: string, courts: EventCourtInput[], participantPlayerIds: string[],
): Promise<void> {
  for (const c of courts) {
    await db.insert(tournamentCourts).values({
      id: crypto.randomUUID(), tournamentId, label: c.label, sortOrder: c.sortOrder,
      availableFrom: c.availableFrom, availableTo: c.availableTo,
    });
  }
  for (const pid of participantPlayerIds) {
    await db.insert(tournamentParticipants).values({
      id: crypto.randomUUID(), tournamentId, playerId: pid,
    });
  }
}

export async function loadEvent(db: Db, id: string): Promise<LoadedEvent> {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!t) throw new Error('NOT_FOUND');
  const courts = await db.select().from(tournamentCourts)
    .where(eq(tournamentCourts.tournamentId, id)).orderBy(asc(tournamentCourts.sortOrder));
  const parts = await db.select().from(tournamentParticipants)
    .where(eq(tournamentParticipants.tournamentId, id));
  return {
    id: t.id, name: t.name, date: t.date, location: t.location ?? null,
    kind: t.kind as EventKind, format: t.format,
    config: JSON.parse(t.config) as EventConfig, status: t.status,
    courts: courts.map((c) => ({
      id: c.id, label: c.label, sortOrder: c.sortOrder,
      availableFrom: c.availableFrom, availableTo: c.availableTo,
    })),
    participantPlayerIds: parts.map((p) => p.playerId),
  };
}

export async function listEvents(db: Db, kind: EventKind): Promise<LoadedEvent[]> {
  const rows = await db.select().from(tournaments)
    .where(eq(tournaments.kind, kind)).orderBy(asc(tournaments.date));
  const out: LoadedEvent[] = [];
  for (const r of rows) out.push(await loadEvent(db, r.id));
  return out;
}

export async function updateEvent(db: Db, id: string, input: UpdateEventInput): Promise<void> {
  await db.update(tournaments).set({
    name: input.name, date: input.date, location: input.location ?? null,
    config: JSON.stringify(input.config),
  }).where(eq(tournaments.id, id));
  // Reemplaza pistas y participantes (FK OFF en Turso/harness → borrar explícito).
  await db.delete(tournamentCourts).where(eq(tournamentCourts.tournamentId, id));
  await db.delete(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
  await insertCourtsAndParticipants(db, id, input.courts, input.participantPlayerIds);
}
```

- [ ] **Step 4: Actualizar `src/lib/db/schema.ts`**

En la definición drizzle de `tournaments`, añade las columnas nuevas y elimina la referencia a blocks si la hubiera. Localiza el bloque `export const tournaments = sqliteTable('tournaments', {...})` y asegúrate de que incluye:

```ts
  kind: text('kind').notNull(),
  format: text('format').notNull(),
  config: text('config').notNull().default('{}'),
```

Y en `tournamentGroups`/`tournamentPairs`/`tournamentMatches`, cambia la columna `blockId` por `tournamentId` (text, references `tournaments.id`), eliminando `blockId`. Si existe `export const tournamentBlocks = ...`, elimínalo.

Run para localizar: `grep -n "blockId\|tournamentBlocks\|sqliteTable('tournaments'" src/lib/db/schema.ts`

- [ ] **Step 5: Ejecutar tests**

Run: `npx vitest run src/lib/tournament/event-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament/event-store.ts src/lib/db/schema.ts src/lib/tournament/event-store.test.ts
git commit -m "feat(tournaments): store del evento (crear/cargar/listar/actualizar)"
```

---

## Task 4: Validación del evento

**Files:**
- Modify: `src/lib/tournament/validation.ts`
- Test: `src/lib/tournament/validation.test.ts`

- [ ] **Step 1: Tests de validación**

Añade a `src/lib/tournament/validation.test.ts`:

```ts
import { validateEventInput } from './validation';

describe('validateEventInput', () => {
  const roster = new Set(['p1', 'p2', 'p3', 'p4']);
  const baseCourts = [{ label: 'C1', order: 1, availableFrom: '17:00', availableTo: '20:00' }];

  it('acepta un pozo válido', () => {
    const r = validateEventInput({
      name: 'P', date: '2026-07-01', kind: 'pozo', format: 'americano',
      courts: baseCourts, participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
      config: { rounds: 4, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
    }, roster);
    expect(r.ok).toBe(true);
  });

  it('rechaza kind inválido', () => {
    const r = validateEventInput({
      name: 'P', date: '2026-07-01', kind: 'liga', format: 'americano',
      courts: baseCourts, participantPlayerIds: ['p1', 'p2'], config: {},
    }, roster);
    expect(r.ok).toBe(false);
  });

  it('rechaza pozo con rounds <= 0', () => {
    const r = validateEventInput({
      name: 'P', date: '2026-07-01', kind: 'pozo', format: 'americano',
      courts: baseCourts, participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
      config: { rounds: 0, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
    }, roster);
    expect(r.ok).toBe(false);
  });

  it('acepta torneo groups_elim válido y rechaza advancePerGroup < 1', () => {
    const ok = validateEventInput({
      name: 'T', date: '2026-07-01', kind: 'torneo', format: 'groups_elim',
      courts: baseCourts, participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
      config: { matchFormat: { kind: 'best_of_3' }, thirdPlace: false, numGroups: 2, advancePerGroup: 2 },
    }, roster);
    expect(ok.ok).toBe(true);

    const bad = validateEventInput({
      name: 'T', date: '2026-07-01', kind: 'torneo', format: 'groups_elim',
      courts: baseCourts, participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
      config: { matchFormat: { kind: 'best_of_3' }, thirdPlace: false, numGroups: 2, advancePerGroup: 0 },
    }, roster);
    expect(bad.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar (FALLA: validateEventInput no existe)**

Run: `npx vitest run src/lib/tournament/validation.test.ts -t validateEventInput`
Expected: FAIL.

- [ ] **Step 3: Implementar `validateEventInput`**

Añade a `src/lib/tournament/validation.ts` (reutiliza helpers existentes `HHMM`, el tipo `Validated<T>`, y `validMatchFormat` que ya existe en el fichero):

```ts
import type { EventKind, EventConfig } from './types';

export interface EventInputValidated {
  name: string; date: string; location: string | null;
  kind: EventKind; format: string; config: EventConfig;
  courts: { label: string; order: number; availableFrom: string; availableTo: string }[];
  participantPlayerIds: string[];
}

export function validateEventInput(body: unknown, rosterIds: Set<string>): Validated<EventInputValidated> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Cuerpo inválido' };
  const b = body as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return { ok: false, error: 'Falta el nombre' };
  const date = typeof b.date === 'string' ? b.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Fecha inválida (YYYY-MM-DD)' };
  const location = typeof b.location === 'string' && b.location.trim() ? b.location.trim() : null;

  const kind = b.kind;
  if (kind !== 'pozo' && kind !== 'torneo') return { ok: false, error: 'Tipo inválido' };

  const format = b.format;
  const validFormats = kind === 'pozo' ? ['fixed_pairs', 'americano'] : ['single_elim', 'groups_elim'];
  if (typeof format !== 'string' || !validFormats.includes(format)) {
    return { ok: false, error: 'Formato inválido para el tipo' };
  }

  // Pistas (reutiliza la misma validación que el shell actual).
  if (!Array.isArray(b.courts) || b.courts.length === 0) return { ok: false, error: 'Añade al menos una pista' };
  const courts: EventInputValidated['courts'] = [];
  for (const [i, raw] of b.courts.entries()) {
    const c = raw as Record<string, unknown>;
    const label = typeof c.label === 'string' ? c.label.trim() : '';
    if (!label) return { ok: false, error: `La pista ${i + 1} necesita nombre` };
    const order = typeof c.order === 'number' ? c.order : i + 1;
    const availableFrom = typeof c.availableFrom === 'string' ? c.availableFrom : '';
    const availableTo = typeof c.availableTo === 'string' ? c.availableTo : '';
    if (!HHMM.test(availableFrom) || !HHMM.test(availableTo)) return { ok: false, error: `Horario inválido en "${label}"` };
    if (availableFrom >= availableTo) return { ok: false, error: `En "${label}", inicio debe ser antes que fin` };
    courts.push({ label, order, availableFrom, availableTo });
  }

  // Participantes.
  if (!Array.isArray(b.participantPlayerIds) || b.participantPlayerIds.length === 0) {
    return { ok: false, error: 'Selecciona participantes' };
  }
  const participantPlayerIds: string[] = [];
  for (const pid of b.participantPlayerIds) {
    if (typeof pid !== 'string' || !rosterIds.has(pid)) return { ok: false, error: 'Participante no válido' };
    if (participantPlayerIds.includes(pid)) return { ok: false, error: 'Participante repetido' };
    participantPlayerIds.push(pid);
  }

  // Config por tipo.
  const cfg = (typeof b.config === 'object' && b.config !== null ? b.config : {}) as Record<string, unknown>;
  let config: EventConfig;
  if (kind === 'pozo') {
    const rounds = cfg.rounds;
    if (!Number.isInteger(rounds) || (rounds as number) <= 0) return { ok: false, error: 'El nº de rondas debe ser > 0' };
    const mf = validMatchFormat(cfg.matchFormat);
    if (!mf) return { ok: false, error: 'Formato de partido inválido' };
    config = { rounds: rounds as number, matchFormat: mf };
  } else {
    const mf = validMatchFormat(cfg.matchFormat);
    if (!mf) return { ok: false, error: 'Formato de partido inválido' };
    const thirdPlace = cfg.thirdPlace === true;
    if (format === 'groups_elim') {
      const numGroups = cfg.numGroups;
      const advancePerGroup = cfg.advancePerGroup ?? 2;
      if (!Number.isInteger(numGroups) || (numGroups as number) < 1) return { ok: false, error: 'nº de grupos inválido' };
      if (!Number.isInteger(advancePerGroup) || (advancePerGroup as number) < 1) return { ok: false, error: 'pasan-por-grupo debe ser ≥ 1' };
      config = { matchFormat: mf, thirdPlace, numGroups: numGroups as number, advancePerGroup: advancePerGroup as number };
    } else {
      config = { matchFormat: mf, thirdPlace };
    }
  }

  return { ok: true, value: { name, date, location, kind, format, config, courts, participantPlayerIds } };
}
```

- [ ] **Step 4: Ejecutar tests**

Run: `npx vitest run src/lib/tournament/validation.test.ts -t validateEventInput`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/validation.ts src/lib/tournament/validation.test.ts
git commit -m "feat(tournaments): validación del evento (shell + config por tipo)"
```

---

## Task 5: API — crear / listar / editar evento

**Files:**
- Modify: `src/app/api/tournaments/route.ts`
- Modify: `src/app/api/tournaments/[id]/route.ts`

- [ ] **Step 1: Reescribir `POST` y añadir `GET` en `route.ts`**

Reemplaza `src/app/api/tournaments/route.ts` por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/guard';
import { createEvent, listEvents } from '@/lib/tournament/event-store';
import { validateEventInput } from '@/lib/tournament/validation';
import type { EventKind } from '@/lib/tournament/types';

// GET /api/tournaments?kind=pozo|torneo — listado por tipo (admin).
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const kind = request.nextUrl.searchParams.get('kind');
  if (kind !== 'pozo' && kind !== 'torneo') {
    return NextResponse.json({ error: 'kind requerido (pozo|torneo)' }, { status: 400 });
  }
  const events = await listEvents(db, kind as EventKind);
  return NextResponse.json({ events });
}

// POST /api/tournaments — crea un evento (pozo o torneo). Devuelve { id }.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const body = await request.json();
    const roster = await db.select({ id: players.id }).from(players);
    const rosterIds = new Set(roster.map((p) => p.id));
    const v = validateEventInput(body, rosterIds);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const id = await createEvent(db, {
      name: v.value.name, date: v.value.date, location: v.value.location,
      kind: v.value.kind, format: v.value.format, config: v.value.config,
      createdBy: auth.session.userId,
      courts: v.value.courts.map((c) => ({
        label: c.label, sortOrder: c.order, availableFrom: c.availableFrom, availableTo: c.availableTo,
      })),
      participantPlayerIds: v.value.participantPlayerIds,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear el evento' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Reescribir `PATCH` en `[id]/route.ts`**

Sustituye el handler `PATCH` de `src/app/api/tournaments/[id]/route.ts` por uno que use `updateEvent`. Mantén cualquier `GET`/`DELETE` existente. El `PATCH`:

```ts
import { updateEvent } from '@/lib/tournament/event-store';
import { validateEventInput } from '@/lib/tournament/validation';
// ... (params es Promise en este Next; await params)

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const body = await request.json();
    const roster = await db.select({ id: players.id }).from(players);
    const v = validateEventInput(body, new Set(roster.map((p) => p.id)));
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    await updateEvent(db, id, {
      name: v.value.name, date: v.value.date, location: v.value.location, config: v.value.config,
      courts: v.value.courts.map((c) => ({
        label: c.label, sortOrder: c.order, availableFrom: c.availableFrom, availableTo: c.availableTo,
      })),
      participantPlayerIds: v.value.participantPlayerIds,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "api/tournaments" || echo "sin errores en api/tournaments"`
Expected: "sin errores en api/tournaments". (Otros ficheros que aún usan el store viejo pueden dar error; se arreglan en la Task 8.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tournaments/route.ts src/app/api/tournaments/[id]/route.ts
git commit -m "feat(tournaments): API crear/listar/editar evento (kind/format/config)"
```

---

## Task 6: Navegación + listados (Pozos / Torneos)

**Files:**
- Modify: `src/components/admin/admin-sidebar.tsx`
- Create: `src/app/admin/pozos/page.tsx`
- Create: `src/app/admin/torneos/page.tsx`

- [ ] **Step 1: Enlaces en el sidebar**

En `src/components/admin/admin-sidebar.tsx`, localiza el enlace actual "Torneos" (icono Trophy) y reemplázalo por dos enlaces. Usa el mismo patrón que los demás items del sidebar (mira uno existente para copiar la forma exacta del componente de enlace):

```tsx
// junto a los demás enlaces del nav:
<AdminNavLink href="/admin/pozos" icon={<Trophy size={18} />}>Pozos</AdminNavLink>
<AdminNavLink href="/admin/torneos" icon={<Trophy size={18} />}>Torneos</AdminNavLink>
```

Run para ver el patrón real del componente de enlace y el icono import: `grep -n "Trophy\|NavLink\|href=\"/admin" src/components/admin/admin-sidebar.tsx`
Ajusta el nombre del componente/props al patrón existente (puede no llamarse `AdminNavLink`).

- [ ] **Step 2: Página de listado de pozos**

Crea `src/app/admin/pozos/page.tsx`:

```tsx
import Link from 'next/link';
import { db } from '@/lib/db';
import { listEvents } from '@/lib/tournament/event-store';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function PozosPage() {
  const pozos = await listEvents(db, 'pozo');
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="sec-title">Pozos</h1>
          <p className="muted text-sm mt-1.5">Rey de la pista: parejas fijas o americano.</p>
        </div>
        <Link href="/admin/pozos/new"><Button>Nuevo pozo</Button></Link>
      </div>
      {pozos.length === 0 ? (
        <p className="text-sm text-ink-3">Aún no hay pozos.</p>
      ) : (
        <ul className="space-y-2">
          {pozos.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/tournaments/${p.id}`} className="block border border-line rounded-md px-3 py-2 hover:bg-surface">
                <span className="font-medium">{p.name}</span>
                <span className="text-ink-3 text-sm ml-2">{p.date} · {p.format === 'americano' ? 'Americano' : 'Parejas fijas'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Página de listado de torneos**

Crea `src/app/admin/torneos/page.tsx` idéntica salvo `kind='torneo'`, título "Torneos", subtítulo "Eliminación directa o grupos → eliminación.", botón "Nuevo torneo" → `/admin/torneos/new`, y la etiqueta de formato:

```tsx
import Link from 'next/link';
import { db } from '@/lib/db';
import { listEvents } from '@/lib/tournament/event-store';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function TorneosPage() {
  const torneos = await listEvents(db, 'torneo');
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="sec-title">Torneos</h1>
          <p className="muted text-sm mt-1.5">Eliminación directa o grupos → eliminación.</p>
        </div>
        <Link href="/admin/torneos/new"><Button>Nuevo torneo</Button></Link>
      </div>
      {torneos.length === 0 ? (
        <p className="text-sm text-ink-3">Aún no hay torneos.</p>
      ) : (
        <ul className="space-y-2">
          {torneos.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/tournaments/${t.id}`} className="block border border-line rounded-md px-3 py-2 hover:bg-surface">
                <span className="font-medium">{t.name}</span>
                <span className="text-ink-3 text-sm ml-2">{t.date} · {t.format === 'groups_elim' ? 'Grupos → eliminación' : 'Eliminación directa'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificar imports/patrones de UI**

Run: `grep -rn "from '@/components/ui/button'" src/app/admin | head -2`
Expected: el import de `Button` coincide con el patrón usado en el repo. Ajusta si el componente se importa distinto.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/admin-sidebar.tsx src/app/admin/pozos src/app/admin/torneos
git commit -m "feat(tournaments): navegación y listados separados de Pozos y Torneos"
```

---

## Task 7: Formulario de creación (shell + config por tipo)

**Files:**
- Create: `src/components/admin/event-form.tsx`
- Create: `src/app/admin/pozos/new/page.tsx`
- Create: `src/app/admin/torneos/new/page.tsx`

- [ ] **Step 1: Componente `event-form.tsx`**

Crea `src/components/admin/event-form.tsx` partiendo del actual `tournament-form.tsx` (cópialo como base — mismos selectores de jugadores/pistas) y añade: prop `kind`, selector de `format`, y los campos de config por tipo. Estructura:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface RosterPlayer { id: string; name: string; nickname: string | null }

export function EventForm({ kind, roster }: { kind: 'pozo' | 'torneo'; roster: RosterPlayer[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [courts, setCourts] = useState([{ label: '', availableFrom: '17:00', availableTo: '20:00' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Config por tipo
  const [format, setFormat] = useState(kind === 'pozo' ? 'americano' : 'single_elim');
  const [rounds, setRounds] = useState(4);                 // pozo
  const [numGroups, setNumGroups] = useState(2);           // torneo groups_elim
  const [advancePerGroup, setAdvancePerGroup] = useState(2);
  const [thirdPlace, setThirdPlace] = useState(false);     // torneo

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function setCourt(i: number, patch: Partial<typeof courts[number]>) {
    setCourts((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  function buildConfig() {
    if (kind === 'pozo') {
      return { rounds, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } };
    }
    const base = { matchFormat: { kind: 'best_of_3' }, thirdPlace };
    return format === 'groups_elim' ? { ...base, numGroups, advancePerGroup } : base;
  }

  async function submit() {
    setLoading(true); setError(null);
    const res = await fetch('/api/tournaments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, date, location: location || null, kind, format,
        config: buildConfig(),
        courts: courts.map((c, i) => ({ label: c.label, order: i + 1, availableFrom: c.availableFrom, availableTo: c.availableTo })),
        participantPlayerIds: [...selected],
      }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Error'); setLoading(false); return; }
    router.push(kind === 'pozo' ? '/admin/pozos' : '/admin/torneos');
  }

  return (
    <div className="space-y-6">
      {/* Meta */}
      <div className="space-y-3 max-w-2xl">
        <div><Label htmlFor="name">Nombre *</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div><Label htmlFor="date">Fecha *</Label><Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
        <div><Label htmlFor="location">Lugar</Label><Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
      </div>

      {/* Config por tipo */}
      <div className="space-y-3 max-w-2xl">
        <Label htmlFor="format">Formato *</Label>
        <select id="format" aria-label="Formato" value={format} onChange={(e) => setFormat(e.target.value)} className="border border-line rounded-md px-2 py-1.5">
          {kind === 'pozo' ? (
            <>
              <option value="americano">Americano (parejas rotativas)</option>
              <option value="fixed_pairs">Parejas fijas</option>
            </>
          ) : (
            <>
              <option value="single_elim">Eliminación directa</option>
              <option value="groups_elim">Grupos → eliminación</option>
            </>
          )}
        </select>

        {kind === 'pozo' && (
          <div><Label htmlFor="rounds">Nº de rondas</Label>
            <Input id="rounds" type="number" value={rounds} onChange={(e) => setRounds(Number(e.target.value))} /></div>
        )}
        {kind === 'torneo' && format === 'groups_elim' && (
          <div className="flex gap-3">
            <div><Label htmlFor="numGroups">Nº de grupos</Label><Input id="numGroups" type="number" value={numGroups} onChange={(e) => setNumGroups(Number(e.target.value))} /></div>
            <div><Label htmlFor="advancePerGroup">Pasan por grupo</Label><Input id="advancePerGroup" type="number" value={advancePerGroup} onChange={(e) => setAdvancePerGroup(Number(e.target.value))} /></div>
          </div>
        )}
        {kind === 'torneo' && (
          <label className="flex items-center gap-2"><input type="checkbox" checked={thirdPlace} onChange={(e) => setThirdPlace(e.target.checked)} /> <span className="text-sm">Partido por el 3er/4º puesto</span></label>
        )}
      </div>

      {/* Pistas: el ORDEN = la escalera del pozo */}
      <div className="max-w-2xl space-y-2">
        <Label>Pistas (con su nombre real; el orden es la escalera del pozo)</Label>
        {courts.map((c, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1"><Label className="text-xs">Nombre</Label><Input value={c.label} onChange={(e) => setCourt(i, { label: e.target.value })} /></div>
            <div><Label className="text-xs">Desde</Label><Input type="time" value={c.availableFrom} onChange={(e) => setCourt(i, { availableFrom: e.target.value })} /></div>
            <div><Label className="text-xs">Hasta</Label><Input type="time" value={c.availableTo} onChange={(e) => setCourt(i, { availableTo: e.target.value })} /></div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setCourts((cs) => [...cs, { label: '', availableFrom: '17:00', availableTo: '20:00' }])}>Añadir pista</Button>
      </div>

      {/* Participantes */}
      <div className="max-w-2xl">
        <Label>Participantes ({selected.size})</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
          {roster.map((p) => (
            <label key={p.id} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-surface">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="text-sm">{p.name}{p.nickname ? ` (${p.nickname})` : ''}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button onClick={submit} disabled={loading}>{loading ? 'Creando...' : (kind === 'pozo' ? 'Crear pozo' : 'Crear torneo')}</Button>
    </div>
  );
}
```

> Nota: las parejas fijas (definición de quién juega con quién) se piden en el Plan 2 (pozo parejas fijas) y Plan 3 (torneo), no aquí — en Fase 1/Plan 1 el borrador guarda jugadores + config.

- [ ] **Step 2: Página `pozos/new`**

Crea `src/app/admin/pozos/new/page.tsx`:

```tsx
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { asc } from 'drizzle-orm';
import { EventForm } from '@/components/admin/event-form';

export const dynamic = 'force-dynamic';

export default async function NewPozoPage() {
  const roster = await db.select({ id: players.id, name: players.name, nickname: players.nickname }).from(players).orderBy(asc(players.name));
  return (
    <div className="space-y-6">
      <h1 className="sec-title">Nuevo pozo</h1>
      <EventForm kind="pozo" roster={roster} />
    </div>
  );
}
```

- [ ] **Step 3: Página `torneos/new`**

Crea `src/app/admin/torneos/new/page.tsx` igual pero `kind="torneo"` y título "Nuevo torneo".

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "event-form|pozos/new|torneos/new" || echo "ok"`
Expected: "ok" (sin errores en estos ficheros).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/event-form.tsx src/app/admin/pozos/new src/app/admin/torneos/new
git commit -m "feat(tournaments): formulario de creación de evento (shell + config por tipo)"
```

---

## Task 8: Retirar el modelo de bloques (limpieza)

**Files:**
- Delete: `src/components/admin/blocks-editor.tsx`
- Delete: `src/app/admin/tournaments/[id]/blocks/` (carpeta)
- Delete: `src/app/admin/tournaments/new/` (carpeta) y `src/app/admin/tournaments/page.tsx`
- Delete: `src/components/admin/tournament-form.tsx`
- Modify: `src/lib/tournament/store.ts`, `src/lib/tournament/generate.ts`, rutas `/blocks` y `/generate` que dependan de bloques

- [ ] **Step 1: Localizar todo lo que usa el modelo de bloques**

Run: `grep -rln "tournament_blocks\|blockId\|block_id\|CreateBlockInput\|replaceBlocks\|insertBlocks\|tournament-form\|blocks-editor" src/ | grep -v ".test."`
Expected: lista de ficheros a limpiar.

- [ ] **Step 2: Borrar UI y rutas de bloques**

```bash
git rm -r src/app/admin/tournaments/[id]/blocks
git rm src/components/admin/blocks-editor.tsx
git rm src/components/admin/tournament-form.tsx
git rm -r src/app/admin/tournaments/new
git rm src/app/admin/tournaments/page.tsx
git rm src/app/api/tournaments/[id]/blocks/route.ts
```

- [ ] **Step 3: Retirar funciones de bloques de `store.ts`**

En `src/lib/tournament/store.ts`, elimina `BlockConfig`, `CreateBlockInput`, `insertBlocks`, `replaceBlocks`, y cualquier uso de `tournament_blocks`/`blockId`. Lo que siga necesitando el Plan 2/3 (generate/results) se reconectará a `event-store` entonces; por ahora, deja en `store.ts` SOLO lo que compile sin bloques, o vacíalo si todo dependía de bloques. La parrilla/resultados (`/admin/tournaments/[id]/schedule`, `/generate`, `recordResult`) se reescriben en Planes 2-3; si rompen el build ahora, **stub temporal**: comenta sus rutas devolviendo 501, o elimínalas si se van a rehacer. Decisión recomendada: eliminar `src/app/admin/tournaments/[id]/schedule/` y `src/app/api/tournaments/[id]/generate/route.ts` y `.../matches/[matchId]/result/route.ts` ahora, y rehacerlos en Planes 2-3.

```bash
git rm -r src/app/admin/tournaments/[id]/schedule
git rm src/app/api/tournaments/[id]/generate/route.ts
git rm -r src/app/api/tournaments/[id]/matches
git rm -r "src/app/(public)/tournaments/[id]"
```

> La vista pública por tipo (`/pozos/[id]`, `/torneos/[id]`) se crea en Planes 2-3. El panel admin `/admin/tournaments/[id]` se reescribe mínimamente en el Step 4.

- [ ] **Step 4: Panel admin mínimo del evento**

Reemplaza `src/app/admin/tournaments/[id]/page.tsx` por un panel que use `loadEvent` y muestre meta + config (sin bloques ni generar todavía):

```tsx
import { db } from '@/lib/db';
import { loadEvent } from '@/lib/tournament/event-store';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function EventPanel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ev;
  try { ev = await loadEvent(db, id); } catch { notFound(); }
  return (
    <div className="space-y-4">
      <h1 className="sec-title">{ev.name}</h1>
      <p className="muted text-sm">{ev.date}{ev.location ? ` · ${ev.location}` : ''} · {ev.kind === 'pozo' ? 'Pozo' : 'Torneo'} ({ev.format})</p>
      <div className="text-sm">
        <p className="font-medium">Pistas (escalera):</p>
        <ol className="list-decimal ml-5">{ev.courts.map((c) => <li key={c.id}>{c.label} · {c.availableFrom}–{c.availableTo}</li>)}</ol>
        <p className="font-medium mt-3">Participantes: {ev.participantPlayerIds.length}</p>
      </div>
      <p className="text-ink-3 text-sm">La generación de parrilla llega en el siguiente plan.</p>
    </div>
  );
}
```

- [ ] **Step 5: Build + typecheck limpios**

Run: `TURSO_DATABASE_URL=file:./build-check.db TURSO_AUTH_TOKEN= AUTH_SECRET=x ADMIN_EMAIL=a@b.com npm run build 2>&1 | tail -15; rm -f build-check.db`
Expected: build OK, sin errores de tipos. Corrige cualquier import roto que quede del modelo viejo.

- [ ] **Step 6: Suite unit verde**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests"`
Expected: todo verde. Borra/actualiza los tests viejos que probaban bloques (`store.test.ts` partes de bloques, `generate.test.ts` si depende de bloques) — si un test cubre algo que ya no existe, elimínalo; si cubre motor puro reutilizable (scheduler, fixed-pairs, pozo movimiento), déjalo.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(tournaments): retira el modelo de bloques (UI, rutas y store) tras la migración a evento único"
```

---

## Task 9: E2E — crear pozo y torneo (borradores)

**Files:**
- Create: `e2e/event-create.spec.ts`
- Modify: `e2e/global-setup.ts` (si hace falta) — el seed de jugadores ya existe.

- [ ] **Step 1: Spec e2e**

Crea `e2e/event-create.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('admin crea un POZO americano desde el formulario', async ({ page }) => {
  await page.goto('/admin/pozos/new');
  await page.getByLabel('Nombre').fill('E2E Pozo');
  await page.getByLabel('Fecha').fill('2026-07-01');
  await page.getByLabel('Formato').selectOption('americano');
  await page.getByLabel('Nº de rondas').fill('4');
  // una pista
  await page.locator('input').filter({ hasNot: page.locator('[type=checkbox]') }).first();
  await page.getByText('Añadir pista'); // ya hay 1 por defecto; rellena su nombre
  await page.locator('text=Nombre').first();
  for (const n of ['JUGADOR 1', 'JUGADOR 2', 'JUGADOR 3', 'JUGADOR 4']) {
    // el seed crea players con name = id.toUpperCase() en otros tests; aquí usa los de global-setup
  }
  // Selecciona 4 participantes sembrados en global-setup ("Jugador 1".."Jugador 8")
  for (const n of ['Jugador 1', 'Jugador 2', 'Jugador 3', 'Jugador 4']) {
    await page.getByRole('checkbox', { name: n }).check();
  }
  // nombre de la pista por defecto
  await page.getByLabel('Nombre', { exact: false }); // la pista usa Label "Nombre" (xs)
  await page.locator('input').nth(3).fill('Central'); // ajustar índice si cambia el layout
  await page.getByRole('button', { name: 'Crear pozo' }).click();
  await expect(page).toHaveURL(/\/admin\/pozos$/);
  await expect(page.getByRole('link', { name: /E2E Pozo/ })).toBeVisible();
});

test('admin crea un TORNEO grupos→eliminación', async ({ page }) => {
  await page.goto('/admin/torneos/new');
  await page.getByLabel('Nombre').fill('E2E Torneo');
  await page.getByLabel('Fecha').fill('2026-07-02');
  await page.getByLabel('Formato').selectOption('groups_elim');
  await page.getByLabel('Nº de grupos').fill('2');
  await page.getByLabel('Pasan por grupo').fill('2');
  for (const n of ['Jugador 1', 'Jugador 2', 'Jugador 3', 'Jugador 4']) {
    await page.getByRole('checkbox', { name: n }).check();
  }
  await page.locator('input').nth(4).fill('Central'); // ajustar índice
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await expect(page).toHaveURL(/\/admin\/torneos$/);
  await expect(page.getByRole('link', { name: /E2E Torneo/ })).toBeVisible();
});
```

> **Nota para el implementador:** los selectores de "nombre de pista" por índice (`input.nth(...)`) son frágiles. Al implementar, añade un `aria-label="Nombre de la pista"` al `Input` de la pista en `event-form.tsx` y usa `page.getByLabel('Nombre de la pista').first().fill('Central')` en ambos tests. Ajusta el spec en consecuencia (este es el enfoque preferido).

- [ ] **Step 2: Ejecutar e2e**

Run: `npx playwright test e2e/event-create.spec.ts`
Expected: 2 passed. Itera selectores si algo falla (sigue la nota del aria-label).

- [ ] **Step 3: Commit**

```bash
git add e2e/event-create.spec.ts src/components/admin/event-form.tsx
git commit -m "test(e2e): crear pozo y torneo (borradores) desde la UI"
```

---

## Task 10: Verificación final + migración de esquema

**Files:** —

- [ ] **Step 1: Suite completa**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests" && npx playwright test 2>&1 | grep -E "passed|failed" | tail -1`
Expected: unit todo verde; e2e todo passed (incluye las specs viejas que sigan siendo válidas — si alguna spec vieja probaba el flujo de bloques ya borrado, elimínala en este paso y deja constancia en el commit).

- [ ] **Step 2: Tipos + build**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` → Expected: 0
Run: `TURSO_DATABASE_URL=file:./b.db TURSO_AUTH_TOKEN= AUTH_SECRET=x ADMIN_EMAIL=a@b.com npm run build 2>&1 | tail -5; rm -f b.db` → Expected: build OK.

- [ ] **Step 3: Nota de despliegue (NO ejecutar aquí)**

El endpoint `/api/migrate-tournaments` usa `TOURNAMENT_DDL` con `CREATE TABLE IF NOT EXISTS`, así que **NO** altera la tabla `tournaments` ya existente en prod (no añadirá las columnas nuevas a una tabla creada con el esquema viejo). Como acordamos rebuild sin datos: al desplegar, habrá que **recrear las tablas de torneo en prod** (DROP de las `tournament*` + re-`migrate-tournaments`), vía un endpoint de migración dedicado que se diseñará al cerrar la Fase 1 completa (Planes 1-3). Déjalo anotado; NO se toca prod en este plan.

- [ ] **Step 4: Commit final (si quedan cambios)**

```bash
git add -A
git commit -m "test(tournaments): verificación final de la foundation (unit+e2e+build)" || echo "nada que commitear"
git push origin worktree-tournament-builder
```

---

## Self-review (cobertura vs. spec)

- **Separar Pozo/Torneo como entidades de primer nivel** → Tasks 1-3 (modelo), 6 (navegación), 7 (creación). ✓
- **Eliminar bloques** → Task 1 (DDL), 8 (limpieza). ✓
- **Config por tipo (pozo: rondas+formato; torneo: grupos/avance/3er puesto)** → Task 2 (tipos), 4 (validación), 7 (UI). ✓
- **Pistas reales + orden = escalera** → Task 1 (sort_order), 7 (texto en el form), 8 (panel muestra "escalera"). ✓ (el uso real de la escalera es del motor de pozo, Plan 2.)
- **Siembra aleatoria, parejas que define el admin, generación, clasificación** → **NO en este plan**: son de Planes 2 (pozo) y 3 (torneo). Este plan entrega solo borradores creables/listables. ✓ (alcance correcto)
- **Testing e2e** → Task 9. ✓
- **Sin migración / rebuild** → Task 10 Step 3 (nota de recreación de tablas en prod, diferida). ✓

**Notas / posibles ajustes durante la ejecución:**
- Si `store.ts` queda vacío tras la Task 8, bórralo y ajusta imports.
- Algunos tests viejos (`store.test.ts`, `generate.test.ts`, specs e2e de torneo con bloques) cubren el modelo retirado: elimínalos en Task 8/10; conserva los de motor puro reutilizable (`scheduler`, `fixed-pairs`, `pozo` movimiento, `time`, `display`).
- Añade `aria-label="Nombre de la pista"` al input de pista para selectores e2e estables (ver nota en Task 9).
- El panel `/admin/tournaments/[id]` es temporal; Planes 2-3 lo enriquecen con generar/parrilla/clasificación por tipo.
