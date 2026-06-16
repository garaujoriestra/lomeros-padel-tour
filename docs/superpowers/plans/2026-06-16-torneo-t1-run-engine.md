# Torneo T1 — Run layer (single_elim + groups_elim) + fachada event-engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend del torneo de parejas fijas: generar/registrar/avanzar tanto **eliminación directa** (`single_elim`) como **grupos→eliminación** (`groups_elim`), reutilizando el motor puro `fixed-pairs.ts` y el `scheduler.ts`, expuesto tras una fachada `event-engine.ts` que despacha por `kind` (pozo|torneo) y a la que se cablean las rutas `generate`/`result`.

**Architecture:** `torneo-run.ts` escribe el cuadro completo (slots `matchWinner` para rondas futuras; byes auto-ganados al generar) y, en `groups_elim`, primero la liguilla y luego —al cerrarse— el cuadro con cruces estándar. El avance del cuadro NO muta filas: se resuelve en lectura con `resolveBracket` (eso es T2). El reparto a pistas usa el `scheduler` greedy para la liguilla y un reparto por **olas** (ronda r empieza tras la r-1) para el cuadro.

**Tech Stack:** TypeScript, Drizzle (libSQL), vitest. DB de test en memoria (`createTestDb`).

---

## File Structure

- **Crear** `src/lib/tournament/torneo-run.ts` — generación/registro/avance del torneo + `loadTorneoMatches`.
- **Crear** `src/lib/tournament/torneo-run.test.ts` — unit.
- **Crear** `src/lib/tournament/event-engine.ts` — fachada de dispatch por `kind`.
- **Crear** `src/lib/tournament/event-engine.test.ts` — unit del dispatch.
- **Modificar** `src/app/api/tournaments/[id]/generate/route.ts` — usar `event-engine` + mapear errores del torneo.
- **Modificar** `src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts` — usar `event-engine`.

Referencias (leer antes): `src/lib/tournament/fixed-pairs.ts` (motor), `src/lib/tournament/scheduler.ts`, `src/lib/tournament/pozo-run.ts` (patrón análogo + `type PozoMatchRow`), `src/lib/tournament/pozo-engine.ts` (fachada análoga), `src/lib/tournament/pair-store.ts`, `src/lib/tournament/event-store.ts`, `src/lib/tournament/types.ts` (`TorneoConfig`, `SlotRef`).

---

## Task 1: `torneo-run.ts` — eliminación directa (single_elim)

**Files:**
- Create: `src/lib/tournament/torneo-run.ts`
- Test: `src/lib/tournament/torneo-run.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tournament/torneo-run.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent } from './event-store';
import { replacePairs, loadPairs } from './pair-store';
import { generateTorneo, recordTorneoResult, loadTorneoMatches } from './torneo-run';
import type { TorneoConfig } from './types';

type TestDb = Awaited<ReturnType<typeof createTestDb>>['db'];
type TestClient = Awaited<ReturnType<typeof createTestDb>>['client'];

const KO_CFG: TorneoConfig = { matchFormat: { kind: 'best_of_3' }, thirdPlace: false };

async function seedPlayers(client: TestClient, ids: string[]) {
  for (const id of ids) await client.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [id, id.toUpperCase()] });
}

// nPairs parejas, nCourts pistas, formato dado. Devuelve { id, pairIds }.
async function makeTorneo(db: TestDb, client: TestClient, nPairs: number, nCourts: number, format: string, config: TorneoConfig) {
  const players = Array.from({ length: nPairs * 2 }, (_, i) => `p${i + 1}`);
  await seedPlayers(client, players);
  const courts = Array.from({ length: nCourts }, (_, i) => ({
    label: `Pista ${i + 1}`, sortOrder: i + 1, availableFrom: '17:00', availableTo: '23:00',
  }));
  const id = await createEvent(db, {
    name: 'Torneo', date: '2026-07-01', location: null, kind: 'torneo', format,
    config, createdBy: null, courts, participantPlayerIds: players,
  });
  const pairs: [string, string][] = [];
  for (let i = 0; i < players.length; i += 2) pairs.push([players[i], players[i + 1]]);
  await replacePairs(db, id, pairs);
  const pairIds = (await loadPairs(db, id)).map((p) => p.id);
  return { id, pairIds };
}

describe('generateTorneo (single_elim)', () => {
  it('escribe el cuadro completo: 4 parejas → 2 semis + 1 final, con slots pair y matchWinner', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 4, 2, 'single_elim', KO_CFG);
    await generateTorneo(db, id, 123);

    const ko = (await loadTorneoMatches(db, id)).filter((m) => m.phaseTag?.startsWith('ko:'));
    expect(ko.length).toBe(3);
    const r0 = ko.filter((m) => m.round === 0);
    const r1 = ko.filter((m) => m.round === 1);
    expect(r0.length).toBe(2);
    expect(r1.length).toBe(1);
    // las semis tienen 2 parejas concretas
    for (const m of r0) {
      expect(JSON.parse(m.slotA1!).type).toBe('pair');
      expect(JSON.parse(m.slotB1!).type).toBe('pair');
      expect(m.scheduledStart).toBeTruthy(); // programada
    }
    // la final referencia ganadores
    expect(JSON.parse(r1[0].slotA1!).type).toBe('matchWinner');
    expect(JSON.parse(r1[0].slotB1!).type).toBe('matchWinner');
  });

  it('marca el evento como scheduled y phaseTag ko:<idPosicional>', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 4, 2, 'single_elim', KO_CFG);
    await generateTorneo(db, id, 1);
    const { loadEvent } = await import('./event-store');
    expect((await loadEvent(db, id)).status).toBe('scheduled');
    const ko = (await loadTorneoMatches(db, id)).filter((m) => m.phaseTag?.startsWith('ko:'));
    expect(ko.map((m) => m.phaseTag).sort()).toEqual(['ko:r0m0', 'ko:r0m1', 'ko:r1m0']);
  });

  it('auto-completa los byes al generar (3 parejas → 1 bye ganado, 1 semi real)', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 3, 2, 'single_elim', KO_CFG);
    await generateTorneo(db, id, 1);
    const r0 = (await loadTorneoMatches(db, id)).filter((m) => m.phaseTag?.startsWith('ko:') && m.round === 0);
    expect(r0.length).toBe(2);
    const byeMatch = r0.find((m) => JSON.parse(m.slotA1!).type === 'bye' || JSON.parse(m.slotB1!).type === 'bye')!;
    expect(byeMatch.status).toBe('completed');
    expect(byeMatch.winner === 'A' || byeMatch.winner === 'B').toBe(true);
    const realMatch = r0.find((m) => m.id !== byeMatch.id)!;
    expect(realMatch.status).toBe('pending');
  });

  it('lanza TOO_FEW_PAIRS con menos de 2 parejas', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 1, 1, 'single_elim', KO_CFG);
    await expect(generateTorneo(db, id, 1)).rejects.toThrow(/TOO_FEW_PAIRS/);
  });
});

describe('recordTorneoResult (single_elim)', () => {
  it('escribe marcador y ganador de una semifinal', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 4, 2, 'single_elim', KO_CFG);
    await generateTorneo(db, id, 7);
    const semi = (await loadTorneoMatches(db, id)).find((m) => m.phaseTag === 'ko:r0m0')!;
    await recordTorneoResult(db, semi.id, 2, 0);
    const after = (await loadTorneoMatches(db, id)).find((m) => m.id === semi.id)!;
    expect(after.status).toBe('completed');
    expect(after.winner).toBe('A');
    expect(after.teamAScore).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tournament/torneo-run.test.ts -t single_elim`
Expected: FAIL — `torneo-run` no existe.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/tournament/torneo-run.ts
import { eq, asc } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournaments, tournamentGroups, tournamentPairs, tournamentMatches } from '@/lib/db/schema';
import { loadEvent } from './event-store';
import { loadPairs, type LoadedPair } from './pair-store';
import { shuffleDeterministic } from './seeding';
import {
  generateBracket, buildBracket, roundRobinSchedule, groupStandings,
  type BracketMatch, type PairMatchResult,
} from './fixed-pairs';
import { scheduleMatches, estimatedMatchMinutes, type CourtWindow, type ScheduleItem } from './scheduler';
import { hhmmToMin, minToHHMM } from './time';
import type { PozoMatchRow } from './pozo-run';
import type { TorneoConfig, SlotRef } from './types';

type Db = LibSQLDatabase<typeof schema>;

function slotJson(slot: SlotRef): string { return JSON.stringify(slot); }
function pairSlotJson(pairId: string): string { return JSON.stringify({ type: 'pair', pairId } as SlotRef); }
function parseSlotRef(s: string | null): SlotRef | null {
  if (!s) return null;
  try { return JSON.parse(s) as SlotRef; } catch { return null; }
}
function slotPlayers(slot: SlotRef, playersOfPair: Map<string, string[]>): string[] {
  return slot.type === 'pair' ? (playersOfPair.get(slot.pairId) ?? []) : [];
}
function engineRound(matchId: string): number {
  const m = /^r(\d+)m\d+$/.exec(matchId);
  return m ? Number(m[1]) : 0;
}

// Lee TODOS los partidos del torneo (group:* y ko:*) con la forma de PozoMatchRow.
export async function loadTorneoMatches(db: Db, tournamentId: string): Promise<PozoMatchRow[]> {
  const rows = await db.select().from(tournamentMatches)
    .where(eq(tournamentMatches.tournamentId, tournamentId)).orderBy(asc(tournamentMatches.round));
  return rows.map((r) => ({
    id: r.id, round: r.round, phaseTag: r.phaseTag, status: r.status,
    courtId: r.courtId, scheduledStart: r.scheduledStart, scheduledEnd: r.scheduledEnd,
    slotA1: r.slotA1, slotA2: r.slotA2, slotB1: r.slotB1, slotB2: r.slotB2,
    teamAScore: r.teamAScore, teamBScore: r.teamBScore, winner: r.winner,
  }));
}

function courtWindowsOf(ev: Awaited<ReturnType<typeof loadEvent>>): CourtWindow[] {
  return ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ courtId: c.id, order: c.sortOrder, fromMin: hhmmToMin(c.availableFrom), toMin: hhmmToMin(c.availableTo) }));
}

// Reparte el cuadro por OLAS: la ronda r empieza en baseStart + r*slot; las pistas se
// asignan round-robin dentro de la ronda. Devuelve mapa engineMatchId -> hueco.
function scheduleBracketByWave(
  bracket: BracketMatch[], courts: CourtWindow[], slotMinutes: number, baseStartMin: number,
): Map<string, { courtId: string; startMin: number; endMin: number }> {
  const out = new Map<string, { courtId: string; startMin: number; endMin: number }>();
  if (courts.length === 0) return out;
  const byRound = new Map<number, BracketMatch[]>();
  for (const m of bracket) { const a = byRound.get(m.round) ?? []; a.push(m); byRound.set(m.round, a); }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  for (const r of rounds) {
    const start = baseStartMin + r * slotMinutes;
    const end = start + slotMinutes;
    byRound.get(r)!.forEach((m, i) => {
      const court = courts[i % courts.length];
      if (end <= court.toMin) out.set(m.matchId, { courtId: court.courtId, startMin: start, endMin: end });
    });
  }
  return out;
}

async function writeBracket(
  db: Db, tournamentId: string, bracket: BracketMatch[],
  playersOfPair: Map<string, string[]>, courts: CourtWindow[], slotMinutes: number, baseStartMin: number,
): Promise<void> {
  const sched = scheduleBracketByWave(bracket, courts, slotMinutes, baseStartMin);
  for (const m of bracket) {
    const s = sched.get(m.matchId);
    await db.insert(tournamentMatches).values({
      id: crypto.randomUUID(), tournamentId, phaseTag: `ko:${m.matchId}`, round: m.round,
      courtId: s?.courtId ?? null,
      scheduledStart: s ? minToHHMM(s.startMin) : null, scheduledEnd: s ? minToHHMM(s.endMin) : null,
      status: 'pending', slotA1: slotJson(m.slotA), slotA2: null, slotB1: slotJson(m.slotB), slotB2: null,
    });
  }
  await autoCompleteByes(db, tournamentId);
}

// Marca completados los partidos de cuadro con un bye (la pareja del otro lado avanza).
async function autoCompleteByes(db: Db, tournamentId: string): Promise<void> {
  const rows = await loadTorneoMatches(db, tournamentId);
  for (const m of rows) {
    if (!m.phaseTag?.startsWith('ko:') || m.status === 'completed') continue;
    const a = parseSlotRef(m.slotA1); const b = parseSlotRef(m.slotB1);
    if (a?.type === 'pair' && b?.type === 'bye') {
      await db.update(tournamentMatches).set({ winner: 'A', status: 'completed' }).where(eq(tournamentMatches.id, m.id));
    } else if (b?.type === 'pair' && a?.type === 'bye') {
      await db.update(tournamentMatches).set({ winner: 'B', status: 'completed' }).where(eq(tournamentMatches.id, m.id));
    }
  }
}

export async function generateTorneo(db: Db, tournamentId: string, seed: number): Promise<void> {
  const ev = await loadEvent(db, tournamentId);
  if (ev.kind !== 'torneo') throw new Error('generateTorneo: solo torneo');
  const cfg = ev.config as TorneoConfig;
  const pairs = await loadPairs(db, tournamentId);
  if (pairs.length < 2) throw new Error('TOO_FEW_PAIRS');

  const courts = courtWindowsOf(ev);
  const slotMinutes = estimatedMatchMinutes(cfg.matchFormat);
  const playersOfPair = new Map<string, string[]>(pairs.map((p) => [p.id, [p.player1Id, p.player2Id]]));
  const baseStart = courts.length ? Math.min(...courts.map((c) => c.fromMin)) : 0;

  if (ev.format === 'single_elim') {
    const seeded = shuffleDeterministic(pairs.map((p) => p.id), seed);
    const bracket = generateBracket(seeded);
    await writeBracket(db, tournamentId, bracket, playersOfPair, courts, slotMinutes, baseStart);
  } else if (ev.format === 'groups_elim') {
    await generateGroups(db, tournamentId, ev, cfg, pairs, playersOfPair, courts, slotMinutes, seed);
  } else {
    throw new Error(`generateTorneo: formato no soportado (${ev.format})`);
  }

  await db.update(tournaments).set({ status: 'scheduled' }).where(eq(tournaments.id, tournamentId));
}

// Placeholder de groups_elim (se implementa en Task 2). Lanza para que el build/typecheck
// no referencie un símbolo inexistente; el test de single_elim no entra aquí.
async function generateGroups(
  _db: Db, _tournamentId: string, _ev: Awaited<ReturnType<typeof loadEvent>>, _cfg: TorneoConfig,
  _pairs: LoadedPair[], _playersOfPair: Map<string, string[]>, _courts: CourtWindow[], _slotMinutes: number, _seed: number,
): Promise<void> {
  throw new Error('groups_elim: pendiente (Task 2)');
}

export async function recordTorneoResult(db: Db, matchId: string, gamesA: number, gamesB: number): Promise<void> {
  const [match] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId));
  if (!match) throw new Error('NOT_FOUND');
  const winner = gamesA >= gamesB ? 'A' : 'B';
  await db.update(tournamentMatches).set({
    teamAScore: gamesA, teamBScore: gamesB, winner, status: 'completed',
  }).where(eq(tournamentMatches.id, matchId));

  if (match.phaseTag?.startsWith('group:')) {
    await maybeGenerateBracketFromGroups(db, match.tournamentId);
  }
  // ko: el avance se resuelve en lectura (resolveBracket) en el view-model (T2).
}

// Placeholder de la transición grupos→cuadro (se implementa en Task 2).
async function maybeGenerateBracketFromGroups(_db: Db, _tournamentId: string): Promise<void> {
  // no-op hasta Task 2
}
```

> Nota: `generateGroups` y `maybeGenerateBracketFromGroups` se dejan como stubs en esta tarea para que el módulo compile y los tests de single_elim pasen; la Task 2 los implementa de verdad. Los imports `buildBracket`, `roundRobinSchedule`, `groupStandings`, `tournamentGroups`, `tournamentPairs`, `scheduleMatches`, `ScheduleItem`, `PairMatchResult` se usan en Task 2 — si el linter marca alguno como no usado en esta tarea, **elimínalo del import ahora y vuélvelo a añadir en Task 2** (no dejes imports sin usar). Mínimo necesario para Task 1: `generateBracket`, `BracketMatch`, `scheduleMatches`(no), `estimatedMatchMinutes`, `CourtWindow`, `shuffleDeterministic`, `hhmmToMin`, `minToHHMM`, `loadEvent`, `loadPairs`, `LoadedPair`, `TorneoConfig`, `SlotRef`, `PozoMatchRow`, tablas `tournaments`/`tournamentMatches`. Ajusta los imports para que `npx eslint` dé 0 errores.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tournament/torneo-run.test.ts -t single_elim` then `... -t "recordTorneoResult (single_elim)"`
Expected: PASS (4 + 1 tests). Also `npx eslint src/lib/tournament/torneo-run.ts` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/torneo-run.ts src/lib/tournament/torneo-run.test.ts
git commit -m "feat(torneo): run de eliminación directa (cuadro completo + byes auto + scheduling por olas)"
```

---

## Task 2: `torneo-run.ts` — grupos→eliminación (groups_elim)

**Files:**
- Modify: `src/lib/tournament/torneo-run.ts` (implementa `generateGroups` + `maybeGenerateBracketFromGroups` + helpers; re-añade imports usados)
- Test: `src/lib/tournament/torneo-run.test.ts`

- [ ] **Step 1: Write the failing test**

Añade a `torneo-run.test.ts`:

```ts
const GROUPS_CFG: TorneoConfig = { matchFormat: { kind: 'best_of_3' }, thirdPlace: false, numGroups: 2, advancePerGroup: 2 };

// Registra todos los partidos de grupo: gana el de pairId menor (determinista).
async function playAllGroupMatches(db: TestDb, id: string) {
  const groupMatches = (await loadTorneoMatches(db, id)).filter((m) => m.phaseTag?.startsWith('group:'));
  for (const m of groupMatches) {
    const a = JSON.parse(m.slotA1!).pairId as string;
    const b = JSON.parse(m.slotB1!).pairId as string;
    // A gana si su pairId es <= b (estable)
    if (a <= b) await recordTorneoResult(db, m.id, 6, 3);
    else await recordTorneoResult(db, m.id, 3, 6);
  }
}

describe('generateTorneo (groups_elim)', () => {
  it('crea grupos + liguilla y NO crea el cuadro todavía', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 8, 2, 'groups_elim', GROUPS_CFG); // 8 parejas, 2 grupos de 4
    await generateTorneo(db, id, 1);

    const all = await loadTorneoMatches(db, id);
    const groupMatches = all.filter((m) => m.phaseTag?.startsWith('group:'));
    const ko = all.filter((m) => m.phaseTag?.startsWith('ko:'));
    // 2 grupos de 4 → round-robin = 6 partidos por grupo → 12
    expect(groupMatches.length).toBe(12);
    expect(ko.length).toBe(0);
    // las parejas quedaron asignadas a grupo
    const pairs = await loadPairs(db, id);
    expect(pairs.every((p) => p.id)).toBe(true);
  });

  it('rechaza GROUP_TOO_SMALL si un grupo recibe menos de 2 parejas', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 3, 2, 'groups_elim', { ...GROUPS_CFG, numGroups: 2 }); // 3 parejas en 2 grupos → grupo con 1
    await expect(generateTorneo(db, id, 1)).rejects.toThrow(/GROUP_TOO_SMALL/);
  });
});

describe('transición grupos→cuadro', () => {
  it('al cerrar toda la liguilla, genera el cuadro con los clasificados (4 → semis+final)', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 8, 2, 'groups_elim', GROUPS_CFG);
    await generateTorneo(db, id, 1);
    expect((await loadTorneoMatches(db, id)).filter((m) => m.phaseTag?.startsWith('ko:')).length).toBe(0);

    await playAllGroupMatches(db, id);

    const ko = (await loadTorneoMatches(db, id)).filter((m) => m.phaseTag?.startsWith('ko:'));
    expect(ko.length).toBe(3); // 4 clasificados → 2 semis + 1 final
    const r0 = ko.filter((m) => m.round === 0);
    // las semis enfrentan parejas concretas (clasificados), no matchWinner
    for (const m of r0) {
      expect(JSON.parse(m.slotA1!).type).toBe('pair');
      expect(JSON.parse(m.slotB1!).type).toBe('pair');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tournament/torneo-run.test.ts -t groups_elim`
Expected: FAIL — `generateGroups` lanza "pendiente (Task 2)".

- [ ] **Step 3: Implement `generateGroups`, `maybeGenerateBracketFromGroups`, helpers**

Reemplaza el stub `generateGroups` y el no-op `maybeGenerateBracketFromGroups` en `torneo-run.ts` por:

```ts
// Reparte la lista barajada en numGroups grupos (pareja i → grupo i % numGroups).
function splitIntoGroups(shuffledPairIds: string[], numGroups: number): string[][] {
  const groups: string[][] = Array.from({ length: numGroups }, () => []);
  shuffledPairIds.forEach((pid, i) => groups[i % numGroups].push(pid));
  return groups;
}

function groupName(index: number): string {
  return String.fromCharCode(65 + index); // 0->A, 1->B, ...
}

async function generateGroups(
  db: Db, tournamentId: string, _ev: Awaited<ReturnType<typeof loadEvent>>, cfg: TorneoConfig,
  pairs: LoadedPair[], playersOfPair: Map<string, string[]>, courts: CourtWindow[], slotMinutes: number, seed: number,
): Promise<void> {
  const numGroups = cfg.numGroups ?? 2;
  const shuffled = shuffleDeterministic(pairs.map((p) => p.id), seed);
  const groups = splitIntoGroups(shuffled, numGroups);
  for (const g of groups) if (g.length < 2) throw new Error('GROUP_TOO_SMALL');

  const items: ScheduleItem[] = [];
  const toWrite: { phaseTag: string; round: number; pairA: string; pairB: string; key: string }[] = [];
  for (let gi = 0; gi < numGroups; gi++) {
    const name = groupName(gi);
    const groupId = crypto.randomUUID();
    await db.insert(tournamentGroups).values({ id: groupId, tournamentId, name });
    for (const pid of groups[gi]) {
      await db.update(tournamentPairs).set({ groupId }).where(eq(tournamentPairs.id, pid));
    }
    roundRobinSchedule(groups[gi]).forEach((m, i) => {
      const key = `g${gi}r${m.round}m${i}`;
      toWrite.push({ phaseTag: `group:${name}`, round: m.round, pairA: m.pairA, pairB: m.pairB, key });
      items.push({ matchId: key, players: [...(playersOfPair.get(m.pairA) ?? []), ...(playersOfPair.get(m.pairB) ?? [])] });
    });
  }
  const sched = scheduleMatches(items, courts, slotMinutes);
  const schedByKey = new Map(sched.scheduled.map((s) => [s.matchId, s]));
  for (const w of toWrite) {
    const s = schedByKey.get(w.key);
    await db.insert(tournamentMatches).values({
      id: crypto.randomUUID(), tournamentId, phaseTag: w.phaseTag, round: w.round,
      courtId: s?.courtId ?? null,
      scheduledStart: s ? minToHHMM(s.startMin) : null, scheduledEnd: s ? minToHHMM(s.endMin) : null,
      status: 'pending', slotA1: pairSlotJson(w.pairA), slotA2: null, slotB1: pairSlotJson(w.pairB), slotB2: null,
    });
  }
}

function toPairMatchResult(m: PozoMatchRow): PairMatchResult {
  return {
    pairA: (parseSlotRef(m.slotA1) as { pairId: string }).pairId,
    pairB: (parseSlotRef(m.slotB1) as { pairId: string }).pairId,
    gamesA: m.teamAScore ?? 0, gamesB: m.teamBScore ?? 0,
    winner: m.winner === 'A' || m.winner === 'B' ? m.winner : 'draw',
  };
}

// Cruces estándar: lista sembrada rank-major (todos los 1ºs por orden de grupo, luego los 2ºs…).
// Para 2 grupos × 2 → [1ºA,1ºB,2ºA,2ºB], que con seedOrder produce 1ºA-2ºB y 1ºB-2ºA.
function crossSeed(qualifiersByGroup: string[][]): string[] {
  const maxRank = Math.max(0, ...qualifiersByGroup.map((q) => q.length));
  const out: string[] = [];
  for (let r = 0; r < maxRank; r++) for (const g of qualifiersByGroup) if (g[r]) out.push(g[r]);
  return out;
}

async function maybeGenerateBracketFromGroups(db: Db, tournamentId: string): Promise<void> {
  const rows = await loadTorneoMatches(db, tournamentId);
  const groupMatches = rows.filter((m) => m.phaseTag?.startsWith('group:'));
  if (groupMatches.length === 0) return;
  if (!groupMatches.every((m) => m.status === 'completed')) return; // liguilla no cerrada
  if (rows.some((m) => m.phaseTag?.startsWith('ko:'))) return; // cuadro ya generado

  const ev = await loadEvent(db, tournamentId);
  const cfg = ev.config as TorneoConfig;
  const advance = cfg.advancePerGroup ?? 2;
  const pairs = await loadPairs(db, tournamentId);
  const playersOfPair = new Map<string, string[]>(pairs.map((p) => [p.id, [p.player1Id, p.player2Id]]));
  const groupsRows = await db.select().from(tournamentGroups)
    .where(eq(tournamentGroups.tournamentId, tournamentId)).orderBy(asc(tournamentGroups.name));

  const qualifiersByGroup: string[][] = [];
  for (const g of groupsRows) {
    const groupPairIds = pairs.filter((p) => p.groupId === g.id).map((p) => p.id);
    const results = groupMatches.filter((m) => m.phaseTag === `group:${g.name}`).map(toPairMatchResult);
    const standings = groupStandings(groupPairIds, results);
    qualifiersByGroup.push(standings.slice(0, advance).map((s) => s.pairId));
  }

  const seededLeaves = crossSeed(qualifiersByGroup);
  const bracket = buildBracket(seededLeaves.map((pid) => ({ type: 'pair', pairId: pid } as SlotRef)));
  const courts = courtWindowsOf(ev);
  const slotMinutes = estimatedMatchMinutes(cfg.matchFormat);
  // El cuadro empieza tras la liguilla: base = el final más tardío de los partidos de grupo (o inicio de pista).
  const groupEnds = groupMatches.map((m) => (m.scheduledEnd ? hhmmToMin(m.scheduledEnd) : 0));
  const baseStart = Math.max(courts.length ? Math.min(...courts.map((c) => c.fromMin)) : 0, ...groupEnds, 0);
  await writeBracket(db, tournamentId, bracket, playersOfPair, courts, slotMinutes, baseStart);
}
```

> Asegúrate de que los imports de `torneo-run.ts` incluyan ahora: `buildBracket`, `roundRobinSchedule`, `groupStandings`, `PairMatchResult` (de `./fixed-pairs`), `scheduleMatches`, `ScheduleItem` (de `./scheduler`), y las tablas `tournamentGroups`, `tournamentPairs`. `npx eslint` debe dar 0 errores (sin imports sin usar).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tournament/torneo-run.test.ts` (todo el fichero)
Expected: PASS (single_elim + record + groups_elim + transición). `npx eslint src/lib/tournament/torneo-run.ts` → 0 errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/torneo-run.ts src/lib/tournament/torneo-run.test.ts
git commit -m "feat(torneo): grupos→eliminación (liguilla + transición automática con cruces estándar)"
```

---

## Task 3: Fachada `event-engine.ts` + cableado de rutas

**Files:**
- Create: `src/lib/tournament/event-engine.ts`
- Test: `src/lib/tournament/event-engine.test.ts`
- Modify: `src/app/api/tournaments/[id]/generate/route.ts`
- Modify: `src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tournament/event-engine.test.ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent } from './event-store';
import { replacePairs, loadPairs } from './pair-store';
import { generateEvent, recordResult, listEventMatches } from './event-engine';
import type { TorneoConfig, PozoConfig } from './types';

type TestClient = Awaited<ReturnType<typeof createTestDb>>['client'];
async function seedPlayers(client: TestClient, ids: string[]) {
  for (const id of ids) await client.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [id, id] });
}

describe('event-engine dispatch', () => {
  it('pozo: genera y lista vía la fachada', async () => {
    const { db, client } = await createTestDb();
    const players = Array.from({ length: 8 }, (_, i) => `a${i + 1}`);
    await seedPlayers(client, players);
    const cfg: PozoConfig = { rounds: 2, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } };
    const id = await createEvent(db, {
      name: 'P', date: '2026-07-01', location: null, kind: 'pozo', format: 'americano',
      config: cfg, createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' },
               { label: 'C2', sortOrder: 2, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: players,
    });
    await generateEvent(db, id, 1);
    expect((await listEventMatches(db, id)).length).toBe(2);
  });

  it('torneo: genera el cuadro y registra resultado vía la fachada', async () => {
    const { db, client } = await createTestDb();
    const players = Array.from({ length: 8 }, (_, i) => `b${i + 1}`);
    await seedPlayers(client, players);
    const cfg: TorneoConfig = { matchFormat: { kind: 'best_of_3' }, thirdPlace: false };
    const id = await createEvent(db, {
      name: 'T', date: '2026-07-01', location: null, kind: 'torneo', format: 'single_elim',
      config: cfg, createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '23:00' }],
      participantPlayerIds: players,
    });
    const pairs: [string, string][] = [];
    for (let i = 0; i < players.length; i += 2) pairs.push([players[i], players[i + 1]]);
    await replacePairs(db, id, pairs);

    await generateEvent(db, id, 1);
    const ko = (await listEventMatches(db, id)).filter((m) => m.phaseTag?.startsWith('ko:'));
    expect(ko.length).toBeGreaterThanOrEqual(3); // 4 parejas → ≥3 partidos de cuadro
    const semi = ko.find((m) => m.round === 0 && JSON.parse(m.slotA1!).type === 'pair' && JSON.parse(m.slotB1!).type === 'pair')!;
    await recordResult(db, semi.id, 2, 0);
    expect((await listEventMatches(db, id)).find((m) => m.id === semi.id)!.status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tournament/event-engine.test.ts`
Expected: FAIL — `event-engine` no existe.

- [ ] **Step 3: Write `event-engine.ts`**

```ts
// src/lib/tournament/event-engine.ts
// Fachada de eventos: despacha por `kind` (pozo|torneo). Las rutas/UI importan de aquí.
import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import { tournamentMatches } from '@/lib/db/schema';
import { loadEvent } from './event-store';
import * as pozo from './pozo-engine';
import * as torneo from './torneo-run';
import type { PozoMatchRow } from './pozo-run';

type Db = LibSQLDatabase<typeof schema>;

export async function generateEvent(db: Db, id: string, seed: number): Promise<void> {
  const ev = await loadEvent(db, id);
  if (ev.kind === 'pozo') return pozo.generatePozo(db, id, seed);
  if (ev.kind === 'torneo') return torneo.generateTorneo(db, id, seed);
  throw new Error(`generateEvent: kind no soportado (${ev.kind})`);
}

export async function recordResult(db: Db, matchId: string, gamesA: number, gamesB: number): Promise<void> {
  const [m] = await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, matchId));
  if (!m) throw new Error('NOT_FOUND');
  const ev = await loadEvent(db, m.tournamentId);
  if (ev.kind === 'torneo') return torneo.recordTorneoResult(db, matchId, gamesA, gamesB);
  return pozo.recordPozoResult(db, matchId, gamesA, gamesB);
}

export async function listEventMatches(db: Db, id: string): Promise<PozoMatchRow[]> {
  const ev = await loadEvent(db, id);
  if (ev.kind === 'torneo') return torneo.loadTorneoMatches(db, id);
  return pozo.listPozoMatches(db, id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tournament/event-engine.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Rewire the generate route**

En `src/app/api/tournaments/[id]/generate/route.ts`, sustituye el import y la llamada, y añade el mapeo de errores del torneo. El fichero queda así:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { loadEvent } from '@/lib/tournament/event-store';
import { generateEvent } from '@/lib/tournament/event-engine';

// POST /api/tournaments/[id]/generate — genera el evento (pozo o torneo) (admin). Body: { seed?: number }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const ev = await loadEvent(db, id);
    if (ev.status !== 'draft') return NextResponse.json({ error: 'El evento ya está generado' }, { status: 409 });
    if (ev.kind === 'pozo' && ev.format === 'americano' && ev.participantPlayerIds.length < 4) {
      return NextResponse.json({ error: 'Un pozo americano necesita al menos 4 jugadores' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const seed = typeof body.seed === 'number' ? body.seed : Math.floor(Math.random() * 0x7fffffff);
    await generateEvent(db, id, seed);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    if (error instanceof Error && ['NO_PAIRS', 'UNBALANCED_PAIRS', 'TOO_FEW_PAIRS', 'GROUP_TOO_SMALL'].includes(error.message)) {
      const msg: Record<string, string> = {
        NO_PAIRS: 'Define las parejas antes de generar',
        UNBALANCED_PAIRS: 'Demasiadas parejas para las pistas: como mucho pueden descansar 2 (una pista). Añade pistas o quita parejas.',
        TOO_FEW_PAIRS: 'El torneo necesita al menos 2 parejas',
        GROUP_TOO_SMALL: 'Cada grupo necesita al menos 2 parejas: reduce el nº de grupos o añade parejas',
      };
      return NextResponse.json({ error: msg[error.message] }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al generar' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Rewire the result route**

En `src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts`, cambia el import y la llamada a la fachada. El fichero queda así:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { recordResult } from '@/lib/tournament/event-engine';

// POST /api/tournaments/[id]/matches/[matchId]/result — registra marcador (admin). Body: { gamesA, gamesB }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; matchId: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { matchId } = await params;
  try {
    const body = await request.json();
    const gamesA = body?.gamesA;
    const gamesB = body?.gamesB;
    if (!Number.isInteger(gamesA) || !Number.isInteger(gamesB) || gamesA < 0 || gamesB < 0) {
      return NextResponse.json({ error: 'Marcador inválido' }, { status: 400 });
    }
    await recordResult(db, matchId, gamesA, gamesB);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al registrar el resultado' }, { status: 500 });
  }
}
```

> Nota: la ruta de generate ya no llama a `pozo-engine` directamente; el guard pozo-americano<4 se mantiene aquí (a nivel de ruta) porque la fachada no lo lanza. El guard `kind!=='pozo'` desaparece (ahora ambos kinds se generan).

- [ ] **Step 7: Verify**

Run: `npm test` (toda la suite verde, incluye torneo-run + event-engine).
Run: `npx eslint src/lib/tournament/event-engine.ts "src/app/api/tournaments/[id]/generate/route.ts" "src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts"` → 0 errores.

- [ ] **Step 8: Commit**

```bash
git add src/lib/tournament/event-engine.ts src/lib/tournament/event-engine.test.ts "src/app/api/tournaments/[id]/generate/route.ts" "src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts"
git commit -m "feat(torneo): fachada event-engine (dispatch por kind) + cablea rutas generate/result"
```

---

## Self-review (cobertura vs. spec)

- **Run single_elim** (cuadro completo, byes auto, scheduling) → Task 1. ✓
- **Run groups_elim** (grupos + liguilla + transición automática con cruces estándar) → Task 2. ✓
- **Resolución del cuadro en lectura** (no se mutan filas) → recordTorneoResult no toca aguas abajo; resolveBracket es del view-model (T2). ✓
- **Scheduler** (liguilla greedy con solapes; cuadro por olas) → Tasks 1-2. ✓
- **Guards** TOO_FEW_PAIRS / GROUP_TOO_SMALL → Tasks 1-2 + mapeo 400 en Task 3. ✓
- **Fachada event-engine dispatch por kind + rutas** → Task 3. ✓
- **Cruces estándar 2×2** documentado y testeado → Task 2 (`crossSeed` + test de transición). ✓
- **NO en este plan (es T2):** `torneo-view`, `<GroupsTable>`, `<BracketView>`, EventPanel torneo, pública `/torneos/[id]`, e2e. ✓
