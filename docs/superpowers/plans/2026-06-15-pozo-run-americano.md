# Pozo — Plan 2b: Generación + persistencia (americano)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend completo del pozo **americano**: generar la parrilla (round 0), registrar resultados, avanzar rondas automáticamente y calcular la clasificación por escalera en vivo — todo persistido en la BD nueva (`tournament_matches`), unit-testable con el harness en memoria.

**Architecture:** Un pozo es una **rejilla pista × ronda**: cada pista (por su orden = escalera) aloja exactamente un partido por ronda. Por eso NO se usa el `scheduler.ts` greedy; el hueco de un partido es determinista (pista k, hora = inicio_pista + ronda·slot). El avance de rondas usa **replay**: se reconstruye la ronda 0 desde sus partidos y se reaplican los resultados ronda a ronda con `nextPozoRoundWithRest` (motor existente `pozo.ts`). La clasificación final usa `ladderStandings` (Plan 2 motores). Todo vive en un módulo nuevo `pozo-run.ts`.

**Tech Stack:** TypeScript, drizzle/libSQL, vitest (harness `createTestDb` en memoria). Reutiliza `pozo.ts` (`seedPozoCourts`, `courtPairing`, `nextPozoRoundWithRest`), `seeding.ts` (`shuffleDeterministic`), `ladder.ts` (`ladderStandings`), `event-store.ts` (`loadEvent`).

**Spec:** `docs/superpowers/specs/2026-06-15-pozo-torneo-split-design.md`.
**Depende de:** Plan 1 (modelo/event-store) y Plan 2 motores (seeding/ladder), ambos ya hechos en esta rama.

**Alcance:** SOLO americano. El pozo de **parejas fijas** (que requiere definir parejas antes de generar — hueco del Plan 1) se hace en un plan siguiente (2b-2), reutilizando este andamiaje con `pozo-pairs.ts`.

**Forma de los datos (recordatorio, `tournament_matches`):** `id, tournament_id, court_id, round, phase_tag, scheduled_start, scheduled_end, status, slot_a1..b2, team_a_score, team_b_score, winner`. Para el pozo: `phase_tag='pozo'`, `round` = nº de ronda (0-based), slots = `{type:'participant', participantId}` serializados a JSON. `winner` = `'A'|'B'`. `scheduled_start/end` en "HH:MM".

---

## File Structure

- **Create:** `src/lib/tournament/pozo-run.ts` — generación/avance/clasificación del pozo persistidos. Responsabilidad única: orquestar motores+BD para un pozo.
- **Create:** `src/lib/tournament/pozo-run.test.ts`.
- **Modify:** `src/lib/tournament/time.ts` — ya tiene `hhmmToMin`/`minToHHMM` (reutilizar; no recrear).

---

## Task 1: Generar la ronda 0 del pozo americano

**Files:**
- Create: `src/lib/tournament/pozo-run.ts`
- Test: `src/lib/tournament/pozo-run.test.ts`

- [ ] **Step 1: Test**

Create `src/lib/tournament/pozo-run.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent } from './event-store';
import { generatePozo, listPozoMatches } from './pozo-run';
import type { PozoConfig } from './types';

async function seedPlayers(client: import('@libsql/client').Client, ids: string[]) {
  for (const id of ids) {
    await client.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [id, id.toUpperCase()] });
  }
}

const POZO_CFG: PozoConfig = { rounds: 3, matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' } };

async function makePozo(db: any, client: any, nPlayers: number, nCourts: number) {
  const players = Array.from({ length: nPlayers }, (_, i) => `p${i + 1}`);
  await seedPlayers(client, players);
  const courts = Array.from({ length: nCourts }, (_, i) => ({
    label: `Pista ${i + 1}`, sortOrder: i + 1, availableFrom: '17:00', availableTo: '20:00',
  }));
  const id = await createEvent(db, {
    name: 'Pozo', date: '2026-07-01', location: null, kind: 'pozo', format: 'americano',
    config: POZO_CFG, createdBy: null, courts, participantPlayerIds: players,
  });
  return { id, players };
}

describe('generatePozo (americano)', () => {
  it('crea 1 partido por pista en la ronda 0, con slots de participante y hora por rejilla', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePozo(db, client, 8, 2); // 8 jugadores, 2 pistas → 2 partidos ronda 0
    await generatePozo(db, id, 123);

    const r0 = await listPozoMatches(db, id, 0);
    expect(r0.length).toBe(2);
    // cada partido tiene 4 slots de participante distintos
    for (const m of r0) {
      const slots = [m.slotA1, m.slotA2, m.slotB1, m.slotB2].map((s) => JSON.parse(s!));
      expect(slots.every((s) => s.type === 'participant')).toBe(true);
      expect(new Set(slots.map((s) => s.participantId)).size).toBe(4);
      expect(m.status).toBe('pending');
      expect(m.phaseTag).toBe('pozo');
      expect(m.scheduledStart).toBe('17:00'); // ronda 0 empieza al inicio de la pista
    }
    // los 8 jugadores aparecen exactamente una vez en la ronda 0
    const all = r0.flatMap((m) => [m.slotA1, m.slotA2, m.slotB1, m.slotB2].map((s) => JSON.parse(s!).participantId));
    expect(new Set(all).size).toBe(8);
  });

  it('es reproducible: misma semilla → misma ronda 0', async () => {
    const a = await createTestDb();
    const pa = await makePozo(a.db, a.client, 8, 2); await generatePozo(a.db, pa.id, 777);
    const b = await createTestDb();
    const pb = await makePozo(b.db, b.client, 8, 2); await generatePozo(b.db, pb.id, 777);
    const ma = (await listPozoMatches(a.db, pa.id, 0)).map((m) => m.slotA1);
    const mb = (await listPozoMatches(b.db, pb.id, 0)).map((m) => m.slotA1);
    expect(ma).toEqual(mb);
  });

  it('marca el evento como scheduled', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePozo(db, client, 8, 2);
    await generatePozo(db, id, 1);
    const { loadEvent } = await import('./event-store');
    expect((await loadEvent(db, id)).status).toBe('scheduled');
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npx vitest run src/lib/tournament/pozo-run.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implement `pozo-run.ts` (Task 1 part)**

Create `src/lib/tournament/pozo-run.ts`:

```ts
import { and, eq, asc } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournaments, tournamentCourts, tournamentParticipants, tournamentMatches } from '@/lib/db/schema';
import { loadEvent } from './event-store';
import { shuffleDeterministic } from './seeding';
import { seedPozoCourts, courtPairing, type PozoRound } from './pozo';
import { hhmmToMin, minToHHMM } from './time';
import { estimatedMatchMinutes } from './scheduler';
import type { PozoConfig, SlotRef } from './types';

type Db = LibSQLDatabase<typeof schema>;

const PHASE = 'pozo';

function participantSlot(participantId: string): string {
  return JSON.stringify({ type: 'participant', participantId } as SlotRef);
}

// Escribe los partidos de una ronda dada a partir del estado (capas de pista).
// Rejilla: la pista de orden k aloja el partido de la pista k; hora = inicio_pista + ronda*slot.
async function writePozoRound(
  db: Db, tournamentId: string, round: number, state: PozoRound,
  courtsByOrder: { id: string; fromMin: number }[], slotMinutes: number,
): Promise<void> {
  for (let k = 0; k < state.courts.length; k++) {
    const players = state.courts[k];
    if (players.length < 4) continue; // pista incompleta: no se juega
    const { teamA, teamB } = courtPairing(players, round);
    const court = courtsByOrder[k];
    const startMin = court.fromMin + round * slotMinutes;
    await db.insert(tournamentMatches).values({
      id: crypto.randomUUID(), tournamentId, courtId: court.id, round, phaseTag: PHASE,
      scheduledStart: minToHHMM(startMin), scheduledEnd: minToHHMM(startMin + slotMinutes),
      status: 'pending',
      slotA1: participantSlot(teamA[0]), slotA2: participantSlot(teamA[1]),
      slotB1: participantSlot(teamB[0]), slotB2: participantSlot(teamB[1]),
    });
  }
}

// Genera la ronda 0 del pozo americano: baraja participantes (semilla), siembra pistas,
// escribe los partidos y marca el evento como 'scheduled'. Idempotente-NO (asume sin partidos).
export async function generatePozo(db: Db, tournamentId: string, seed: number): Promise<void> {
  const ev = await loadEvent(db, tournamentId);
  if (ev.kind !== 'pozo' || ev.format !== 'americano') throw new Error('generatePozo: solo pozo americano');
  const cfg = ev.config as PozoConfig;
  const courtsByOrder = ev.courts
    .slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ id: c.id, fromMin: hhmmToMin(c.availableFrom) }));
  const slotMinutes = estimatedMatchMinutes(cfg.matchFormat);

  const shuffled = shuffleDeterministic(ev.participantPlayerIds, seed);
  const state0 = seedPozoCourts(shuffled, courtsByOrder.length);
  await writePozoRound(db, tournamentId, 0, state0, courtsByOrder, slotMinutes);

  await db.update(tournaments).set({ status: 'scheduled' }).where(eq(tournaments.id, tournamentId));
}

export interface PozoMatchRow {
  id: string; round: number; phaseTag: string | null; status: string;
  courtId: string | null; scheduledStart: string | null; scheduledEnd: string | null;
  slotA1: string | null; slotA2: string | null; slotB1: string | null; slotB2: string | null;
  teamAScore: number | null; teamBScore: number | null; winner: string | null;
}

export async function listPozoMatches(db: Db, tournamentId: string, round?: number): Promise<PozoMatchRow[]> {
  const rows = await db.select().from(tournamentMatches)
    .where(and(eq(tournamentMatches.tournamentId, tournamentId), eq(tournamentMatches.phaseTag, PHASE)))
    .orderBy(asc(tournamentMatches.round));
  const filtered = round === undefined ? rows : rows.filter((r) => r.round === round);
  return filtered.map((r) => ({
    id: r.id, round: r.round, phaseTag: r.phaseTag, status: r.status,
    courtId: r.courtId, scheduledStart: r.scheduledStart, scheduledEnd: r.scheduledEnd,
    slotA1: r.slotA1, slotA2: r.slotA2, slotB1: r.slotB1, slotB2: r.slotB2,
    teamAScore: r.teamAScore, teamBScore: r.teamBScore, winner: r.winner,
  }));
}
```

> Nota: confirma que `time.ts` exporta `hhmmToMin`/`minToHHMM` (la firma vista en Plan 1). Si los nombres difieren, ajusta el import. `estimatedMatchMinutes` está en `scheduler.ts` (no usamos el planificador greedy, solo esta estimación de duración).

- [ ] **Step 4: Run → PASS**

Run: `npx vitest run src/lib/tournament/pozo-run.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo-run.ts src/lib/tournament/pozo-run.test.ts
git commit -m "feat(pozo): genera la ronda 0 del pozo americano (rejilla pista×ronda)"
```

---

## Task 2: Registrar resultado + avanzar ronda (replay)

**Files:**
- Modify: `src/lib/tournament/pozo-run.ts`
- Test: `src/lib/tournament/pozo-run.test.ts`

- [ ] **Step 1: Test (añadir)**

Añade a `src/lib/tournament/pozo-run.test.ts`:

```ts
import { recordPozoResult } from './pozo-run';

async function playRound(db: any, id: string, round: number) {
  const matches = await listPozoMatches(db, id, round);
  // El equipo A gana siempre 4-2 (determinista para el test).
  for (const m of matches) await recordPozoResult(db, m.id, 4, 2);
  return matches;
}

describe('recordPozoResult + avance', () => {
  it('al cerrar la ronda 0, genera la ronda 1 con el movimiento del pozo', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePozo(db, client, 8, 2);
    await generatePozo(db, id, 5);

    expect((await listPozoMatches(db, id, 1)).length).toBe(0); // aún no
    await playRound(db, id, 0);
    const r1 = await listPozoMatches(db, id, 1);
    expect(r1.length).toBe(2); // se generó la ronda 1
    for (const m of r1) {
      expect(m.status).toBe('pending');
      expect(m.scheduledStart).not.toBe('17:00'); // ronda 1 va después en la rejilla
    }
  });

  it('escribe marcador y ganador y no genera más allá del nº de rondas', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePozo(db, client, 8, 2); // rounds: 3
    await generatePozo(db, id, 9);
    await playRound(db, id, 0);
    await playRound(db, id, 1);
    await playRound(db, id, 2);
    // 3 rondas configuradas → no debe existir ronda 3
    expect((await listPozoMatches(db, id, 3)).length).toBe(0);
    const r0 = await listPozoMatches(db, id, 0);
    expect(r0[0].winner).toBe('A');
    expect(r0[0].teamAScore).toBe(4);
    expect(r0[0].status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npx vitest run src/lib/tournament/pozo-run.test.ts`
Expected: FAIL (`recordPozoResult` no existe).

- [ ] **Step 3: Implement (añadir a `pozo-run.ts`)**

Añade estas funciones (y los imports `nextPozoRoundWithRest`, `type CourtResult` de `./pozo`; `tournamentParticipants` ya importado):

```ts
import { nextPozoRoundWithRest, type CourtResult } from './pozo';

function parseParticipant(slot: string | null): string {
  const s = JSON.parse(slot ?? '{}');
  return s.participantId as string;
}

// Reconstruye el estado del pozo en una ronda dada replayando desde la ronda 0.
async function replayPozoState(db: Db, tournamentId: string, uptoRound: number): Promise<PozoRound> {
  const all = await listPozoMatches(db, tournamentId);
  const byRound = new Map<number, PozoMatchRow[]>();
  for (const m of all) { const a = byRound.get(m.round) ?? []; a.push(m); byRound.set(m.round, a); }

  // Estado de la ronda 0 a partir de sus partidos (ordenados por court → orden de pista).
  const courtsByOrder = (await db.select().from(tournamentCourts)
    .where(eq(tournamentCourts.tournamentId, tournamentId))
    .orderBy(asc(tournamentCourts.order))).map((c) => c.id);
  const round0 = (byRound.get(0) ?? []).slice()
    .sort((a, b) => courtsByOrder.indexOf(a.courtId!) - courtsByOrder.indexOf(b.courtId!));
  const courts0 = round0.map((m) => [
    parseParticipant(m.slotA1), parseParticipant(m.slotA2),
    parseParticipant(m.slotB1), parseParticipant(m.slotB2),
  ]);
  // Descansan: participantes que no están en ninguna pista de la ronda 0.
  const inCourts = new Set(courts0.flat());
  const allParts = (await db.select().from(tournamentParticipants)
    .where(eq(tournamentParticipants.tournamentId, tournamentId))).map((p) => p.playerId);
  const resting0 = allParts.filter((p) => !inCourts.has(p));
  let state: PozoRound = { courts: courts0, resting: resting0 };

  for (let r = 0; r < uptoRound; r++) {
    const matches = (byRound.get(r) ?? []).slice()
      .sort((a, b) => courtsByOrder.indexOf(a.courtId!) - courtsByOrder.indexOf(b.courtId!));
    const results: CourtResult[] = matches.map((m) => {
      const teamA: [string, string] = [parseParticipant(m.slotA1), parseParticipant(m.slotA2)];
      const teamB: [string, string] = [parseParticipant(m.slotB1), parseParticipant(m.slotB2)];
      return m.winner === 'A' ? { winners: teamA, losers: teamB } : { winners: teamB, losers: teamA };
    });
    state = nextPozoRoundWithRest(state, results);
  }
  return state;
}

// Registra el marcador de un partido del pozo; si la ronda queda completa y hay más rondas, genera la siguiente.
export async function recordPozoResult(db: Db, matchId: string, gamesA: number, gamesB: number): Promise<void> {
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

  const nextState = await replayPozoState(db, match.tournamentId, round + 1);
  const courtsByOrder = ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ id: c.id, fromMin: hhmmToMin(c.availableFrom) }));
  const slotMinutes = estimatedMatchMinutes(cfg.matchFormat);
  await writePozoRound(db, match.tournamentId, round + 1, nextState, courtsByOrder, slotMinutes);
}
```

- [ ] **Step 4: Run → PASS**

Run: `npx vitest run src/lib/tournament/pozo-run.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo-run.ts src/lib/tournament/pozo-run.test.ts
git commit -m "feat(pozo): registra resultado y avanza ronda por replay"
```

---

## Task 3: Clasificación por escalera en vivo

**Files:**
- Modify: `src/lib/tournament/pozo-run.ts`
- Test: `src/lib/tournament/pozo-run.test.ts`

- [ ] **Step 1: Test (añadir)**

```ts
import { pozoStandingsLive } from './pozo-run';

describe('pozoStandingsLive', () => {
  it('clasifica por la pista de la última ronda con datos; acumula juegos', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePozo(db, client, 8, 2);
    await generatePozo(db, id, 5);
    await playRound(db, id, 0); // genera ronda 1
    const table = await pozoStandingsLive(db, id);
    expect(table.length).toBe(8);
    expect(table[0].rank).toBe(1);
    // ranks 1..8 sin huecos
    expect(table.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // todos los participantes presentes
    expect(new Set(table.map((r) => r.entityId)).size).toBe(8);
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npx vitest run src/lib/tournament/pozo-run.test.ts`
Expected: FAIL (`pozoStandingsLive` no existe).

- [ ] **Step 3: Implement (añadir a `pozo-run.ts`)**

```ts
import { ladderStandings, type LadderStanding } from './ladder';

// Clasificación en vivo del pozo: usa la ÚLTIMA ronda existente como escalera actual,
// y acumula los juegos de TODOS los partidos completados.
export async function pozoStandingsLive(db: Db, tournamentId: string): Promise<LadderStanding[]> {
  const all = await listPozoMatches(db, tournamentId);
  if (all.length === 0) return [];
  const latestRound = Math.max(...all.map((m) => m.round));
  const state = await replayPozoState(db, tournamentId, latestRound);

  // Juegos acumulados por participante (de todos los partidos completados).
  const games = new Map<string, number>();
  for (const m of all) {
    if (m.status !== 'completed') continue;
    const a = [parseParticipant(m.slotA1), parseParticipant(m.slotA2)];
    const b = [parseParticipant(m.slotB1), parseParticipant(m.slotB2)];
    for (const p of a) games.set(p, (games.get(p) ?? 0) + (m.teamAScore ?? 0));
    for (const p of b) games.set(p, (games.get(p) ?? 0) + (m.teamBScore ?? 0));
  }
  return ladderStandings(state.courts, games, state.resting);
}
```

- [ ] **Step 4: Run → PASS**

Run: `npx vitest run src/lib/tournament/pozo-run.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo-run.ts src/lib/tournament/pozo-run.test.ts
git commit -m "feat(pozo): clasificación por escalera en vivo (replay + juegos acumulados)"
```

---

## Task 4: Verificación + push

**Files:** —

- [ ] **Step 1: Suite + tipos**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests" && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: todo verde (≈266), `0` errores de tipos.

- [ ] **Step 2: Push**

```bash
git push origin pozo-torneo-redesign
```

---

## Self-review (cobertura vs. spec)

- **Generar parrilla del pozo (americano)** con siembra aleatoria reproducible → Task 1. ✓
- **Rejilla pista×ronda** (cada pista un partido por ronda; hora determinista; pistas = escalera por orden) → Task 1 (`writePozoRound`). ✓
- **Registrar resultado y avanzar ronda** (movimiento rey de la pista, replay) → Task 2. ✓
- **Clasificación por escalera en vivo** (pista de la última ronda + juegos acumulados) → Task 3. ✓
- **NO en este plan:** pozo de parejas fijas (necesita definir parejas: plan 2b-2), UI/parrilla/pública (plan 2c), API HTTP (parte de 2c). ✓

**Notas / ajustes durante la ejecución:**
- Si `time.ts` no exporta `hhmmToMin`/`minToHHMM` con esos nombres exactos, ajustar el import (ver `src/lib/tournament/time.ts`).
- `seedPozoCourts` deja a los sobrantes en `resting`; si `numParticipantes` no es múltiplo de 4, el pozo americano rota descansos automáticamente al avanzar (vía `nextPozoRoundWithRest`). Los tests usan 8 jugadores / 2 pistas (sin descansos) para aislar el movimiento; el motor de descansos ya está testeado en `pozo.test.ts`.
- El drizzle de `tournamentCourts` usa la propiedad `order` (columna `sort_order`); al ordenar en `replayPozoState` se usa `tournamentCourts.order`. Confirmar contra el esquema.
- `recordPozoResult` usa `gamesA >= gamesB ? 'A' : 'B'` — en formato `timed` con punto de oro no hay empates; si en el futuro se permite empate, revisar.
