# Constructor de torneos — Plan 1: Fundamentos (esquema + motor puro)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el esquema de datos del torneo (tablas independientes) y el motor de lógica pura (helpers de tiempo, planificador greedy y motor del pozo) con tests, sin UI ni acceso a DB en la lógica.

**Architecture:** Tablas Drizzle `tournament*` independientes del resto del dominio + endpoint de migración idempotente siguiendo el patrón `migrate-*` del repo. La lógica vive en módulos puros en `src/lib/tournament/` (sin DB), testeables con Vitest. Este plan cubre helpers de tiempo, el planificador y el pozo; el motor de parejas fijas y la API/UI van en planes posteriores.

**Tech Stack:** TypeScript, Drizzle ORM (libSQL/SQLite), Vitest, Next.js 16 route handler para la migración.

**Roadmap de planes (contexto):**
- **Plan 1 (este):** esquema + migración + tipos + helpers de tiempo + planificador + motor del pozo.
- Plan 2: motor de parejas fijas (round-robin, clasificación de grupos, cuadro con byes, propagación) + capa de persistencia/API del torneo.
- Plan 3: UI admin (crear torneo, configurar bloques/parejas/grupos, generar parrilla).
- Plan 4: ejecución del evento (entrada de resultados, avance de rondas del pozo, propagación de cuadro, parrilla editable).
- Plan 5: vista pública de solo lectura.

**Referencia del diseño:** `docs/superpowers/specs/2026-06-13-tournament-builder-design.md`

---

## Estructura de ficheros (este plan)

- Modificar: `src/lib/db/schema.ts` — añadir tablas `tournament*` + tipos inferidos.
- Crear: `src/app/api/migrate-tournaments/route.ts` — migración idempotente.
- Crear: `src/lib/tournament/types.ts` — tipos compartidos del dominio (`MatchFormat`).
- Crear: `src/lib/tournament/time.ts` — conversión HH:MM ↔ minutos.
- Crear: `src/lib/tournament/time.test.ts`
- Crear: `src/lib/tournament/scheduler.ts` — `estimatedMatchMinutes` + `scheduleMatches` (greedy).
- Crear: `src/lib/tournament/scheduler.test.ts`
- Crear: `src/lib/tournament/pozo.ts` — sembrado, emparejamiento por pista, movimiento, descansos, clasificación.
- Crear: `src/lib/tournament/pozo.test.ts`

Convenciones del repo confirmadas: ids `text` con `$defaultFn(() => crypto.randomUUID())`; timestamps `text` con `default(sql\`(datetime('now'))\`)`; tests `*.test.ts` junto al código; alias `@` → `src`; comando de test `npx vitest run <ruta>`.

---

## Task 1: Esquema de tablas del torneo

**Files:**
- Modify: `src/lib/db/schema.ts` (añadir al final, antes del bloque `// ─── TYPES ───`)

- [ ] **Step 1: Añadir las tablas `tournament*`**

Inserta este bloque en `src/lib/db/schema.ts` justo antes de la sección `// ─── TYPES ──────`:

```ts
// ─── TOURNAMENTS (torneos puntuales, independientes del ranking) ─────────────
export const tournaments = sqliteTable('tournaments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  date: text('date').notNull(), // ISO date YYYY-MM-DD
  location: text('location'),
  notes: text('notes'),
  status: text('status').notNull().default('draft'), // 'draft' | 'scheduled' | 'running' | 'completed'
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const tournamentCourts = sqliteTable('tournament_courts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  order: integer('order').notNull(), // 1 = pista más alta (top del pozo)
  availableFrom: text('available_from').notNull(), // "HH:MM"
  availableTo: text('available_to').notNull(),     // "HH:MM"
});

export const tournamentParticipants = sqliteTable('tournament_participants', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => players.id),
}, (t) => ({
  uniqParticipant: unique().on(t.tournamentId, t.playerId),
}));

export const tournamentBlocks = sqliteTable('tournament_blocks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  order: integer('order').notNull(),
  type: text('type').notNull(), // 'pozo' | 'fixed_pairs'
  name: text('name').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  config: text('config').notNull().default('{}'), // JSON: matchFormat, bufferMinutes, etc.
});

export const tournamentGroups = sqliteTable('tournament_groups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  blockId: text('block_id').notNull().references(() => tournamentBlocks.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
});

export const tournamentPairs = sqliteTable('tournament_pairs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  blockId: text('block_id').notNull().references(() => tournamentBlocks.id, { onDelete: 'cascade' }),
  player1Id: text('player1_id').notNull().references(() => players.id),
  player2Id: text('player2_id').notNull().references(() => players.id),
  seed: integer('seed'),
  label: text('label'),
  groupId: text('group_id').references(() => tournamentGroups.id, { onDelete: 'set null' }),
});

export const tournamentMatches = sqliteTable('tournament_matches', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  blockId: text('block_id').notNull().references(() => tournamentBlocks.id, { onDelete: 'cascade' }),
  courtId: text('court_id').references(() => tournamentCourts.id, { onDelete: 'set null' }),
  round: integer('round').notNull().default(0),
  phaseTag: text('phase_tag'), // 'pozo' | 'group:A' | 'ko:semi' | ...
  scheduledStart: text('scheduled_start'), // "HH:MM" o null
  scheduledEnd: text('scheduled_end'),
  status: text('status').notNull().default('pending'), // 'pending' | 'in_progress' | 'completed'
  // Cuatro huecos de participante (JSON de SlotRef): { type, ... }
  slotA1: text('slot_a1'),
  slotA2: text('slot_a2'),
  slotB1: text('slot_b1'),
  slotB2: text('slot_b2'),
  teamAScore: integer('team_a_score'),
  teamBScore: integer('team_b_score'),
  setsJson: text('sets_json'),
  winner: text('winner'), // 'A' | 'B' | null
});
```

- [ ] **Step 2: Añadir los tipos inferidos**

En la sección `// ─── TYPES ───` de `src/lib/db/schema.ts`, añade al final:

```ts
export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;
export type TournamentCourt = typeof tournamentCourts.$inferSelect;
export type NewTournamentCourt = typeof tournamentCourts.$inferInsert;
export type TournamentParticipant = typeof tournamentParticipants.$inferSelect;
export type NewTournamentParticipant = typeof tournamentParticipants.$inferInsert;
export type TournamentBlock = typeof tournamentBlocks.$inferSelect;
export type NewTournamentBlock = typeof tournamentBlocks.$inferInsert;
export type TournamentGroup = typeof tournamentGroups.$inferSelect;
export type NewTournamentGroup = typeof tournamentGroups.$inferInsert;
export type TournamentPair = typeof tournamentPairs.$inferSelect;
export type NewTournamentPair = typeof tournamentPairs.$inferInsert;
export type TournamentMatch = typeof tournamentMatches.$inferSelect;
export type NewTournamentMatch = typeof tournamentMatches.$inferInsert;
```

- [ ] **Step 3: Verificar que compila TypeScript**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados con `schema.ts` (puede haber avisos preexistentes ajenos; no debe aparecer ninguno en las líneas añadidas).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(tournaments): esquema de tablas del torneo (independiente del ranking)"
```

---

## Task 2: Endpoint de migración idempotente

Crea las tablas en la DB de producción siguiendo el patrón `migrate-*`. Usa `CREATE TABLE IF NOT EXISTS` para idempotencia (el patrón del repo ejecuta DDL crudo).

**Files:**
- Create: `src/app/api/migrate-tournaments/route.ts`

- [ ] **Step 1: Crear el route handler**

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// POST /api/migrate-tournaments — crea las tablas del constructor de torneos.
// Idempotente: CREATE TABLE IF NOT EXISTS.
export async function POST() {
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      location TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS tournament_courts (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      available_from TEXT NOT NULL,
      available_to TEXT NOT NULL
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS tournament_participants (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id),
      UNIQUE(tournament_id, player_id)
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS tournament_blocks (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      "order" INTEGER NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      config TEXT NOT NULL DEFAULT '{}'
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS tournament_groups (
      id TEXT PRIMARY KEY,
      block_id TEXT NOT NULL REFERENCES tournament_blocks(id) ON DELETE CASCADE,
      name TEXT NOT NULL
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS tournament_pairs (
      id TEXT PRIMARY KEY,
      block_id TEXT NOT NULL REFERENCES tournament_blocks(id) ON DELETE CASCADE,
      player1_id TEXT NOT NULL REFERENCES players(id),
      player2_id TEXT NOT NULL REFERENCES players(id),
      seed INTEGER,
      label TEXT,
      group_id TEXT REFERENCES tournament_groups(id) ON DELETE SET NULL
    )`);

    await db.run(sql`CREATE TABLE IF NOT EXISTS tournament_matches (
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
    )`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error en migrate-tournaments', detail: String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/migrate-tournaments/route.ts
git commit -m "feat(tournaments): endpoint de migración idempotente"
```

> Nota: la migración se ejecuta en producción con `curl -X POST https://<host>/api/migrate-tournaments` cuando se despliegue. No es parte de los tests.

---

## Task 3: Tipos compartidos del dominio

**Files:**
- Create: `src/lib/tournament/types.ts`

- [ ] **Step 1: Crear los tipos**

```ts
// Formato de partido configurable por bloque.
export type MatchFormat =
  | { kind: 'timed'; minutes: number; tieRule: 'golden_point' | 'allow_draw' }
  | { kind: 'first_to_set' }
  | { kind: 'games'; target: number }
  | { kind: 'best_of_3' };

// Referencia de un hueco de participante en un partido (se serializa a JSON en DB).
export type SlotRef =
  | { type: 'participant'; participantId: string }
  | { type: 'pair'; pairId: string }
  | { type: 'placeholder'; desc: string }
  | { type: 'matchWinner'; matchId: string }
  | { type: 'matchLoser'; matchId: string };
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tournament/types.ts
git commit -m "feat(tournaments): tipos del dominio (MatchFormat, SlotRef)"
```

---

## Task 4: Helpers de tiempo (HH:MM ↔ minutos)

**Files:**
- Create: `src/lib/tournament/time.ts`
- Test: `src/lib/tournament/time.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { hhmmToMin, minToHHMM } from './time';

describe('time helpers', () => {
  it('convierte HH:MM a minutos desde medianoche', () => {
    expect(hhmmToMin('17:00')).toBe(17 * 60);
    expect(hhmmToMin('18:30')).toBe(18 * 60 + 30);
    expect(hhmmToMin('00:00')).toBe(0);
  });

  it('convierte minutos a HH:MM con cero a la izquierda', () => {
    expect(minToHHMM(17 * 60)).toBe('17:00');
    expect(minToHHMM(18 * 60 + 30)).toBe('18:30');
    expect(minToHHMM(9 * 60 + 5)).toBe('09:05');
  });

  it('es ida y vuelta', () => {
    expect(minToHHMM(hhmmToMin('20:45'))).toBe('20:45');
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/time.test.ts`
Expected: FAIL — `hhmmToMin`/`minToHHMM` no existen.

- [ ] **Step 3: Implementar**

```ts
// Conversión entre "HH:MM" y minutos desde medianoche.
export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/time.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/time.ts src/lib/tournament/time.test.ts
git commit -m "feat(tournaments): helpers de tiempo HH:MM<->min"
```

---

## Task 5: Duración estimada de partido

**Files:**
- Create: `src/lib/tournament/scheduler.ts`
- Test: `src/lib/tournament/scheduler.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { estimatedMatchMinutes } from './scheduler';
import type { MatchFormat } from './types';

describe('estimatedMatchMinutes', () => {
  it('usa los minutos exactos en formato cronometrado', () => {
    const f: MatchFormat = { kind: 'timed', minutes: 25, tieRule: 'golden_point' };
    expect(estimatedMatchMinutes(f)).toBe(25);
  });

  it('estima ~20 min para "hasta un set"', () => {
    expect(estimatedMatchMinutes({ kind: 'first_to_set' })).toBe(20);
  });

  it('estima por nº de juegos objetivo (~3.5 min/juego, mínimo 15)', () => {
    expect(estimatedMatchMinutes({ kind: 'games', target: 6 })).toBe(21);
    expect(estimatedMatchMinutes({ kind: 'games', target: 3 })).toBe(15);
  });

  it('estima ~40 min al mejor de 3', () => {
    expect(estimatedMatchMinutes({ kind: 'best_of_3' })).toBe(40);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/scheduler.test.ts`
Expected: FAIL — `estimatedMatchMinutes` no existe.

- [ ] **Step 3: Implementar (solo esta función por ahora)**

```ts
import type { MatchFormat } from './types';

// Duración estimada de juego (sin buffer) para planificar la parrilla.
export function estimatedMatchMinutes(format: MatchFormat): number {
  switch (format.kind) {
    case 'timed':
      return format.minutes;
    case 'first_to_set':
      return 20;
    case 'games':
      return Math.max(15, Math.round(format.target * 3.5));
    case 'best_of_3':
      return 40;
  }
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/scheduler.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/scheduler.ts src/lib/tournament/scheduler.test.ts
git commit -m "feat(tournaments): estimatedMatchMinutes por formato"
```

---

## Task 6: Planificador greedy con ventanas de pista

Coloca partidos independientes en huecos de pista respetando: ventana de cada pista, sin solape del mismo participante, y duración de hueco fija (`estimadaDelFormato + buffer`). Estrategia: para cada partido (en el orden dado), busca el primer instante posible sobre cualquier pista donde la pista esté libre y ninguno de sus participantes esté ocupado; si no cabe en ninguna ventana, va a `unscheduled`.

**Files:**
- Modify: `src/lib/tournament/scheduler.ts`
- Modify: `src/lib/tournament/scheduler.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade al final de `src/lib/tournament/scheduler.test.ts`:

```ts
import { scheduleMatches } from './scheduler';
import type { CourtWindow, ScheduleItem } from './scheduler';

describe('scheduleMatches', () => {
  const courts: CourtWindow[] = [
    { courtId: 'c1', order: 1, fromMin: 17 * 60, toMin: 18 * 60 + 30 }, // 17:00-18:30
    { courtId: 'c2', order: 2, fromMin: 17 * 60, toMin: 20 * 60 },      // 17:00-20:00 (más larga)
  ];

  it('coloca cada partido en el primer hueco libre sin solapar participantes', () => {
    // 30 min por hueco. Partidos con participantes disjuntos pueden ir en paralelo.
    const items: ScheduleItem[] = [
      { matchId: 'm1', players: ['p1', 'p2', 'p3', 'p4'] },
      { matchId: 'm2', players: ['p5', 'p6', 'p7', 'p8'] },
    ];
    const res = scheduleMatches(items, courts, 30);
    expect(res.unscheduled).toEqual([]);
    // m1 → c1 17:00, m2 → c2 17:00 (en paralelo, distintos participantes)
    const m1 = res.scheduled.find((s) => s.matchId === 'm1')!;
    const m2 = res.scheduled.find((s) => s.matchId === 'm2')!;
    expect(m1.startMin).toBe(17 * 60);
    expect(m2.startMin).toBe(17 * 60);
    expect(m1.courtId).not.toBe(m2.courtId);
  });

  it('no solapa a un jugador que repite en dos partidos: el segundo va más tarde', () => {
    const items: ScheduleItem[] = [
      { matchId: 'm1', players: ['p1', 'p2', 'p3', 'p4'] },
      { matchId: 'm2', players: ['p1', 'p5', 'p6', 'p7'] }, // p1 repite
    ];
    const res = scheduleMatches(items, courts, 30);
    expect(res.unscheduled).toEqual([]);
    const m1 = res.scheduled.find((s) => s.matchId === 'm1')!;
    const m2 = res.scheduled.find((s) => s.matchId === 'm2')!;
    expect(m2.startMin).toBeGreaterThanOrEqual(m1.endMin);
  });

  it('respeta la ventana corta: lo que no cabe queda sin planificar', () => {
    // Solo una pista corta de 17:00-17:45 → 1 hueco de 30 min (17:00-17:30). Dos partidos con p1 común.
    const shortCourt: CourtWindow[] = [{ courtId: 'c1', order: 1, fromMin: 17 * 60, toMin: 17 * 60 + 45 }];
    const items: ScheduleItem[] = [
      { matchId: 'm1', players: ['p1', 'p2', 'p3', 'p4'] },
      { matchId: 'm2', players: ['p1', 'p5', 'p6', 'p7'] },
    ];
    const res = scheduleMatches(items, shortCourt, 30);
    expect(res.scheduled.map((s) => s.matchId)).toEqual(['m1']);
    expect(res.unscheduled).toEqual(['m2']);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/scheduler.test.ts`
Expected: FAIL — `scheduleMatches`/tipos no existen.

- [ ] **Step 3: Implementar**

Añade al final de `src/lib/tournament/scheduler.ts`:

```ts
export interface CourtWindow {
  courtId: string;
  order: number;   // 1 = pista más alta
  fromMin: number; // minutos desde medianoche
  toMin: number;
}

export interface ScheduleItem {
  matchId: string;
  players: string[]; // participantIds implicados (para detectar solapes)
}

export interface ScheduledMatch {
  matchId: string;
  courtId: string;
  startMin: number;
  endMin: number;
}

export interface ScheduleResult {
  scheduled: ScheduledMatch[];
  unscheduled: string[];
}

// Planificador greedy. Coloca cada partido en el primer instante posible sobre alguna
// pista, sin que ningún participante juegue dos partidos a la vez. slotMinutes = duración
// estimada del partido + buffer.
export function scheduleMatches(
  items: ScheduleItem[],
  courts: CourtWindow[],
  slotMinutes: number,
): ScheduleResult {
  const scheduled: ScheduledMatch[] = [];
  const unscheduled: string[] = [];

  // Ocupación por pista: lista de [start, end) ya asignados.
  const courtBusy = new Map<string, Array<[number, number]>>();
  courts.forEach((c) => courtBusy.set(c.courtId, []));
  // Ocupación por participante: lista de [start, end).
  const playerBusy = new Map<string, Array<[number, number]>>();

  const overlaps = (intervals: Array<[number, number]> | undefined, start: number, end: number) =>
    !!intervals && intervals.some(([s, e]) => start < e && s < end);

  // Ordena pistas por inicio y luego por 'order' para preferir las mejores antes.
  const sortedCourts = [...courts].sort((a, b) => a.fromMin - b.fromMin || a.order - b.order);

  for (const item of items) {
    let placed: ScheduledMatch | null = null;
    // Candidatos de inicio: para cada pista, prueba instantes desde su inicio hasta que cabe.
    // Recoge todos los candidatos válidos y elige el de inicio más temprano (desempate: order).
    let best: { court: CourtWindow; start: number } | null = null;
    for (const court of sortedCourts) {
      for (let start = court.fromMin; start + slotMinutes <= court.toMin; start += slotMinutes) {
        const end = start + slotMinutes;
        if (overlaps(courtBusy.get(court.courtId), start, end)) continue;
        if (item.players.some((p) => overlaps(playerBusy.get(p), start, end))) continue;
        if (!best || start < best.start || (start === best.start && court.order < best.court.order)) {
          best = { court, start };
        }
        break; // primer hueco libre de esta pista; pasamos a la siguiente
      }
    }
    if (best) {
      const end = best.start + slotMinutes;
      placed = { matchId: item.matchId, courtId: best.court.courtId, startMin: best.start, endMin: end };
      courtBusy.get(best.court.courtId)!.push([best.start, end]);
      item.players.forEach((p) => {
        const arr = playerBusy.get(p) ?? [];
        arr.push([best!.start, end]);
        playerBusy.set(p, arr);
      });
    }
    if (placed) scheduled.push(placed);
    else unscheduled.push(item.matchId);
  }

  return { scheduled, unscheduled };
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/scheduler.test.ts`
Expected: PASS (7 tests en el fichero).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/scheduler.ts src/lib/tournament/scheduler.test.ts
git commit -m "feat(tournaments): planificador greedy con ventanas de pista y sin solapes"
```

---

## Task 7: Pozo — sembrado inicial en pistas

Reparte los participantes en pistas de 4. Las pistas se llenan en orden (pista 1 = top). Los sobrantes (`n % 4`) quedan en `resting`.

**Files:**
- Create: `src/lib/tournament/pozo.ts`
- Test: `src/lib/tournament/pozo.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { seedPozoCourts } from './pozo';

describe('seedPozoCourts', () => {
  it('reparte en pistas de 4 en orden, sin sobrantes', () => {
    const r = seedPozoCourts(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 2);
    expect(r.courts).toEqual([
      ['a', 'b', 'c', 'd'],
      ['e', 'f', 'g', 'h'],
    ]);
    expect(r.resting).toEqual([]);
  });

  it('deja los sobrantes en resting', () => {
    const r = seedPozoCourts(['a', 'b', 'c', 'd', 'e', 'f'], 2);
    expect(r.courts).toEqual([['a', 'b', 'c', 'd']]);
    expect(r.resting).toEqual(['e', 'f']);
  });

  it('no crea más pistas de las que hay jugadores para llenar', () => {
    const r = seedPozoCourts(['a', 'b', 'c', 'd', 'e'], 3);
    expect(r.courts).toEqual([['a', 'b', 'c', 'd']]);
    expect(r.resting).toEqual(['e']);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/pozo.test.ts`
Expected: FAIL — `seedPozoCourts` no existe.

- [ ] **Step 3: Implementar**

```ts
export interface PozoRound {
  // courts[i] = 4 participantIds en la pista de orden i+1 (i=0 es la pista top).
  courts: string[][];
  resting: string[]; // participantes que descansan esta ronda
}

export interface CourtResult {
  winners: [string, string];
  losers: [string, string];
}

// Siembra inicial: llena pistas de 4 en orden; sobrantes a resting; no crea pistas vacías.
export function seedPozoCourts(participantIds: string[], numCourts: number): PozoRound {
  const fillable = Math.min(numCourts, Math.floor(participantIds.length / 4));
  const courts: string[][] = [];
  for (let i = 0; i < fillable; i++) {
    courts.push(participantIds.slice(i * 4, i * 4 + 4));
  }
  const resting = participantIds.slice(fillable * 4);
  return { courts, resting };
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/pozo.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo.ts src/lib/tournament/pozo.test.ts
git commit -m "feat(tournaments): pozo - sembrado inicial en pistas"
```

---

## Task 8: Pozo — emparejamiento 2v2 dentro de la pista

Cada ronda, los 4 de una pista rotan su emparejamiento entre las 3 combinaciones posibles, según el número de ronda. Posiciones de la pista: `[0,1,2,3]`.
- ronda 0 → (0,1) vs (2,3)
- ronda 1 → (0,2) vs (1,3)
- ronda 2 → (0,3) vs (1,2)
- ronda 3 → vuelve a (0,1) vs (2,3) … (módulo 3)

**Files:**
- Modify: `src/lib/tournament/pozo.ts`
- Modify: `src/lib/tournament/pozo.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade a `src/lib/tournament/pozo.test.ts`:

```ts
import { courtPairing } from './pozo';

describe('courtPairing', () => {
  const court = ['p0', 'p1', 'p2', 'p3'];

  it('ronda 0: (0,1) vs (2,3)', () => {
    expect(courtPairing(court, 0)).toEqual({ teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] });
  });
  it('ronda 1: (0,2) vs (1,3)', () => {
    expect(courtPairing(court, 1)).toEqual({ teamA: ['p0', 'p2'], teamB: ['p1', 'p3'] });
  });
  it('ronda 2: (0,3) vs (1,2)', () => {
    expect(courtPairing(court, 2)).toEqual({ teamA: ['p0', 'p3'], teamB: ['p1', 'p2'] });
  });
  it('ronda 3 vuelve al patrón de la ronda 0 (módulo 3)', () => {
    expect(courtPairing(court, 3)).toEqual({ teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] });
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/pozo.test.ts`
Expected: FAIL — `courtPairing` no existe.

- [ ] **Step 3: Implementar**

Añade a `src/lib/tournament/pozo.ts`:

```ts
// Las 3 combinaciones de pareja posibles sobre las posiciones [0,1,2,3] de la pista.
const PAIRING_PATTERNS: Array<[[number, number], [number, number]]> = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

// Emparejamiento 2v2 de una pista según el número de ronda (rota cada ronda).
export function courtPairing(
  courtPlayers: string[],
  roundNumber: number,
): { teamA: [string, string]; teamB: [string, string] } {
  const [a, b] = PAIRING_PATTERNS[roundNumber % PAIRING_PATTERNS.length];
  return {
    teamA: [courtPlayers[a[0]], courtPlayers[a[1]]],
    teamB: [courtPlayers[b[0]], courtPlayers[b[1]]],
  };
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/pozo.test.ts`
Expected: PASS (7 tests en el fichero).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo.ts src/lib/tournament/pozo.test.ts
git commit -m "feat(tournaments): pozo - emparejamiento 2v2 rotativo por ronda"
```

---

## Task 9: Pozo — movimiento entre pistas (suben/bajan)

Aplica el movimiento clásico del pozo a partir de los resultados de cada pista (un `CourtResult` por pista, en el mismo orden que `courts`):
- Pista top (índice 0): ganadores se quedan, perdedores bajan a la pista 1.
- Pista intermedia k: ganadores suben a k-1, perdedores bajan a k+1.
- Pista fondo (última): ganadores suben, perdedores se quedan.

Cada pista resultante recibe exactamente 4. Dentro de cada pista resultante, el orden es: primero los que llegan de arriba (perdedores de k-1), luego los que llegan de abajo (ganadores de k+1), con los "stayers" del top/fondo en su sitio. Para este task, los participantes que descansaban se mantienen en `resting` sin cambios (la rotación de descansos es el Task 10).

**Files:**
- Modify: `src/lib/tournament/pozo.ts`
- Modify: `src/lib/tournament/pozo.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade a `src/lib/tournament/pozo.test.ts`:

```ts
import { nextPozoRound } from './pozo';
import type { CourtResult } from './pozo';

describe('nextPozoRound (movimiento)', () => {
  it('con 3 pistas: ganadores suben, perdedores bajan, top/fondo se quedan', () => {
    const current = {
      courts: [
        ['a', 'b', 'c', 'd'], // pista 1 (top)
        ['e', 'f', 'g', 'h'], // pista 2
        ['i', 'j', 'k', 'l'], // pista 3 (fondo)
      ],
      resting: [] as string[],
    };
    const results: CourtResult[] = [
      { winners: ['a', 'b'], losers: ['c', 'd'] }, // top: a,b se quedan; c,d bajan a pista 2
      { winners: ['e', 'f'], losers: ['g', 'h'] }, // e,f suben a pista 1; g,h bajan a pista 3
      { winners: ['i', 'j'], losers: ['k', 'l'] }, // fondo: i,j suben a pista 2; k,l se quedan
    ];
    const next = nextPozoRound(current, results);
    // Pista 1: stayers top (a,b) + ganadores de pista 2 (e,f)
    expect(next.courts[0]).toEqual(['a', 'b', 'e', 'f']);
    // Pista 2: perdedores de pista 1 (c,d) + ganadores de pista 3 (i,j)
    expect(next.courts[1]).toEqual(['c', 'd', 'i', 'j']);
    // Pista 3 (fondo): perdedores de pista 2 (g,h) + stayers fondo (k,l)
    expect(next.courts[2]).toEqual(['g', 'h', 'k', 'l']);
    expect(next.resting).toEqual([]);
  });

  it('con 1 pista: ganadores y perdedores se quedan (sin movimiento)', () => {
    const current = { courts: [['a', 'b', 'c', 'd']], resting: [] as string[] };
    const results: CourtResult[] = [{ winners: ['a', 'b'], losers: ['c', 'd'] }];
    const next = nextPozoRound(current, results);
    expect(next.courts[0]).toEqual(['a', 'b', 'c', 'd']);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/pozo.test.ts`
Expected: FAIL — `nextPozoRound` no existe.

- [ ] **Step 3: Implementar**

Añade a `src/lib/tournament/pozo.ts`:

```ts
// Aplica el movimiento clásico del pozo. results[i] corresponde a current.courts[i].
// No modifica resting (la rotación de descansos se aplica aparte).
export function nextPozoRound(current: PozoRound, results: CourtResult[]): PozoRound {
  const n = current.courts.length;
  // fromAbove[k] = perdedores que bajan desde la pista k-1.
  // fromBelow[k] = ganadores que suben desde la pista k+1.
  const fromAbove: string[][] = Array.from({ length: n }, () => []);
  const fromBelow: string[][] = Array.from({ length: n }, () => []);
  const stayers: string[][] = Array.from({ length: n }, () => []);

  results.forEach((res, k) => {
    const isTop = k === 0;
    const isBottom = k === n - 1;
    // Ganadores: suben (k-1) salvo en el top, donde se quedan.
    if (isTop) stayers[k].push(...res.winners);
    else fromBelow[k - 1].push(...res.winners);
    // Perdedores: bajan (k+1) salvo en el fondo, donde se quedan.
    if (isBottom) stayers[k].push(...res.losers);
    else fromAbove[k + 1].push(...res.losers);
  });

  const courts: string[][] = [];
  for (let k = 0; k < n; k++) {
    // Orden dentro de la pista: stayers-top, perdedores que bajan, ganadores que suben, stayers-fondo.
    // En top: stayers (ganadores) + fromBelow. En fondo: fromAbove + stayers (perdedores).
    courts.push([...stayers[k].slice(0, k === 0 ? 2 : 0), ...fromAbove[k], ...fromBelow[k], ...stayers[k].slice(k === 0 ? 2 : 0)]);
  }
  return { courts, resting: [...current.resting] };
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/pozo.test.ts`
Expected: PASS (9 tests en el fichero).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo.ts src/lib/tournament/pozo.test.ts
git commit -m "feat(tournaments): pozo - movimiento entre pistas (suben/bajan)"
```

---

## Task 10: Pozo — rotación de descansos

Cuando hay jugadores en `resting`, deben turnarse para no descansar siempre los mismos. Regla v1: tras aplicar el movimiento, los que descansaban entran por el fondo intercambiándose con los perdedores de la pista fondo (que pasan a descansar la siguiente ronda). Esto reparte el descanso y mantiene 4 por pista.

Esta función envuelve a `nextPozoRound`: `nextPozoRoundWithRest(current, results)`.

**Files:**
- Modify: `src/lib/tournament/pozo.ts`
- Modify: `src/lib/tournament/pozo.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade a `src/lib/tournament/pozo.test.ts`:

```ts
import { nextPozoRoundWithRest } from './pozo';

describe('nextPozoRoundWithRest (rotación de descansos)', () => {
  it('mete a los que descansaban por el fondo y manda a descansar a los perdedores del fondo', () => {
    const current = {
      courts: [
        ['a', 'b', 'c', 'd'], // top
        ['e', 'f', 'g', 'h'], // fondo
      ],
      resting: ['x', 'y'],
    };
    const results: CourtResult[] = [
      { winners: ['a', 'b'], losers: ['c', 'd'] },
      { winners: ['e', 'f'], losers: ['g', 'h'] }, // g,h son perdedores del fondo
    ];
    const next = nextPozoRoundWithRest(current, results);
    // Tras el movimiento puro, el fondo sería [g,h, <stayers fondo>]; aquí los stayers del
    // fondo (perdedores) son g,h. Entran x,y y descansan g,h.
    expect(next.resting).toEqual(['g', 'h']);
    // El fondo ya no contiene a g,h; contiene a x,y en su lugar.
    expect(next.courts[next.courts.length - 1]).not.toContain('g');
    expect(next.courts[next.courts.length - 1]).not.toContain('h');
    expect(next.courts[next.courts.length - 1]).toContain('x');
    expect(next.courts[next.courts.length - 1]).toContain('y');
    // Cada pista mantiene 4.
    next.courts.forEach((c) => expect(c).toHaveLength(4));
  });

  it('sin descansos, se comporta como nextPozoRound', () => {
    const current = { courts: [['a', 'b', 'c', 'd']], resting: [] as string[] };
    const results: CourtResult[] = [{ winners: ['a', 'b'], losers: ['c', 'd'] }];
    expect(nextPozoRoundWithRest(current, results)).toEqual({ courts: [['a', 'b', 'c', 'd']], resting: [] });
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/pozo.test.ts`
Expected: FAIL — `nextPozoRoundWithRest` no existe.

- [ ] **Step 3: Implementar**

Añade a `src/lib/tournament/pozo.ts`:

```ts
// Aplica el movimiento y rota los descansos: los que descansaban entran por la pista fondo
// y los últimos 'resting.length' de la pista fondo pasan a descansar la siguiente ronda.
export function nextPozoRoundWithRest(current: PozoRound, results: CourtResult[]): PozoRound {
  const moved = nextPozoRound(current, results);
  const restCount = current.resting.length;
  if (restCount === 0 || moved.courts.length === 0) return moved;

  const bottomIdx = moved.courts.length - 1;
  const bottom = moved.courts[bottomIdx];
  // Salen a descansar los 'restCount' del final del fondo; entran los que descansaban.
  const goRest = bottom.slice(bottom.length - restCount);
  const staying = bottom.slice(0, bottom.length - restCount);
  moved.courts[bottomIdx] = [...staying, ...current.resting];
  moved.resting = goRest;
  return moved;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/pozo.test.ts`
Expected: PASS (11 tests en el fichero).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo.ts src/lib/tournament/pozo.test.ts
git commit -m "feat(tournaments): pozo - rotación de descansos por el fondo"
```

---

## Task 11: Pozo — clasificación final

Calcula la clasificación a partir del historial de rondas jugadas. Criterio v1: **juegos ganados acumulados** (sumando el `score` del participante en cada partido), desempate por **número de victorias**. Entrada: lista de resultados de partido del pozo, cada uno con los 4 participantes, sus juegos y el ganador.

**Files:**
- Modify: `src/lib/tournament/pozo.ts`
- Modify: `src/lib/tournament/pozo.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade a `src/lib/tournament/pozo.test.ts`:

```ts
import { pozoStandings } from './pozo';
import type { PozoMatchResult } from './pozo';

describe('pozoStandings', () => {
  it('ordena por juegos ganados, desempata por victorias', () => {
    const results: PozoMatchResult[] = [
      // ronda 1, pista 1: (a,b) 6 - 2 (c,d) → ganan a,b
      { teamA: ['a', 'b'], teamB: ['c', 'd'], gamesA: 6, gamesB: 2, winner: 'A' },
      // ronda 2, pista 1: (a,c) 4 - 6 (b,d) → ganan b,d
      { teamA: ['a', 'c'], teamB: ['b', 'd'], gamesA: 4, gamesB: 6, winner: 'B' },
    ];
    const table = pozoStandings(['a', 'b', 'c', 'd'], results);
    // juegos: a=6+4=10, b=6+6=12, c=2+4=6, d=2+6=8
    // victorias: a=1, b=2, c=0, d=1
    expect(table.map((r) => r.participantId)).toEqual(['b', 'a', 'd', 'c']);
    expect(table[0]).toMatchObject({ participantId: 'b', games: 12, wins: 2, rank: 1 });
    expect(table[3]).toMatchObject({ participantId: 'c', games: 6, wins: 0, rank: 4 });
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/pozo.test.ts`
Expected: FAIL — `pozoStandings`/`PozoMatchResult` no existen.

- [ ] **Step 3: Implementar**

Añade a `src/lib/tournament/pozo.ts`:

```ts
export interface PozoMatchResult {
  teamA: [string, string];
  teamB: [string, string];
  gamesA: number;
  gamesB: number;
  winner: 'A' | 'B';
}

export interface PozoStanding {
  participantId: string;
  games: number;
  wins: number;
  rank: number;
}

// Clasificación del pozo: por juegos ganados (desc), desempate por victorias (desc).
export function pozoStandings(participantIds: string[], results: PozoMatchResult[]): PozoStanding[] {
  const games = new Map<string, number>();
  const wins = new Map<string, number>();
  participantIds.forEach((p) => { games.set(p, 0); wins.set(p, 0); });

  for (const r of results) {
    const winners = r.winner === 'A' ? r.teamA : r.teamB;
    for (const p of r.teamA) games.set(p, (games.get(p) ?? 0) + r.gamesA);
    for (const p of r.teamB) games.set(p, (games.get(p) ?? 0) + r.gamesB);
    for (const p of winners) wins.set(p, (wins.get(p) ?? 0) + 1);
  }

  const table = participantIds.map((participantId) => ({
    participantId,
    games: games.get(participantId) ?? 0,
    wins: wins.get(participantId) ?? 0,
    rank: 0,
  }));
  table.sort((a, b) => b.games - a.games || b.wins - a.wins);
  table.forEach((row, i) => { row.rank = i + 1; });
  return table;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/pozo.test.ts`
Expected: PASS (12 tests en el fichero).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo.ts src/lib/tournament/pozo.test.ts
git commit -m "feat(tournaments): pozo - clasificación final por juegos y victorias"
```

---

## Task 12: Verificación final del plan

- [ ] **Step 1: Ejecutar toda la suite de tournament**

Run: `npx vitest run src/lib/tournament`
Expected: PASS — todos los tests de `time`, `scheduler` y `pozo`.

- [ ] **Step 2: Comprobar tipos del proyecto**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos introducidos por este plan.

- [ ] **Step 3: Lint**

Run: `npx eslint src/lib/tournament src/app/api/migrate-tournaments`
Expected: sin errores.

---

## Self-review (cubierto en este plan vs. spec)

- **Esquema independiente** (todas las tablas `tournament*`, sin tocar `matches`/Elo): Tasks 1–2. ✓
- **Una ventana por pista**: columnas `available_from`/`available_to`; `CourtWindow` en scheduler. ✓
- **Formato de partido configurable + estimación de duración**: `MatchFormat` (Task 3) + `estimatedMatchMinutes` (Task 5). ✓
- **Planificador greedy con ventanas heterogéneas y sin solape de jugador + viabilidad (`unscheduled`)**: Task 6. ✓
- **Pozo: sembrado, emparejamiento rotativo, movimiento suben/bajan, descansos no múltiplo de 4, clasificación**: Tasks 7–11. ✓
- **`SlotRef` / placeholders para el cuadro** (definidos como tipo aquí; su uso en cuadro va en Plan 2): Task 3. ✓

**Fuera de este plan (planes posteriores):** motor de parejas fijas (round-robin, clasificación de grupos, cuadro con byes, propagación), persistencia/API, UI admin, ejecución de resultados y vista pública. Recogidos en el roadmap del encabezado.
