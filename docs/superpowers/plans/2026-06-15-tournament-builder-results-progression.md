# Plan 5 — Constructor de torneos: resultados y progresión

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar el resultado de un partido y hacer avanzar el torneo en consecuencia: rellenar las rondas TBD del pozo, resolver los clasificados de grupos en el cuadro, propagar ganadores por el cuadro, y exponer las clasificaciones calculadas.

**Architecture:** Capa de orquestación en DB sobre el motor puro ya existente (Planes 2–3). Un módulo nuevo `src/lib/tournament/results.ts` con `recordResult` (escribe el marcador + dispara la progresión según la fase del partido) y los helpers de progresión (`advancePozoRound`, `resolveGroupQualifiers`, `propagateBracket`) más las lecturas de clasificación (`getPozoStandings`, `getGroupStandings`). Todo se testea contra el harness libSQL en memoria (`createTestDb`) ya usado en `store.test.ts`. No se tocan rutas HTTP ni UI (eso es Plan 6); no se toca `generate.ts`/`store.ts` salvo lectura.

**Tech Stack:** TypeScript, Drizzle ORM (libSQL), Vitest. Motor puro: `pozo.ts` (`seedPozoCourts`, `courtPairing`, `nextPozoRoundWithRest`, `pozoStandings`), `fixed-pairs.ts` (`groupStandings`, `resolveBracket`).

---

## Contexto del modelo (cómo está la parrilla tras el Plan 4)

- **Pozo**: una fila por (pista, ronda). Ronda 0 con slots `participant` concretos; rondas >0 con los 4 slots a SQL `NULL` (TBD). `phaseTag = 'pozo'`. Hay exactamente `numCourts` partidos por ronda; los que descansan no tienen fila.
- **Liguilla (grupos)**: `phaseTag = 'group:<nombre>'`. `slotA1`/`slotB1` son `pair`; `slotA2`/`slotB2` `NULL`.
- **Cuadro (KO)**: `phaseTag = 'ko:r<n>'`. En ronda 0 los slots son `pair` (cuadro directo sin grupos), `placeholder` (`"1º A"`, clasificados de grupo aún desconocidos) o `bye`. En rondas siguientes son `matchWinner` con el **UUID real** del partido previo (ya remapeado en `generateAndStore`).
- Columnas de resultado vacías: `teamAScore`, `teamBScore`, `setsJson`, `winner` a `null`; `status = 'pending'`.

**Tipos del motor que se reutilizan** (ya exportados): `PozoRound`, `CourtResult`, `PozoMatchResult`, `PozoStanding` en `pozo.ts`; `PairMatchResult`, `GroupStanding`, `BracketMatch` en `fixed-pairs.ts`. `SlotRef` en `types.ts`.

**Campos Drizzle** (confirmados en `src/lib/db/schema.ts`): `tournamentMatches.{id,tournamentId,blockId,courtId,round,phaseTag,status,slotA1,slotA2,slotB1,slotB2,teamAScore,teamBScore,setsJson,winner}`, `tournamentCourts.{id,order}`, `tournamentBlocks.{id,tournamentId,config}`, `tournamentGroups.{id,blockId,name}`, `tournamentPairs.{id,blockId,groupId}`.

---

## File Structure

- **Create:** `src/lib/tournament/results.ts` — `recordResult` + helpers de progresión + lecturas de clasificación.
- **Create:** `src/lib/tournament/results.test.ts` — tests contra `createTestDb`.
- **No se modifica** `store.ts`, `generate.ts`, `pozo.ts`, `fixed-pairs.ts` (solo se importan).

---

## Task 1: `recordResult` — escribir marcador + validación de slots resueltos

**Files:**
- Create: `src/lib/tournament/results.ts`
- Test: `src/lib/tournament/results.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/tournament/results.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from './test-db';
import { tournamentMatches } from '@/lib/db/schema';
import { recordResult } from './results';

// Inserta un partido suelto con los slots dados. Devuelve el id.
async function insertMatch(
  db: Awaited<ReturnType<typeof createTestDb>>,
  fields: Partial<typeof tournamentMatches.$inferInsert> = {},
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(tournamentMatches).values({
    id,
    tournamentId: 't1',
    blockId: 'b1',
    round: 0,
    phaseTag: 'group:A',
    status: 'pending',
    slotA1: JSON.stringify({ type: 'pair', pairId: 'pA' }),
    slotB1: JSON.stringify({ type: 'pair', pairId: 'pB' }),
    ...fields,
  });
  return id;
}

describe('recordResult', () => {
  it('escribe marcador, deriva el ganador y marca completed', async () => {
    const db = await createTestDb();
    const id = await insertMatch(db);

    await recordResult(db, id, { teamAScore: 6, teamBScore: 3 });

    const [m] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, id));
    expect(m.teamAScore).toBe(6);
    expect(m.teamBScore).toBe(3);
    expect(m.winner).toBe('A');
    expect(m.status).toBe('completed');
  });

  it('respeta el ganador explícito (formato a tiempo con empate en juegos)', async () => {
    const db = await createTestDb();
    const id = await insertMatch(db);
    await recordResult(db, id, { teamAScore: 5, teamBScore: 5, winner: 'B' });
    const [m] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, id));
    expect(m.winner).toBe('B');
  });

  it('rechaza si un slot sigue sin resolver (placeholder)', async () => {
    const db = await createTestDb();
    const id = await insertMatch(db, {
      phaseTag: 'ko:r0',
      slotA1: JSON.stringify({ type: 'placeholder', desc: '1º A' }),
      slotB1: JSON.stringify({ type: 'pair', pairId: 'pB' }),
    });
    await expect(recordResult(db, id, { teamAScore: 6, teamBScore: 0 }))
      .rejects.toThrow(/sin resolver/);
  });

  it('rechaza si una ronda de pozo aún está vacía (slots NULL)', async () => {
    const db = await createTestDb();
    const id = await insertMatch(db, {
      phaseTag: 'pozo', round: 1,
      slotA1: null, slotA2: null, slotB1: null, slotB2: null,
    });
    await expect(recordResult(db, id, { teamAScore: 6, teamBScore: 0 }))
      .rejects.toThrow(/sin resolver/);
  });

  it('lanza si el partido no existe', async () => {
    const db = await createTestDb();
    await expect(recordResult(db, 'nope', { teamAScore: 1, teamBScore: 0 }))
      .rejects.toThrow(/no encontrado/);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/results.test.ts`
Expected: FAIL — `recordResult` no existe (no se puede importar desde `./results`).

- [ ] **Step 3: Crear `src/lib/tournament/results.ts` con `recordResult` + helpers base**

```ts
import { and, eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import {
  tournamentMatches, tournamentCourts, tournamentBlocks,
  tournamentGroups, tournamentPairs,
} from '@/lib/db/schema';
import type { SlotRef } from './types';
import {
  seedPozoCourts, courtPairing, nextPozoRoundWithRest, pozoStandings,
  type PozoRound, type CourtResult, type PozoMatchResult, type PozoStanding,
} from './pozo';
import {
  groupStandings, resolveBracket,
  type PairMatchResult, type GroupStanding, type BracketMatch,
} from './fixed-pairs';

type Db = LibSQLDatabase<typeof schema>;

function parseSlot(raw: string | null): SlotRef | null {
  return raw ? (JSON.parse(raw) as SlotRef) : null;
}

// Un slot está resuelto si referencia a un participante/pareja concretos (o es un bye).
// placeholder/matchWinner y null (ronda TBD del pozo) no están resueltos.
function isResolved(slot: SlotRef | null): boolean {
  return !!slot && (slot.type === 'participant' || slot.type === 'pair' || slot.type === 'bye');
}

// El partido es jugable si ambos equipos tienen su hueco principal resuelto y ningún
// hueco presente está sin resolver. slotA2/slotB2 a null es válido (partidos de pareja).
function matchReady(a1: SlotRef | null, a2: SlotRef | null, b1: SlotRef | null, b2: SlotRef | null): boolean {
  if (!isResolved(a1) || !isResolved(b1)) return false;
  if (a2 && !isResolved(a2)) return false;
  if (b2 && !isResolved(b2)) return false;
  return true;
}

export interface MatchResultInput {
  teamAScore: number;
  teamBScore: number;
  winner?: 'A' | 'B' | null;   // por defecto se deriva del marcador
  setsJson?: string | null;
}

// Registra el resultado de un partido y dispara la progresión de su fase.
export async function recordResult(db: Db, matchId: string, input: MatchResultInput): Promise<void> {
  const [match] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId));
  if (!match) throw new Error(`Partido no encontrado: ${matchId}`);

  const a1 = parseSlot(match.slotA1), a2 = parseSlot(match.slotA2);
  const b1 = parseSlot(match.slotB1), b2 = parseSlot(match.slotB2);
  if (!matchReady(a1, a2, b1, b2)) {
    throw new Error(`No se puede registrar resultado: el partido ${matchId} tiene participantes sin resolver`);
  }

  const winner = input.winner !== undefined
    ? input.winner
    : input.teamAScore > input.teamBScore ? 'A'
      : input.teamBScore > input.teamAScore ? 'B'
        : null;

  await db.update(tournamentMatches).set({
    teamAScore: input.teamAScore,
    teamBScore: input.teamBScore,
    winner,
    setsJson: input.setsJson ?? null,
    status: 'completed',
  }).where(eq(tournamentMatches.id, matchId));

  const tag = match.phaseTag ?? '';
  if (tag === 'pozo') {
    await advancePozoRound(db, match.blockId);
  } else if (tag.startsWith('group:')) {
    await resolveGroupQualifiers(db, match.blockId);
  } else if (tag.startsWith('ko')) {
    await propagateBracket(db, match.blockId);
  }
}

// --- Stubs rellenados en tareas posteriores (se importan ya para que recordResult compile) ---
async function advancePozoRound(_db: Db, _blockId: string): Promise<void> { /* Task 2 */ }
async function resolveGroupQualifiers(_db: Db, _blockId: string): Promise<void> { /* Task 3 */ }
async function propagateBracket(_db: Db, _blockId: string): Promise<void> { /* Task 4 */ }
```

> Nota: los stubs `async` con cuerpo vacío disparan el aviso de lint `no-unused-vars` por los
> parámetros. Se prefijan con `_` para silenciarlo y se rellenan en las tareas 2–4. `pozoStandings`,
> `groupStandings`, `resolveBracket` y sus tipos se importan ya aquí porque las tareas siguientes los
> usan; si el lint se queja de imports sin usar en este commit intermedio, está bien — se resuelve en
> la Task 5 (que añade las lecturas). Si prefieres un árbol siempre limpio, añade los imports en la
> tarea donde primero se usen.

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/results.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/results.ts src/lib/tournament/results.test.ts
git commit -m "feat(tournaments): recordResult escribe marcador y valida slots resueltos"
```

---

## Task 2: Progresión del pozo — rellenar la ronda siguiente al cerrar la actual

**Files:**
- Modify: `src/lib/tournament/results.ts` (rellenar `advancePozoRound`)
- Test: `src/lib/tournament/results.test.ts`

**Diseño:** se reconstruye el estado del pozo replayando desde la ronda 0 con `seedPozoCourts` + `nextPozoRoundWithRest`. Para cada ronda completada en orden se construye `CourtResult[]` (ganadores/perdedores por pista, ordenadas por `tournamentCourts.order`) y se avanza el estado; tras cada avance, si la ronda siguiente existe y sigue vacía (slots `null`), se rellena con `courtPairing(occupants, nextRound)`. Idempotente: cada llamada recalcula desde cero y solo escribe rondas aún vacías.

- [ ] **Step 1: Escribir el test que falla**

Añade a `src/lib/tournament/results.test.ts`:

```ts
import { createTournament, generateAndStore } from './store';
import { tournaments } from '@/lib/db/schema';

describe('recordResult — progresión del pozo', () => {
  it('al cerrar la ronda 0 (2 pistas) rellena la ronda 1 con el movimiento', async () => {
    // 8 jugadores, 2 pistas → 2 partidos por ronda. roundMinutes=15, 90 min → 6 rondas.
    const db = await createTestDb();
    const id = await createTournament(db, {
      name: 'Pozo', date: '2026-06-15',
      courts: [
        { label: 'P1', order: 1, availableFrom: '17:00', availableTo: '20:00' },
        { label: 'P2', order: 2, availableFrom: '17:00', availableTo: '20:00' },
      ],
      participantPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
      blocks: [{
        order: 1, type: 'pozo', name: 'Pozo', durationMinutes: 90,
        config: {
          matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' },
          bufferMinutes: 0, roundMinutes: 15,
          participantOrder: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
        },
      }],
    });
    await generateAndStore(db, id);

    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const courts = await db.select().from(tournamentCourts).where(eq(tournamentCourts.tournamentId, id));
    const orderOf = new Map(courts.map((c) => [c.id, c.order]));
    const r0 = all.filter((m) => m.round === 0).sort((a, b) => orderOf.get(a.courtId!)! - orderOf.get(b.courtId!)!);
    expect(r0).toHaveLength(2);

    // Ronda 1 está vacía antes de cerrar la 0.
    const r1before = all.filter((m) => m.round === 1);
    expect(r1before.every((m) => m.slotA1 === null)).toBe(true);

    // Pista top (order 1): gana A. Pista 2 (order 2): gana A.
    // courtPairing(seed,0) usa el patrón [[0,1],[2,3]]:
    //   Pista 1 = [p1,p2,p3,p4] → A=[p1,p2] B=[p3,p4]; gana A → suben p3,p4? No: ganan p1,p2.
    //   En el top, los ganadores (p1,p2) se quedan; los perdedores (p3,p4) bajan a pista 2.
    //   Pista 2 = [p5,p6,p7,p8] → A=[p5,p6] B=[p7,p8]; gana A (p5,p6) → suben a pista 1.
    //   Pista 2 (fondo) recibe a p3,p4 (bajan) y se quedan p7,p8 (perdedores del fondo).
    await recordResult(db, r0[0].id, { teamAScore: 6, teamBScore: 2 }); // gana A en pista 1
    await recordResult(db, r0[1].id, { teamAScore: 6, teamBScore: 1 }); // gana A en pista 2

    const after = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const r1 = after.filter((m) => m.round === 1).sort((a, b) => orderOf.get(a.courtId!)! - orderOf.get(b.courtId!)!);

    // La ronda 1 ya no está vacía y todos los slots son participantes concretos.
    for (const m of r1) {
      for (const col of ['slotA1', 'slotA2', 'slotB1', 'slotB2'] as const) {
        expect(m[col]).not.toBeNull();
        expect(JSON.parse(m[col]!).type).toBe('participant');
      }
    }

    // Pista top (order 1) en ronda 1 contiene exactamente {p1,p2 (se quedan), p5,p6 (suben)}.
    const topPlayers = new Set(
      ['slotA1', 'slotA2', 'slotB1', 'slotB2'].map((c) => JSON.parse((r1[0] as any)[c]).participantId),
    );
    expect(topPlayers).toEqual(new Set(['p1', 'p2', 'p5', 'p6']));

    // Pista fondo (order 2) en ronda 1 contiene {p3,p4 (bajan), p7,p8 (se quedan)}.
    const bottomPlayers = new Set(
      ['slotA1', 'slotA2', 'slotB1', 'slotB2'].map((c) => JSON.parse((r1[1] as any)[c]).participantId),
    );
    expect(bottomPlayers).toEqual(new Set(['p3', 'p4', 'p7', 'p8']));

    // La ronda 2 sigue vacía (solo se rellena una ronda por delante).
    expect(after.filter((m) => m.round === 2).every((m) => m.slotA1 === null)).toBe(true);
  });

  it('no rellena la ronda siguiente si la actual no está cerrada del todo', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, {
      name: 'Pozo', date: '2026-06-15',
      courts: [
        { label: 'P1', order: 1, availableFrom: '17:00', availableTo: '20:00' },
        { label: 'P2', order: 2, availableFrom: '17:00', availableTo: '20:00' },
      ],
      participantPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
      blocks: [{
        order: 1, type: 'pozo', name: 'Pozo', durationMinutes: 90,
        config: {
          matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' },
          bufferMinutes: 0, roundMinutes: 15,
          participantOrder: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
        },
      }],
    });
    await generateAndStore(db, id);
    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const r0 = all.filter((m) => m.round === 0);

    await recordResult(db, r0[0].id, { teamAScore: 6, teamBScore: 2 }); // solo 1 de las 2 pistas

    const after = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    expect(after.filter((m) => m.round === 1).every((m) => m.slotA1 === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/results.test.ts -t "progresión del pozo"`
Expected: FAIL — la ronda 1 sigue con slots `null` (el stub no hace nada).

- [ ] **Step 3: Rellenar `advancePozoRound`**

Reemplaza el stub `async function advancePozoRound(...)` por:

```ts
async function advancePozoRound(db: Db, blockId: string): Promise<void> {
  const [block] = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.id, blockId));
  if (!block) return;
  const config = JSON.parse(block.config) as { participantOrder?: string[] };
  const participantIds = config.participantOrder ?? [];

  const matches = await db.select().from(tournamentMatches)
    .where(and(eq(tournamentMatches.blockId, blockId), eq(tournamentMatches.phaseTag, 'pozo')));
  if (matches.length === 0) return;

  const courts = await db.select().from(tournamentCourts)
    .where(eq(tournamentCourts.tournamentId, block.tournamentId));
  const orderOf = new Map(courts.map((c) => [c.id, c.order]));
  const sortByCourt = (arr: typeof matches) =>
    [...arr].sort((a, b) => (orderOf.get(a.courtId ?? '') ?? 0) - (orderOf.get(b.courtId ?? '') ?? 0));

  const byRound = new Map<number, typeof matches>();
  for (const m of matches) {
    const arr = byRound.get(m.round) ?? [];
    arr.push(m);
    byRound.set(m.round, arr);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  const numCourts = (byRound.get(0) ?? []).length;
  if (numCourts === 0) return;

  // Estado en la ronda 0; se va avanzando ronda a ronda.
  let state: PozoRound = seedPozoCourts(participantIds, numCourts);

  for (const round of rounds) {
    const roundMatches = sortByCourt(byRound.get(round) ?? []);
    const closed = roundMatches.length === numCourts
      && roundMatches.every((m) => m.status === 'completed' && (m.winner === 'A' || m.winner === 'B'));
    if (!closed) return; // ronda no cerrada → no hay nada más que propagar

    const results: CourtResult[] = roundMatches.map((m) => {
      const a1 = (parseSlot(m.slotA1) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const a2 = (parseSlot(m.slotA2) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const b1 = (parseSlot(m.slotB1) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const b2 = (parseSlot(m.slotB2) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const winners: [string, string] = m.winner === 'A' ? [a1, a2] : [b1, b2];
      const losers: [string, string] = m.winner === 'A' ? [b1, b2] : [a1, a2];
      return { winners, losers };
    });

    const nextState = nextPozoRoundWithRest(state, results);
    const nextRound = round + 1;
    const nextMatches = sortByCourt(byRound.get(nextRound) ?? []);

    // Solo rellena si la ronda siguiente existe y aún está vacía (idempotencia).
    if (nextMatches.length > 0 && nextMatches.every((m) => m.slotA1 === null)) {
      for (let courtIdx = 0; courtIdx < nextMatches.length; courtIdx++) {
        const occupants = nextState.courts[courtIdx];
        if (!occupants || occupants.length < 4) continue;
        const { teamA, teamB } = courtPairing(occupants, nextRound);
        await db.update(tournamentMatches).set({
          slotA1: JSON.stringify({ type: 'participant', participantId: teamA[0] }),
          slotA2: JSON.stringify({ type: 'participant', participantId: teamA[1] }),
          slotB1: JSON.stringify({ type: 'participant', participantId: teamB[0] }),
          slotB2: JSON.stringify({ type: 'participant', participantId: teamB[1] }),
        }).where(eq(tournamentMatches.id, nextMatches[courtIdx].id));
      }
    }

    state = nextState;
  }
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/results.test.ts`
Expected: PASS (los 5 de la Task 1 + 2 nuevos = 7).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/results.ts src/lib/tournament/results.test.ts
git commit -m "feat(tournaments): progresión del pozo rellena la ronda siguiente"
```

---

## Task 3: Resolver clasificados de grupo en el cuadro

**Files:**
- Modify: `src/lib/tournament/results.ts` (rellenar `resolveGroupQualifiers`)
- Test: `src/lib/tournament/results.test.ts`

**Diseño:** cuando todos los partidos de liguilla del bloque están cerrados, se calcula `groupStandings` por grupo, se toman los `advancePerGroup` primeros, se construye un mapa `"<pos>º <grupo>" → pairId` (mismas etiquetas que `qualifierSeeds`) y se sustituyen los slots `placeholder` de los partidos de cuadro por slots `pair`.

- [ ] **Step 1: Escribir el test que falla**

Añade a `src/lib/tournament/results.test.ts`:

```ts
describe('recordResult — clasificados de grupo al cuadro', () => {
  it('al cerrar la liguilla rellena los placeholders del cuadro con los ganadores de grupo', async () => {
    // 2 grupos (A,B) de 2 parejas, advancePerGroup=1, knockout → final con placeholders "1º A"/"1º B".
    const db = await createTestDb();
    const id = await createTournament(db, {
      name: 'KO Groups', date: '2026-06-15',
      courts: [
        { label: 'P1', order: 1, availableFrom: '10:00', availableTo: '14:00' },
        { label: 'P2', order: 2, availableFrom: '10:00', availableTo: '14:00' },
      ],
      participantPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      blocks: [{
        order: 1, type: 'fixed_pairs', name: 'Torneo', durationMinutes: 240,
        config: { matchFormat: { kind: 'timed', minutes: 30, tieRule: 'golden_point' }, bufferMinutes: 5, knockout: true, advancePerGroup: 1 },
        groupNames: ['A', 'B'],
        pairs: [
          { player1Id: 'a', player2Id: 'b', seed: 1, groupName: 'A' },
          { player1Id: 'c', player2Id: 'd', seed: 2, groupName: 'A' },
          { player1Id: 'e', player2Id: 'f', seed: 3, groupName: 'B' },
          { player1Id: 'g', player2Id: 'h', seed: 4, groupName: 'B' },
        ],
      }],
    });
    await generateAndStore(db, id);

    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const groupA = all.find((m) => m.phaseTag === 'group:A')!;
    const groupB = all.find((m) => m.phaseTag === 'group:B')!;

    // pairId ganador de cada grupo (el slot A1 del partido de liguilla).
    const winnerA = JSON.parse(groupA.slotA1!).pairId as string; // gana A en grupo A
    const winnerB = JSON.parse(groupB.slotB1!).pairId as string; // gana B en grupo B

    await recordResult(db, groupA.id, { teamAScore: 6, teamBScore: 1 }); // gana A
    await recordResult(db, groupB.id, { teamAScore: 1, teamBScore: 6 }); // gana B

    const after = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const ko = after.find((m) => (m.phaseTag ?? '').startsWith('ko'))!;
    const slotA = JSON.parse(ko.slotA1!);
    const slotB = JSON.parse(ko.slotB1!);
    expect(slotA).toEqual({ type: 'pair', pairId: winnerA });
    expect(slotB).toEqual({ type: 'pair', pairId: winnerB });
    expect(ko.status).toBe('pending'); // el KO sigue pendiente, solo se resolvieron sus huecos
  });

  it('no resuelve nada mientras quede liguilla sin cerrar', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, {
      name: 'KO Groups', date: '2026-06-15',
      courts: [
        { label: 'P1', order: 1, availableFrom: '10:00', availableTo: '14:00' },
        { label: 'P2', order: 2, availableFrom: '10:00', availableTo: '14:00' },
      ],
      participantPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      blocks: [{
        order: 1, type: 'fixed_pairs', name: 'Torneo', durationMinutes: 240,
        config: { matchFormat: { kind: 'timed', minutes: 30, tieRule: 'golden_point' }, bufferMinutes: 5, knockout: true, advancePerGroup: 1 },
        groupNames: ['A', 'B'],
        pairs: [
          { player1Id: 'a', player2Id: 'b', seed: 1, groupName: 'A' },
          { player1Id: 'c', player2Id: 'd', seed: 2, groupName: 'A' },
          { player1Id: 'e', player2Id: 'f', seed: 3, groupName: 'B' },
          { player1Id: 'g', player2Id: 'h', seed: 4, groupName: 'B' },
        ],
      }],
    });
    await generateAndStore(db, id);
    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const groupA = all.find((m) => m.phaseTag === 'group:A')!;

    await recordResult(db, groupA.id, { teamAScore: 6, teamBScore: 1 }); // falta el grupo B

    const after = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const ko = after.find((m) => (m.phaseTag ?? '').startsWith('ko'))!;
    expect(JSON.parse(ko.slotA1!).type).toBe('placeholder');
    expect(JSON.parse(ko.slotB1!).type).toBe('placeholder');
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/results.test.ts -t "clasificados de grupo"`
Expected: FAIL — los slots del KO siguen siendo `placeholder` (stub vacío).

- [ ] **Step 3: Rellenar `resolveGroupQualifiers`**

Reemplaza el stub `async function resolveGroupQualifiers(...)` por:

```ts
async function resolveGroupQualifiers(db: Db, blockId: string): Promise<void> {
  const [block] = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.id, blockId));
  if (!block) return;
  const config = JSON.parse(block.config) as { advancePerGroup?: number; knockout?: boolean };
  const advancePerGroup = config.advancePerGroup ?? 0;
  if (!config.knockout || advancePerGroup < 1) return;

  const groups = await db.select().from(tournamentGroups).where(eq(tournamentGroups.blockId, blockId));
  if (groups.length === 0) return;
  const pairs = await db.select().from(tournamentPairs).where(eq(tournamentPairs.blockId, blockId));

  const matches = await db.select().from(tournamentMatches).where(eq(tournamentMatches.blockId, blockId));
  const groupMatches = matches.filter((m) => (m.phaseTag ?? '').startsWith('group:'));
  if (groupMatches.length === 0 || groupMatches.some((m) => m.status !== 'completed')) return;

  // "1º A" → pairId clasificado, replicando las etiquetas de qualifierSeeds.
  const descToPair = new Map<string, string>();
  for (const group of groups) {
    const groupPairIds = pairs.filter((p) => p.groupId === group.id).map((p) => p.id);
    const results: PairMatchResult[] = groupMatches
      .filter((m) => m.phaseTag === `group:${group.name}`)
      .map((m) => ({
        pairA: (parseSlot(m.slotA1) as Extract<SlotRef, { type: 'pair' }>).pairId,
        pairB: (parseSlot(m.slotB1) as Extract<SlotRef, { type: 'pair' }>).pairId,
        gamesA: m.teamAScore ?? 0,
        gamesB: m.teamBScore ?? 0,
        winner: (m.winner ?? 'draw') as 'A' | 'B' | 'draw',
      }));
    const standings = groupStandings(groupPairIds, results);
    for (let pos = 1; pos <= advancePerGroup; pos++) {
      const qualifier = standings[pos - 1];
      if (qualifier) descToPair.set(`${pos}º ${group.name}`, qualifier.pairId);
    }
  }

  const koMatches = matches.filter((m) => (m.phaseTag ?? '').startsWith('ko'));
  for (const m of koMatches) {
    const updates: Partial<typeof tournamentMatches.$inferInsert> = {};
    for (const col of ['slotA1', 'slotB1'] as const) {
      const slot = parseSlot(m[col]);
      if (slot && slot.type === 'placeholder') {
        const pairId = descToPair.get(slot.desc);
        if (pairId) updates[col] = JSON.stringify({ type: 'pair', pairId });
      }
    }
    if (Object.keys(updates).length > 0) {
      await db.update(tournamentMatches).set(updates).where(eq(tournamentMatches.id, m.id));
    }
  }
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/results.test.ts`
Expected: PASS (7 + 2 = 9).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/results.ts src/lib/tournament/results.test.ts
git commit -m "feat(tournaments): resuelve clasificados de grupo en el cuadro"
```

---

## Task 4: Propagación del cuadro (ganadores hacia las rondas siguientes)

**Files:**
- Modify: `src/lib/tournament/results.ts` (rellenar `propagateBracket`)
- Test: `src/lib/tournament/results.test.ts`

**Diseño:** se reconstruye el cuadro como `BracketMatch[]` (matchId = UUID del partido, `slotA`/`slotB` de `slotA1`/`slotB1`), se montan los resultados conocidos (`UUID → 'A'|'B'`) y se llama a `resolveBracket`. Para cada partido cuyo `slotA`/`slotB` resuelto pasa de `matchWinner` a `pair`, se reescribe el slot en DB. `resolveBracket` también avanza los `bye` automáticamente.

- [ ] **Step 1: Escribir el test que falla**

Añade a `src/lib/tournament/results.test.ts`:

```ts
describe('recordResult — propagación del cuadro', () => {
  it('cuadro de 4 parejas: las semifinales propagan ganadores a la final', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, {
      name: 'KO', date: '2026-06-15',
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
    await generateAndStore(db, id);

    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const semis = all.filter((m) => m.phaseTag === 'ko:r0').sort((a, b) => a.id.localeCompare(b.id));
    const final = all.find((m) => m.phaseTag === 'ko:r1')!;
    expect(semis).toHaveLength(2);

    // La final referencia a las semis por matchWinner (UUID) antes de jugar nada.
    expect(JSON.parse(final.slotA1!).type).toBe('matchWinner');
    expect(JSON.parse(final.slotB1!).type).toBe('matchWinner');

    // Ganador de cada semi = pareja del slot A1 (gana A).
    const semiWinner = (m: typeof semis[number]) => JSON.parse(m.slotA1!).pairId as string;
    await recordResult(db, semis[0].id, { teamAScore: 6, teamBScore: 4 });
    await recordResult(db, semis[1].id, { teamAScore: 6, teamBScore: 2 });

    const after = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const finalAfter = after.find((m) => m.phaseTag === 'ko:r1')!;
    const expectedPairs = new Set(semis.map(semiWinner));
    const gotPairs = new Set([
      JSON.parse(finalAfter.slotA1!).pairId,
      JSON.parse(finalAfter.slotB1!).pairId,
    ]);
    expect(JSON.parse(finalAfter.slotA1!).type).toBe('pair');
    expect(JSON.parse(finalAfter.slotB1!).type).toBe('pair');
    expect(gotPairs).toEqual(expectedPairs);

    // Ahora se puede cerrar la final (sus slots ya están resueltos).
    await recordResult(db, finalAfter.id, { teamAScore: 6, teamBScore: 3 });
    const [champMatch] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, finalAfter.id));
    expect(champMatch.winner).toBe('A');
    expect(champMatch.status).toBe('completed');
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/results.test.ts -t "propagación del cuadro"`
Expected: FAIL — la final sigue con slots `matchWinner` tras cerrar las semis (stub vacío); además `recordResult` sobre la final lanzaría "sin resolver".

- [ ] **Step 3: Rellenar `propagateBracket`**

Reemplaza el stub `async function propagateBracket(...)` por:

```ts
async function propagateBracket(db: Db, blockId: string): Promise<void> {
  const matches = await db.select().from(tournamentMatches).where(eq(tournamentMatches.blockId, blockId));
  const koMatches = matches.filter((m) => (m.phaseTag ?? '').startsWith('ko'));
  if (koMatches.length === 0) return;

  const bracket: BracketMatch[] = koMatches.map((m) => ({
    matchId: m.id,
    round: m.round,
    slotA: parseSlot(m.slotA1) ?? { type: 'placeholder', desc: '?' },
    slotB: parseSlot(m.slotB1) ?? { type: 'placeholder', desc: '?' },
  }));

  const results = new Map<string, 'A' | 'B'>();
  for (const m of koMatches) {
    if (m.status === 'completed' && (m.winner === 'A' || m.winner === 'B')) {
      results.set(m.id, m.winner);
    }
  }

  const resolved = resolveBracket(bracket, results);
  const byId = new Map(koMatches.map((m) => [m.id, m]));

  for (const r of resolved) {
    const m = byId.get(r.matchId);
    if (!m) continue;
    const updates: Partial<typeof tournamentMatches.$inferInsert> = {};
    if (r.slotA.type === 'pair' && parseSlot(m.slotA1)?.type === 'matchWinner') {
      updates.slotA1 = JSON.stringify(r.slotA);
    }
    if (r.slotB.type === 'pair' && parseSlot(m.slotB1)?.type === 'matchWinner') {
      updates.slotB1 = JSON.stringify(r.slotB);
    }
    if (Object.keys(updates).length > 0) {
      await db.update(tournamentMatches).set(updates).where(eq(tournamentMatches.id, m.id));
    }
  }
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/results.test.ts`
Expected: PASS (9 + 1 = 10).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/results.ts src/lib/tournament/results.test.ts
git commit -m "feat(tournaments): propaga ganadores del cuadro a las rondas siguientes"
```

---

## Task 5: Lecturas de clasificación (`getPozoStandings`, `getGroupStandings`)

**Files:**
- Modify: `src/lib/tournament/results.ts` (añadir funciones exportadas)
- Test: `src/lib/tournament/results.test.ts`

**Diseño:** funciones de lectura que reconstruyen `PozoMatchResult[]`/`PairMatchResult[]` desde los partidos completados y delegan en `pozoStandings`/`groupStandings`. `getGroupStandings` devuelve un mapa `nombreGrupo → GroupStanding[]`.

- [ ] **Step 1: Escribir el test que falla**

Añade a `src/lib/tournament/results.test.ts`:

```ts
import { getPozoStandings, getGroupStandings } from './results';
import { tournamentBlocks } from '@/lib/db/schema';

describe('clasificaciones', () => {
  it('getPozoStandings ordena por juegos y desempata por victorias', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, {
      name: 'Pozo', date: '2026-06-15',
      courts: [{ label: 'P1', order: 1, availableFrom: '17:00', availableTo: '18:00' }],
      participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
      blocks: [{
        order: 1, type: 'pozo', name: 'Pozo', durationMinutes: 30,
        config: {
          matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' },
          bufferMinutes: 0, roundMinutes: 15,
          participantOrder: ['p1', 'p2', 'p3', 'p4'],
        },
      }],
    });
    await generateAndStore(db, id);
    const [block] = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.tournamentId, id));
    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));

    // Ronda 0: [p1,p2] vs [p3,p4] (patrón [[0,1],[2,3]]). Gana A 6-2.
    const r0 = all.find((m) => m.round === 0)!;
    await recordResult(db, r0.id, { teamAScore: 6, teamBScore: 2 });

    const standings = await getPozoStandings(db, block.id);
    expect(standings).toHaveLength(4);
    // p1 y p2 (ganadores) suman 6 juegos; p3,p4 suman 2.
    expect(standings[0].games).toBe(6);
    expect(standings.find((s) => s.participantId === 'p1')!.wins).toBe(1);
    expect(standings.find((s) => s.participantId === 'p3')!.wins).toBe(0);
    expect(standings[0].rank).toBe(1);
  });

  it('getGroupStandings devuelve la tabla por grupo', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, {
      name: 'Grupos', date: '2026-06-15',
      courts: [{ label: 'P1', order: 1, availableFrom: '10:00', availableTo: '14:00' }],
      participantPlayerIds: ['a', 'b', 'c', 'd'],
      blocks: [{
        order: 1, type: 'fixed_pairs', name: 'Liguilla', durationMinutes: 240,
        config: { matchFormat: { kind: 'best_of_3' }, bufferMinutes: 0, knockout: false },
        groupNames: ['A'],
        pairs: [
          { player1Id: 'a', player2Id: 'b', seed: 1, groupName: 'A' },
          { player1Id: 'c', player2Id: 'd', seed: 2, groupName: 'A' },
        ],
      }],
    });
    await generateAndStore(db, id);
    const [block] = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.tournamentId, id));
    const all = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    const match = all.find((m) => m.phaseTag === 'group:A')!;
    const winnerPair = JSON.parse(match.slotA1!).pairId as string;
    await recordResult(db, match.id, { teamAScore: 2, teamBScore: 0 });

    const tables = await getGroupStandings(db, block.id);
    expect(Object.keys(tables)).toEqual(['A']);
    expect(tables.A).toHaveLength(2);
    expect(tables.A[0].pairId).toBe(winnerPair);
    expect(tables.A[0].points).toBe(3);
    expect(tables.A[0].rank).toBe(1);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/results.test.ts -t "clasificaciones"`
Expected: FAIL — `getPozoStandings`/`getGroupStandings` no existen.

- [ ] **Step 3: Añadir las funciones exportadas al final de `results.ts`**

```ts
// Clasificación del pozo del bloque a partir de sus partidos completados.
export async function getPozoStandings(db: Db, blockId: string): Promise<PozoStanding[]> {
  const [block] = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.id, blockId));
  if (!block) return [];
  const config = JSON.parse(block.config) as { participantOrder?: string[] };
  const participantIds = config.participantOrder ?? [];

  const matches = await db.select().from(tournamentMatches)
    .where(and(eq(tournamentMatches.blockId, blockId), eq(tournamentMatches.phaseTag, 'pozo')));

  const results: PozoMatchResult[] = matches
    .filter((m) => m.status === 'completed' && (m.winner === 'A' || m.winner === 'B'))
    .map((m) => {
      const a1 = (parseSlot(m.slotA1) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const a2 = (parseSlot(m.slotA2) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const b1 = (parseSlot(m.slotB1) as Extract<SlotRef, { type: 'participant' }>).participantId;
      const b2 = (parseSlot(m.slotB2) as Extract<SlotRef, { type: 'participant' }>).participantId;
      return {
        teamA: [a1, a2] as [string, string],
        teamB: [b1, b2] as [string, string],
        gamesA: m.teamAScore ?? 0,
        gamesB: m.teamBScore ?? 0,
        winner: m.winner as 'A' | 'B',
      };
    });

  return pozoStandings(participantIds, results);
}

// Clasificación de cada grupo del bloque (nombre de grupo → tabla).
export async function getGroupStandings(db: Db, blockId: string): Promise<Record<string, GroupStanding[]>> {
  const groups = await db.select().from(tournamentGroups).where(eq(tournamentGroups.blockId, blockId));
  const pairs = await db.select().from(tournamentPairs).where(eq(tournamentPairs.blockId, blockId));
  const matches = await db.select().from(tournamentMatches).where(eq(tournamentMatches.blockId, blockId));

  const out: Record<string, GroupStanding[]> = {};
  for (const group of groups) {
    const groupPairIds = pairs.filter((p) => p.groupId === group.id).map((p) => p.id);
    const results: PairMatchResult[] = matches
      .filter((m) => m.phaseTag === `group:${group.name}` && m.status === 'completed')
      .map((m) => ({
        pairA: (parseSlot(m.slotA1) as Extract<SlotRef, { type: 'pair' }>).pairId,
        pairB: (parseSlot(m.slotB1) as Extract<SlotRef, { type: 'pair' }>).pairId,
        gamesA: m.teamAScore ?? 0,
        gamesB: m.teamBScore ?? 0,
        winner: (m.winner ?? 'draw') as 'A' | 'B' | 'draw',
      }));
    out[group.name] = groupStandings(groupPairIds, results);
  }
  return out;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/results.test.ts`
Expected: PASS (10 + 2 = 12).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/results.ts src/lib/tournament/results.test.ts
git commit -m "feat(tournaments): lecturas de clasificación de pozo y grupos"
```

---

## Task 6: Verificación final del plan

- [ ] **Step 1: Ejecutar toda la suite de tournament**

Run: `npx vitest run src/lib/tournament`
Expected: PASS — `time`, `scheduler`, `pozo`, `fixed-pairs`, `generate`, `test-db`, `store` y `results`.

- [ ] **Step 2: Comprobar tipos del proyecto**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (solo el preexistente y ajeno de `web-push`).

- [ ] **Step 3: Lint**

Run: `npx eslint src/lib/tournament`
Expected: sin errores.

---

## Self-review (cubierto en este plan vs. spec)

- **Registrar resultado** (`POST .../matches/[matchId]/result` a nivel de lógica): `recordResult` (Task 1). ✓
- **No cerrar partido con placeholder/ref sin resolver**: validación `matchReady` (Task 1). ✓
- **Pozo: rellenar rondas TBD recalculando movimiento** (subir/bajar + rotación de descansos): `advancePozoRound` con `nextPozoRoundWithRest` (Task 2). ✓
- **Parejas fijas: clasificación de grupo y clasificados al cuadro**: `resolveGroupQualifiers` con `groupStandings` (Task 3). ✓
- **Cuadro: propagar ganadores** (incluye byes vía `resolveBracket`): `propagateBracket` (Task 4). ✓
- **Clasificaciones calculadas a partir de los partidos** (no duplicadas en tablas): `getPozoStandings`/`getGroupStandings` (Task 5). ✓

**Fuera de este plan (planes posteriores):** rutas HTTP (`POST /api/tournaments/[id]/matches/[matchId]/result`) + UI admin de parrilla/entrada de resultado (Plan 6); vista pública de solo lectura (Plan 7). Validaciones de entrada de la API (marcador no negativo, formato de set, autorización `requireAdmin()`) van en el Plan 6. Resolución inicial de byes del cuadro al generar (hoy se resuelven en la primera llamada a `propagateBracket`) puede adelantarse en el Plan 6 si se quiere mostrar el bye ya avanzado antes del primer resultado.
