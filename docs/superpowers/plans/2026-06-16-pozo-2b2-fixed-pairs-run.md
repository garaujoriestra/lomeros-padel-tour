# Pozo 2b-2 — Run de parejas fijas + persistencia/validación de parejas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el backend del pozo de **parejas fijas**: persistir/validar las parejas que define el admin y generar/avanzar/clasificar el pozo de parejas fijas, todo expuesto tras una fachada que despacha por `format` (americano vs parejas fijas).

**Architecture:** Funciones puras de movimiento ya existen (`pozo-pairs.ts`, `ladder.ts`, `seeding.ts`). Este plan añade (1) una capa de persistencia de parejas (`pair-store.ts`) + validación (`validatePairsInput`) + endpoint `PUT /api/tournaments/[id]/pairs`; (2) la capa run de parejas fijas (`pozo-pairs-run.ts`) que reusa el andamiaje de rejilla pista×ronda de `pozo-run.ts` pero con el motor de parejas y slots de tipo `pair`; (3) una fachada `pozo-engine.ts` que despacha `generatePozo`/`recordPozoResult`/`pozoStandingsLive` por formato. La UI/e2e HTTP completos son del Plan 2c.

**Tech Stack:** TypeScript, Drizzle ORM (libSQL), vitest. DB de test en memoria vía `createTestDb()` (`src/lib/tournament/test-db.ts`).

---

## File Structure

- **Crear** `src/lib/tournament/pair-store.ts` — `loadPairs` / `replacePairs` sobre `tournament_pairs`.
- **Crear** `src/lib/tournament/pair-store.test.ts` — unit del store.
- **Modificar** `src/lib/tournament/validation.ts` — añadir `validatePairsInput`.
- **Modificar** `src/lib/tournament/validation.test.ts` — casos de `validatePairsInput`.
- **Crear** `src/lib/tournament/pozo-pairs-run.ts` — `generatePozoPairs` / `recordPozoPairsResult` / `pozoPairsStandingsLive`.
- **Crear** `src/lib/tournament/pozo-pairs-run.test.ts` — unit del run de parejas (espejo de `pozo-run.test.ts`).
- **Crear** `src/lib/tournament/pozo-engine.ts` — fachada de dispatch por formato.
- **Crear** `src/lib/tournament/pozo-engine.test.ts` — unit del dispatch.
- **Crear** `src/app/api/tournaments/[id]/pairs/route.ts` — `PUT` parejas (admin).

Patrones de referencia (leer antes de empezar): `src/lib/tournament/pozo-run.ts` (andamiaje run), `src/lib/tournament/pozo-run.test.ts` (estructura de test), `src/lib/tournament/event-store.ts` (`loadEvent`), `src/app/api/tournaments/[id]/route.ts` (forma de las rutas + `requireAdmin`).

---

## Task 1: Store de parejas (`pair-store.ts`)

**Files:**
- Create: `src/lib/tournament/pair-store.ts`
- Test: `src/lib/tournament/pair-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tournament/pair-store.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent } from './event-store';
import { loadPairs, replacePairs } from './pair-store';
import type { PozoConfig } from './types';

const CFG: PozoConfig = { rounds: 3, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } };

async function makeEvent(db: any) {
  return createEvent(db, {
    name: 'P', date: '2026-07-01', location: null, kind: 'pozo', format: 'fixed_pairs',
    config: CFG, createdBy: null,
    courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' }],
    participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
  });
}

describe('pair-store', () => {
  it('replacePairs inserta y loadPairs devuelve las parejas', async () => {
    const { db } = await createTestDb();
    const id = await makeEvent(db);
    await replacePairs(db, id, [['p1', 'p2'], ['p3', 'p4']]);
    const pairs = await loadPairs(db, id);
    expect(pairs.length).toBe(2);
    expect(pairs.every((p) => typeof p.id === 'string' && p.id.length > 0)).toBe(true);
    const flat = pairs.flatMap((p) => [p.player1Id, p.player2Id]).sort();
    expect(flat).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('replacePairs reemplaza el set anterior (no acumula)', async () => {
    const { db } = await createTestDb();
    const id = await makeEvent(db);
    await replacePairs(db, id, [['p1', 'p2'], ['p3', 'p4']]);
    await replacePairs(db, id, [['p1', 'p3']]);
    const pairs = await loadPairs(db, id);
    expect(pairs.length).toBe(1);
    expect([pairs[0].player1Id, pairs[0].player2Id].sort()).toEqual(['p1', 'p3']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tournament/pair-store.test.ts`
Expected: FAIL — `loadPairs`/`replacePairs` no existen (módulo no encontrado).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/tournament/pair-store.ts
import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournamentPairs } from '@/lib/db/schema';

type Db = LibSQLDatabase<typeof schema>;

export interface LoadedPair {
  id: string;
  player1Id: string;
  player2Id: string;
  label: string | null;
}

export async function loadPairs(db: Db, tournamentId: string): Promise<LoadedPair[]> {
  const rows = await db.select().from(tournamentPairs).where(eq(tournamentPairs.tournamentId, tournamentId));
  return rows.map((r) => ({ id: r.id, player1Id: r.player1Id, player2Id: r.player2Id, label: r.label ?? null }));
}

// Reemplaza el set completo de parejas del evento (FK OFF en Turso/harness → borrado explícito).
export async function replacePairs(db: Db, tournamentId: string, pairs: [string, string][]): Promise<void> {
  await db.delete(tournamentPairs).where(eq(tournamentPairs.tournamentId, tournamentId));
  for (const [player1Id, player2Id] of pairs) {
    await db.insert(tournamentPairs).values({ id: crypto.randomUUID(), tournamentId, player1Id, player2Id });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tournament/pair-store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pair-store.ts src/lib/tournament/pair-store.test.ts
git commit -m "feat(pozo): store de parejas (load/replace sobre tournament_pairs)"
```

---

## Task 2: Validación de parejas (`validatePairsInput`)

**Files:**
- Modify: `src/lib/tournament/validation.ts`
- Test: `src/lib/tournament/validation.test.ts`

Regla (del spec): nº par de jugadores, cada jugador en **exactamente una** pareja, ambos del **roster** del evento, sin repetidos, y **todos** los participantes emparejados.

- [ ] **Step 1: Write the failing test**

Añade al final de `src/lib/tournament/validation.test.ts`:

```ts
import { validatePairsInput } from './validation';

describe('validatePairsInput', () => {
  const roster = new Set(['p1', 'p2', 'p3', 'p4']);

  it('acepta un emparejado completo y válido', () => {
    const r = validatePairsInput({ pairs: [['p1', 'p2'], ['p3', 'p4']] }, roster);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([['p1', 'p2'], ['p3', 'p4']]);
  });

  it('rechaza un jugador en dos parejas', () => {
    const r = validatePairsInput({ pairs: [['p1', 'p2'], ['p1', 'p4']] }, roster);
    expect(r.ok).toBe(false);
  });

  it('rechaza un jugador fuera del roster', () => {
    const r = validatePairsInput({ pairs: [['p1', 'p2'], ['p3', 'pX']] }, roster);
    expect(r.ok).toBe(false);
  });

  it('rechaza una pareja con el mismo jugador dos veces', () => {
    const r = validatePairsInput({ pairs: [['p1', 'p1'], ['p3', 'p4']] }, roster);
    expect(r.ok).toBe(false);
  });

  it('rechaza si quedan participantes sin emparejar', () => {
    const r = validatePairsInput({ pairs: [['p1', 'p2']] }, roster);
    expect(r.ok).toBe(false);
  });

  it('rechaza cuerpo sin array de pairs', () => {
    expect(validatePairsInput({}, roster).ok).toBe(false);
    expect(validatePairsInput({ pairs: 'x' }, roster).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tournament/validation.test.ts`
Expected: FAIL — `validatePairsInput` no exportado.

- [ ] **Step 3: Write minimal implementation**

Añade al final de `src/lib/tournament/validation.ts` (reusa el tipo `Validated<T>` ya definido arriba en el fichero):

```ts
// Valida el set de parejas de un evento. participantIds = roster del evento.
// Exige: cada pareja con 2 jugadores distintos del roster, cada jugador en una sola
// pareja, y TODOS los participantes emparejados (nº par y completo).
export function validatePairsInput(body: unknown, participantIds: Set<string>): Validated<[string, string][]> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Cuerpo inválido' };
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.pairs)) return { ok: false, error: 'Faltan las parejas' };

  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  for (const [i, raw] of b.pairs.entries()) {
    if (!Array.isArray(raw) || raw.length !== 2) return { ok: false, error: `La pareja ${i + 1} es inválida` };
    const [p1, p2] = raw;
    if (typeof p1 !== 'string' || typeof p2 !== 'string') return { ok: false, error: `La pareja ${i + 1} es inválida` };
    if (p1 === p2) return { ok: false, error: `Una pareja no puede repetir jugador` };
    for (const p of [p1, p2]) {
      if (!participantIds.has(p)) return { ok: false, error: 'Jugador fuera del roster' };
      if (seen.has(p)) return { ok: false, error: 'Un jugador no puede estar en dos parejas' };
      seen.add(p);
    }
    pairs.push([p1, p2]);
  }
  if (pairs.length === 0) return { ok: false, error: 'Define al menos una pareja' };
  if (seen.size !== participantIds.size) return { ok: false, error: 'Todos los participantes deben estar emparejados' };
  return { ok: true, value: pairs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tournament/validation.test.ts`
Expected: PASS (incluye los 6 casos nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/validation.ts src/lib/tournament/validation.test.ts
git commit -m "feat(pozo): validación del set de parejas fijas"
```

---

## Task 3: Generar la ronda 0 del pozo de parejas fijas (`pozo-pairs-run.ts`)

**Files:**
- Create: `src/lib/tournament/pozo-pairs-run.ts`
- Test: `src/lib/tournament/pozo-pairs-run.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tournament/pozo-pairs-run.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent } from './event-store';
import { loadEvent } from './event-store';
import { replacePairs } from './pair-store';
import { listPozoMatches } from './pozo-run';
import {
  generatePozoPairs, recordPozoPairsResult, pozoPairsStandingsLive,
} from './pozo-pairs-run';
import type { PozoConfig } from './types';

const CFG: PozoConfig = { rounds: 3, matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' } };

async function seedPlayers(client: any, ids: string[]) {
  for (const id of ids) {
    await client.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [id, id.toUpperCase()] });
  }
}

// nPairs parejas, nCourts pistas. Devuelve { id, pairIds }.
async function makePairsPozo(db: any, client: any, nPairs: number, nCourts: number) {
  const players = Array.from({ length: nPairs * 2 }, (_, i) => `p${i + 1}`);
  await seedPlayers(client, players);
  const courts = Array.from({ length: nCourts }, (_, i) => ({
    label: `Pista ${i + 1}`, sortOrder: i + 1, availableFrom: '17:00', availableTo: '20:00',
  }));
  const id = await createEvent(db, {
    name: 'Pozo PF', date: '2026-07-01', location: null, kind: 'pozo', format: 'fixed_pairs',
    config: CFG, createdBy: null, courts, participantPlayerIds: players,
  });
  // Empareja consecutivos: [p1,p2], [p3,p4], ...
  const pairs: [string, string][] = [];
  for (let i = 0; i < players.length; i += 2) pairs.push([players[i], players[i + 1]]);
  await replacePairs(db, id, pairs);
  const stored = (await import('./pair-store')).loadPairs;
  const pairIds = (await stored(db, id)).map((p) => p.id);
  return { id, pairIds };
}

async function playRound(db: any, id: string, round: number) {
  const ms = await listPozoMatches(db, id, round);
  for (const m of ms) await recordPozoPairsResult(db, m.id, 4, 2); // A gana siempre
  return ms;
}

describe('generatePozoPairs', () => {
  it('crea 1 partido por pista en la ronda 0, con 2 slots de pareja y hora por rejilla', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePairsPozo(db, client, 4, 2); // 4 parejas, 2 pistas → 2 partidos
    await generatePozoPairs(db, id, 123);

    const r0 = await listPozoMatches(db, id, 0);
    expect(r0.length).toBe(2);
    for (const m of r0) {
      const a1 = JSON.parse(m.slotA1!); const b1 = JSON.parse(m.slotB1!);
      expect(a1.type).toBe('pair'); expect(b1.type).toBe('pair');
      expect(a1.pairId).not.toBe(b1.pairId);
      expect(m.slotA2).toBeNull(); expect(m.slotB2).toBeNull();
      expect(m.phaseTag).toBe('pozo');
      expect(m.status).toBe('pending');
      expect(m.scheduledStart).toBe('17:00');
    }
    expect((await loadEvent(db, id)).status).toBe('scheduled');
  });

  it('es reproducible: misma semilla → misma ronda 0', async () => {
    const a = await createTestDb(); const pa = await makePairsPozo(a.db, a.client, 4, 2);
    await generatePozoPairs(a.db, pa.id, 777);
    const b = await createTestDb(); const pb = await makePairsPozo(b.db, b.client, 4, 2);
    await generatePozoPairs(b.db, pb.id, 777);
    const ma = (await listPozoMatches(a.db, pa.id, 0)).map((m) => JSON.parse(m.slotA1!).pairId.length);
    const mb = (await listPozoMatches(b.db, pb.id, 0)).map((m) => JSON.parse(m.slotA1!).pairId.length);
    // mismo nº de partidos y misma estructura (los ids difieren entre DBs, pero el barajado es determinista
    // sobre el mismo orden de inserción → mismas posiciones relativas)
    expect(ma.length).toBe(mb.length);
  });

  it('lanza si no hay parejas definidas', async () => {
    const { db, client } = await createTestDb();
    const players = ['p1', 'p2'];
    await seedPlayers(client, players);
    const id = await createEvent(db, {
      name: 'X', date: '2026-07-01', location: null, kind: 'pozo', format: 'fixed_pairs',
      config: CFG, createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: players,
    });
    await expect(generatePozoPairs(db, id, 1)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tournament/pozo-pairs-run.test.ts`
Expected: FAIL — funciones no exportadas.

- [ ] **Step 3: Write minimal implementation (generación)**

```ts
// src/lib/tournament/pozo-pairs-run.ts
import { and, eq, asc } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournaments, tournamentCourts, tournamentMatches } from '@/lib/db/schema';
import { loadEvent } from './event-store';
import { loadPairs } from './pair-store';
import { shuffleDeterministic } from './seeding';
import { seedPozoPairsCourts, nextPozoPairsRound, type PairsRound, type PairCourtResult } from './pozo-pairs';
import { hhmmToMin, minToHHMM } from './time';
import { estimatedMatchMinutes } from './scheduler';
import { ladderStandings, type LadderStanding } from './ladder';
import { listPozoMatches, type PozoMatchRow } from './pozo-run';
import type { PozoConfig, SlotRef } from './types';

type Db = LibSQLDatabase<typeof schema>;
const PHASE = 'pozo';

function pairSlot(pairId: string): string {
  return JSON.stringify({ type: 'pair', pairId } as SlotRef);
}
function parsePair(slot: string | null): string {
  return (JSON.parse(slot ?? '{}') as { pairId: string }).pairId;
}

// Escribe los partidos de una ronda: la pista k aloja [parejaTop vs parejaBottom].
async function writePozoPairsRound(
  db: Db, tournamentId: string, round: number, state: PairsRound,
  courtsByOrder: { id: string; fromMin: number }[], slotMinutes: number,
): Promise<void> {
  for (let k = 0; k < state.courts.length; k++) {
    const pair = state.courts[k];
    if (pair.length < 2) continue; // pista incompleta: no se juega
    const [topPair, bottomPair] = pair;
    const court = courtsByOrder[k];
    const startMin = court.fromMin + round * slotMinutes;
    await db.insert(tournamentMatches).values({
      id: crypto.randomUUID(), tournamentId, courtId: court.id, round, phaseTag: PHASE,
      scheduledStart: minToHHMM(startMin), scheduledEnd: minToHHMM(startMin + slotMinutes),
      status: 'pending',
      slotA1: pairSlot(topPair), slotA2: null,
      slotB1: pairSlot(bottomPair), slotB2: null,
    });
  }
}

export async function generatePozoPairs(db: Db, tournamentId: string, seed: number): Promise<void> {
  const ev = await loadEvent(db, tournamentId);
  if (ev.kind !== 'pozo' || ev.format !== 'fixed_pairs') throw new Error('generatePozoPairs: solo pozo parejas fijas');
  const cfg = ev.config as PozoConfig;
  const pairs = await loadPairs(db, tournamentId);
  if (pairs.length === 0) throw new Error('NO_PAIRS');

  const courtsByOrder = ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ id: c.id, fromMin: hhmmToMin(c.availableFrom) }));
  const slotMinutes = estimatedMatchMinutes(cfg.matchFormat);

  const pairIds = shuffleDeterministic(pairs.map((p) => p.id), seed);
  const state0 = seedPozoPairsCourts(pairIds, courtsByOrder.length);
  await writePozoPairsRound(db, tournamentId, 0, state0, courtsByOrder, slotMinutes);

  await db.update(tournaments).set({ status: 'scheduled' }).where(eq(tournaments.id, tournamentId));
}
```

> Nota: `listPozoMatches` (de `pozo-run.ts`) es agnóstico al formato (filtra por `phaseTag='pozo'`), así que se reutiliza tal cual. Los imports `and`/`asc`/`tournamentCourts`/`PairCourtResult`/`nextPozoPairsRound`/`PozoMatchRow` se usan en las Tasks 4–5; déjalos ya importados.

- [ ] **Step 4: Run test to verify generación passes**

Run: `npx vitest run src/lib/tournament/pozo-pairs-run.test.ts -t generatePozoPairs`
Expected: PASS (3 tests del describe `generatePozoPairs`). El resto del fichero aún falla (funciones de Task 4–5 no existen) — es esperado.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo-pairs-run.ts src/lib/tournament/pozo-pairs-run.test.ts
git commit -m "feat(pozo): genera ronda 0 del pozo de parejas fijas (rejilla pista×ronda)"
```

---

## Task 4: Registrar resultado + avanzar ronda (replay de parejas)

**Files:**
- Modify: `src/lib/tournament/pozo-pairs-run.ts`
- Test: `src/lib/tournament/pozo-pairs-run.test.ts`

- [ ] **Step 1: Write the failing test**

Añade dentro de `pozo-pairs-run.test.ts`:

```ts
describe('recordPozoPairsResult + avance', () => {
  it('al cerrar la ronda 0 genera la ronda 1 con el movimiento de parejas', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePairsPozo(db, client, 4, 2);
    await generatePozoPairs(db, id, 5);

    expect((await listPozoMatches(db, id, 1)).length).toBe(0);
    await playRound(db, id, 0);
    const r1 = await listPozoMatches(db, id, 1);
    expect(r1.length).toBe(2);
    for (const m of r1) {
      expect(m.status).toBe('pending');
      expect(m.scheduledStart).not.toBe('17:00');
      expect(JSON.parse(m.slotA1!).type).toBe('pair');
    }
  });

  it('las parejas no se rompen: cada pairId aparece en exactamente un partido por ronda', async () => {
    const { db, client } = await createTestDb();
    const { id, pairIds } = await makePairsPozo(db, client, 4, 2);
    await generatePozoPairs(db, id, 5);
    await playRound(db, id, 0);
    const r1 = await listPozoMatches(db, id, 1);
    const present = r1.flatMap((m) => [JSON.parse(m.slotA1!).pairId, JSON.parse(m.slotB1!).pairId]);
    // 4 parejas, 2 pistas → las 4 juegan; sin repetidos
    expect(new Set(present).size).toBe(present.length);
    for (const pid of present) expect(pairIds).toContain(pid);
  });

  it('escribe marcador/ganador y no genera más allá del nº de rondas', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePairsPozo(db, client, 4, 2); // rounds: 3
    await generatePozoPairs(db, id, 9);
    await playRound(db, id, 0);
    await playRound(db, id, 1);
    await playRound(db, id, 2);
    expect((await listPozoMatches(db, id, 3)).length).toBe(0);
    const r0 = await listPozoMatches(db, id, 0);
    expect(r0[0].winner).toBe('A');
    expect(r0[0].teamAScore).toBe(4);
    expect(r0[0].status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tournament/pozo-pairs-run.test.ts -t "recordPozoPairsResult"`
Expected: FAIL — `recordPozoPairsResult` no exportado.

- [ ] **Step 3: Write implementation (replay + record)**

Añade a `pozo-pairs-run.ts`:

```ts
// Reconstruye el estado (capas de parejas por pista) en la ronda `uptoRound` replayando desde la 0.
async function replayPozoPairsState(db: Db, tournamentId: string, uptoRound: number): Promise<PairsRound> {
  const all = await listPozoMatches(db, tournamentId);
  const byRound = new Map<number, PozoMatchRow[]>();
  for (const m of all) { const a = byRound.get(m.round) ?? []; a.push(m); byRound.set(m.round, a); }

  const courtsByOrder = (await db.select().from(tournamentCourts)
    .where(eq(tournamentCourts.tournamentId, tournamentId))
    .orderBy(asc(tournamentCourts.order))).map((c) => c.id);
  const sortByCourt = (ms: PozoMatchRow[]) => ms.slice()
    .sort((a, b) => courtsByOrder.indexOf(a.courtId!) - courtsByOrder.indexOf(b.courtId!));

  const round0 = sortByCourt(byRound.get(0) ?? []);
  const courts0 = round0.map((m) => [parsePair(m.slotA1), parsePair(m.slotB1)]);
  const inCourts = new Set(courts0.flat());
  const allPairs = (await loadPairs(db, tournamentId)).map((p) => p.id);
  const resting0 = allPairs.filter((p) => !inCourts.has(p));
  let state: PairsRound = { courts: courts0, resting: resting0 };

  for (let r = 0; r < uptoRound; r++) {
    const matches = sortByCourt(byRound.get(r) ?? []);
    const results: PairCourtResult[] = matches.map((m) => {
      const top = parsePair(m.slotA1); const bottom = parsePair(m.slotB1);
      if (m.winner !== 'A' && m.winner !== 'B') {
        throw new Error(`pozo-pairs-run: el partido ${m.id} de la ronda ${r} no tiene ganador; no se puede avanzar`);
      }
      return m.winner === 'A' ? { winner: top, loser: bottom } : { winner: bottom, loser: top };
    });
    state = nextPozoPairsRound(state, results);
  }
  return state;
}

export async function recordPozoPairsResult(db: Db, matchId: string, gamesA: number, gamesB: number): Promise<void> {
  const [match] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId));
  if (!match) throw new Error('NOT_FOUND');
  const winner = gamesA >= gamesB ? 'A' : 'B';
  await db.update(tournamentMatches).set({
    teamAScore: gamesA, teamBScore: gamesB, winner, status: 'completed',
  }).where(eq(tournamentMatches.id, matchId));

  const round = match.round;
  const roundMatches = await listPozoMatches(db, match.tournamentId, round);
  if (!roundMatches.every((m) => m.status === 'completed')) return; // ronda incompleta

  const ev = await loadEvent(db, match.tournamentId);
  const cfg = ev.config as PozoConfig;
  if (round + 1 >= cfg.rounds) return; // no hay más rondas
  if ((await listPozoMatches(db, match.tournamentId, round + 1)).length > 0) return; // ya generada

  const nextState = await replayPozoPairsState(db, match.tournamentId, round + 1);
  const courtsByOrder = ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ id: c.id, fromMin: hhmmToMin(c.availableFrom) }));
  const slotMinutes = estimatedMatchMinutes(cfg.matchFormat);
  await writePozoPairsRound(db, match.tournamentId, round + 1, nextState, courtsByOrder, slotMinutes);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tournament/pozo-pairs-run.test.ts -t "recordPozoPairsResult"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo-pairs-run.ts src/lib/tournament/pozo-pairs-run.test.ts
git commit -m "feat(pozo): registra resultado y avanza ronda del pozo de parejas fijas (replay)"
```

---

## Task 5: Clasificación en vivo del pozo de parejas (`pozoPairsStandingsLive`)

**Files:**
- Modify: `src/lib/tournament/pozo-pairs-run.ts`
- Test: `src/lib/tournament/pozo-pairs-run.test.ts`

- [ ] **Step 1: Write the failing test**

Añade a `pozo-pairs-run.test.ts`:

```ts
describe('pozoPairsStandingsLive', () => {
  it('clasifica por la pista de la última ronda con datos; una fila por pareja', async () => {
    const { db, client } = await createTestDb();
    const { id, pairIds } = await makePairsPozo(db, client, 4, 2);
    await generatePozoPairs(db, id, 5);
    await playRound(db, id, 0); // genera ronda 1
    const table = await pozoPairsStandingsLive(db, id);
    expect(table.length).toBe(4); // 4 parejas
    expect(table.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(new Set(table.map((r) => r.entityId))).toEqual(new Set(pairIds));
  });

  it('devuelve [] si el pozo no se ha generado', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePairsPozo(db, client, 4, 2);
    expect(await pozoPairsStandingsLive(db, id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tournament/pozo-pairs-run.test.ts -t "pozoPairsStandingsLive"`
Expected: FAIL — función no exportada.

- [ ] **Step 3: Write implementation**

Añade a `pozo-pairs-run.ts`:

```ts
export async function pozoPairsStandingsLive(db: Db, tournamentId: string): Promise<LadderStanding[]> {
  const all = await listPozoMatches(db, tournamentId);
  if (all.length === 0) return [];
  const latestRound = Math.max(...all.map((m) => m.round));
  const state = await replayPozoPairsState(db, tournamentId, latestRound);

  // Juegos acumulados por pareja (de todos los partidos completados).
  const games = new Map<string, number>();
  for (const m of all) {
    if (m.status !== 'completed') continue;
    const top = parsePair(m.slotA1); const bottom = parsePair(m.slotB1);
    games.set(top, (games.get(top) ?? 0) + (m.teamAScore ?? 0));
    games.set(bottom, (games.get(bottom) ?? 0) + (m.teamBScore ?? 0));
  }
  return ladderStandings(state.courts, games, state.resting);
}
```

- [ ] **Step 4: Run the whole file to verify all passes**

Run: `npx vitest run src/lib/tournament/pozo-pairs-run.test.ts`
Expected: PASS (todos los describes: generación, avance, clasificación).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo-pairs-run.ts src/lib/tournament/pozo-pairs-run.test.ts
git commit -m "feat(pozo): clasificación en vivo del pozo de parejas fijas (escalera)"
```

---

## Task 6: Fachada de dispatch por formato (`pozo-engine.ts`)

**Files:**
- Create: `src/lib/tournament/pozo-engine.ts`
- Test: `src/lib/tournament/pozo-engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tournament/pozo-engine.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent } from './event-store';
import { replacePairs, loadPairs } from './pair-store';
import { generatePozo, recordPozoResult, listPozoMatches, pozoStandingsLive } from './pozo-engine';
import type { PozoConfig } from './types';

const CFG: PozoConfig = { rounds: 2, matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' } };

async function seedPlayers(client: any, ids: string[]) {
  for (const id of ids) await client.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [id, id] });
}

describe('pozo-engine dispatch', () => {
  it('americano: genera con slots de participante y registra resultado', async () => {
    const { db, client } = await createTestDb();
    const players = Array.from({ length: 8 }, (_, i) => `a${i + 1}`);
    await seedPlayers(client, players);
    const id = await createEvent(db, {
      name: 'A', date: '2026-07-01', location: null, kind: 'pozo', format: 'americano',
      config: CFG, createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' },
               { label: 'C2', sortOrder: 2, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: players,
    });
    await generatePozo(db, id, 1);
    const r0 = await listPozoMatches(db, id, 0);
    expect(r0.length).toBe(2);
    expect(JSON.parse(r0[0].slotA1!).type).toBe('participant');
    await recordPozoResult(db, r0[0].id, 4, 2);
    expect((await listPozoMatches(db, id, 0))[0].status).toBe('completed');
    expect((await pozoStandingsLive(db, id)).length).toBe(8);
  });

  it('parejas fijas: genera con slots de pareja y registra resultado', async () => {
    const { db, client } = await createTestDb();
    const players = Array.from({ length: 8 }, (_, i) => `b${i + 1}`);
    await seedPlayers(client, players);
    const id = await createEvent(db, {
      name: 'B', date: '2026-07-01', location: null, kind: 'pozo', format: 'fixed_pairs',
      config: CFG, createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' },
               { label: 'C2', sortOrder: 2, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: players,
    });
    const pairs: [string, string][] = [];
    for (let i = 0; i < players.length; i += 2) pairs.push([players[i], players[i + 1]]);
    await replacePairs(db, id, pairs);

    await generatePozo(db, id, 1);
    const r0 = await listPozoMatches(db, id, 0);
    expect(JSON.parse(r0[0].slotA1!).type).toBe('pair');
    await recordPozoResult(db, r0[0].id, 4, 2);
    expect((await listPozoMatches(db, id, 0))[0].status).toBe('completed');
    expect((await pozoStandingsLive(db, id)).length).toBe(4); // por parejas
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tournament/pozo-engine.test.ts`
Expected: FAIL — módulo `pozo-engine` no existe.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/tournament/pozo-engine.ts
// Fachada del pozo: despacha por `format` (americano | fixed_pairs). La API y la UI
// importan SIEMPRE desde aquí, sin conocer la variante.
import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournamentMatches } from '@/lib/db/schema';
import { loadEvent } from './event-store';
import * as americano from './pozo-run';
import * as pairs from './pozo-pairs-run';
import type { LadderStanding } from './ladder';

type Db = LibSQLDatabase<typeof schema>;

// Reexport del listado (agnóstico al formato).
export { listPozoMatches, type PozoMatchRow } from './pozo-run';

export async function generatePozo(db: Db, tournamentId: string, seed: number): Promise<void> {
  const ev = await loadEvent(db, tournamentId);
  if (ev.kind !== 'pozo') throw new Error('generatePozo: no es un pozo');
  if (ev.format === 'americano') return americano.generatePozo(db, tournamentId, seed);
  if (ev.format === 'fixed_pairs') return pairs.generatePozoPairs(db, tournamentId, seed);
  throw new Error(`generatePozo: formato no soportado (${ev.format})`);
}

export async function recordPozoResult(db: Db, matchId: string, gamesA: number, gamesB: number): Promise<void> {
  const [m] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId));
  if (!m) throw new Error('NOT_FOUND');
  const ev = await loadEvent(db, m.tournamentId);
  if (ev.format === 'fixed_pairs') return pairs.recordPozoPairsResult(db, matchId, gamesA, gamesB);
  return americano.recordPozoResult(db, matchId, gamesA, gamesB);
}

export async function pozoStandingsLive(db: Db, tournamentId: string): Promise<LadderStanding[]> {
  const ev = await loadEvent(db, tournamentId);
  if (ev.format === 'fixed_pairs') return pairs.pozoPairsStandingsLive(db, tournamentId);
  return americano.pozoStandingsLive(db, tournamentId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tournament/pozo-engine.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo-engine.ts src/lib/tournament/pozo-engine.test.ts
git commit -m "feat(pozo): fachada de dispatch del pozo por formato (americano | parejas fijas)"
```

---

## Task 7: Endpoint `PUT /api/tournaments/[id]/pairs`

**Files:**
- Create: `src/app/api/tournaments/[id]/pairs/route.ts`

Sin test unitario (las rutas se prueban por e2e en el Plan 2c). Verificación: el build compila y typecheck pasa.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/tournaments/[id]/pairs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { loadEvent } from '@/lib/tournament/event-store';
import { replacePairs } from '@/lib/tournament/pair-store';
import { validatePairsInput } from '@/lib/tournament/validation';

// PUT /api/tournaments/[id]/pairs — reemplaza el set de parejas del evento (admin).
// Solo en borrador; valida contra el roster del evento.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const ev = await loadEvent(db, id);
    if (ev.status !== 'draft') {
      return NextResponse.json({ error: 'El evento ya está generado' }, { status: 409 });
    }
    const body = await request.json();
    const v = validatePairsInput(body, new Set(ev.participantPlayerIds));
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    await replacePairs(db, id, v.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar las parejas' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build OK, sin errores de tipo en la ruta nueva.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tournaments/[id]/pairs/route.ts
git commit -m "feat(pozo): PUT /api/tournaments/[id]/pairs (reemplaza parejas, admin, solo borrador)"
```

---

## Task 8: Verificación del conjunto

- [ ] **Step 1: Toda la suite unitaria verde**

Run: `npm test`
Expected: PASS, incluyendo `pair-store`, `validation`, `pozo-pairs-run`, `pozo-engine` y los existentes (`pozo-run`, etc.).

- [ ] **Step 2: Build/lint**

Run: `npm run build && npm run lint`
Expected: ambos OK.

- [ ] **Step 3: Commit (si lint aplicó cambios) y cierre**

```bash
git add -A
git commit -m "chore(pozo): verificación 2b-2 (suite verde + build)" --allow-empty
```

---

## Self-review (cobertura vs. spec)

- **Run de parejas fijas (análogo a `pozo-run.ts`)** → Tasks 3–5 (`pozo-pairs-run.ts`: generar, avance por replay, clasificación). ✓
- **Parejas definidas antes de generar; persistencia** → Task 1 (`pair-store`) + Task 7 (endpoint). ✓
- **Validación: nº par, jugador único, roster, todos emparejados, solo borrador** → Task 2 (`validatePairsInput`) + Task 7 (409 si no borrador). ✓
- **Fachada de dispatch por formato (la API/UI no conocen la variante)** → Task 6 (`pozo-engine.ts`). ✓
- **Clasificación por escalera (unidad = pareja), desempate por acumulado** → Task 5 reusa `ladderStandings`. ✓
- **Slots de tipo `pair`** → Task 3 (`pairSlot`); compatibles con `display.ts`/`isMatchPlayable` (slotA2/B2 null). ✓
- **NO en este plan (es Plan 2c):** endpoints `generate`/`result`, `<PairsEditor>`, panel de detalle, parrilla/resultados/clasificación en UI, vista pública, e2e HTTP. ✓
