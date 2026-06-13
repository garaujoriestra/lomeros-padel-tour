# Constructor de torneos — Plan 3: Orquestador de generación (puro)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el orquestador puro que, a partir de la configuración de un torneo (bloques + pistas), produce la lista completa de partidos con su pista, hora, ronda, fase y huecos de participante — componiendo el motor del pozo, el de parejas fijas y el planificador.

**Architecture:** Módulo puro `src/lib/tournament/generate.ts` (sin DB), testeable con Vitest, que reutiliza `pozo.ts`, `fixed-pairs.ts`, `scheduler.ts` y `time.ts` del Plan 1/2. Produce descriptores de partido (`GenMatch`) listos para que la capa de persistencia (Plan 4) los guarde en `tournament_matches`. El pozo se pre-dibuja por rondas (ronda 0 con participantes concretos, rondas siguientes con huecos a rellenar en vivo); las parejas fijas generan liguilla (parejas concretas) y cuadro (con placeholders cuando viene de grupos), repartidos en el tiempo del bloque.

**Tech Stack:** TypeScript, Vitest. Sin dependencias nuevas.

**Roadmap de planes (contexto):**
- Plan 1 (hecho): esquema + migración + tipos + tiempo + planificador + motor del pozo.
- Plan 2 (hecho): motor puro de parejas fijas (round-robin, grupos, cuadro, propagación).
- **Plan 3 (este):** orquestador de generación puro (config → parrilla de partidos).
- Plan 4: persistencia/API (crear/configurar torneo, guardar la parrilla generada, registrar resultados) con harness de DB en memoria.
- Plan 5: UI admin (crear/configurar/parrilla editable).
- Plan 6: vista pública de solo lectura.

**Referencia del diseño:** `docs/superpowers/specs/2026-06-13-tournament-builder-design.md`
**Planes previos:** `docs/superpowers/plans/2026-06-13-tournament-builder-foundation.md`, `docs/superpowers/plans/2026-06-13-tournament-builder-fixed-pairs.md`

---

## Estructura de ficheros (este plan)

- Modificar: `src/lib/tournament/fixed-pairs.ts` — extraer `buildBracket(rankedLeaves)` (DRY) y que `generateBracket` delegue en él (mismo comportamiento). Permite construir cuadros con hojas placeholder, no solo parejas concretas.
- Modificar: `src/lib/tournament/fixed-pairs.test.ts` — un test de `buildBracket` con hojas placeholder.
- Crear: `src/lib/tournament/generate.ts` — el orquestador.
- Crear: `src/lib/tournament/generate.test.ts` — tests.

Convenciones (confirmadas en Plan 1/2): tests `*.test.ts` junto al código; alias `@` → `src`; `npx vitest run <ruta>`; imports consolidados al principio del fichero de test.

**Decisiones de v1 (documentadas; refinables más adelante):**
- El orquestador trabaja en **minutos desde medianoche** (usa `hhmmToMin`/`minToHHMM` de `time.ts` en los bordes; aquí todo es numérico). La capa de persistencia convierte a "HH:MM".
- **Pozo:** usa `min(floor(participantes/4), nº de pistas)` pistas, ordenadas por `order`. Nº de rondas = `floor(duración / roundMinutes)`. Ronda 0 con participantes concretos (sembrado + emparejamiento 2v2); rondas siguientes pre-dibujadas con huecos `null` (se rellenan al cerrar cada ronda, en Plan 4/5). Todas las pistas juegan a la vez por ronda.
- **Parejas fijas — liguilla:** round-robin por grupo (parejas concretas), repartido con el planificador greedy dentro de la ventana del bloque (conflicto por `pairId`).
- **Parejas fijas — cuadro:** si el bloque tiene grupos, las hojas del cuadro son **placeholders** ("1º Grupo A"…); si es solo cuadro, son las parejas concretas en el orden de siembra del admin. El cuadro se reparte por rondas **después** de la fase de grupos (o desde el inicio del bloque si no hay grupos), una ronda por bloque de tiempo consecutivo, distribuyendo entre pistas por `order`. Esta planificación del cuadro asume que las pistas siguen disponibles (no revalida ventana por hueco); si se sale del bloque, emite aviso.
- **Avisos de viabilidad** (`warnings`): partidos de liguilla que no caben en la ventana, o cuadro que se sale del tiempo del bloque.
- **Distribución de clasificados → cuadro:** orden por ronda intercalando grupos: `[1ºG1, 1ºG2, …, 1ºGk, 2ºG1, …]`. Separación perfecta entre mismos grupos no garantizada en v1 (aceptable).

---

## Task 1: Extraer `buildBracket` (cuadro desde hojas arbitrarias)

Refactor DRY: `buildBracket(rankedLeaves)` construye el cuadro a partir de hojas ya ordenadas por siembra (cada hoja es un `SlotRef`: pareja concreta o placeholder). `generateBracket(seededPairIds)` pasa a delegar en él. Comportamiento de `generateBracket` idéntico (los tests existentes deben seguir verdes).

**Files:**
- Modify: `src/lib/tournament/fixed-pairs.ts`
- Modify: `src/lib/tournament/fixed-pairs.test.ts`

- [ ] **Step 1: Añadir el test que falla para `buildBracket`**

Añade `buildBracket` al import combinado de valores del principio del fichero de test:

```ts
import { roundRobinSchedule, groupStandings, seedOrder, generateBracket, resolveBracket, buildBracket } from './fixed-pairs';
```

Y añade este bloque al final del fichero:

```ts
describe('buildBracket', () => {
  it('acepta hojas placeholder y rellena con bye al mejor sembrado', () => {
    const leaves = [
      { type: 'placeholder', desc: '1º A' } as const,
      { type: 'placeholder', desc: '1º B' } as const,
      { type: 'placeholder', desc: '2º A' } as const,
    ];
    const bracket = buildBracket(leaves); // tamaño 4, orden [0,3,1,2]
    expect(bracket).toEqual<BracketMatch[]>([
      { matchId: 'r0m0', round: 0, slotA: { type: 'placeholder', desc: '1º A' }, slotB: { type: 'bye' } },
      { matchId: 'r0m1', round: 0, slotA: { type: 'placeholder', desc: '1º B' }, slotB: { type: 'placeholder', desc: '2º A' } },
      { matchId: 'r1m0', round: 1, slotA: { type: 'matchWinner', matchId: 'r0m0' }, slotB: { type: 'matchWinner', matchId: 'r0m1' } },
    ]);
  });

  it('menos de 2 hojas: cuadro vacío', () => {
    expect(buildBracket([{ type: 'pair', pairId: 'A' }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/fixed-pairs.test.ts`
Expected: FAIL — `buildBracket` no existe.

- [ ] **Step 3: Refactorizar**

En `src/lib/tournament/fixed-pairs.ts`, sustituye la función `generateBracket` actual por estas dos (mantén la interfaz `BracketMatch` y el comentario del invariante de byes dentro de `buildBracket`):

```ts
// Construye el cuadro a partir de hojas ya ordenadas por siembra (hoja i = sembrado i).
// Rellena con byes hasta la potencia de 2. Las hojas pueden ser parejas concretas o placeholders.
export function buildBracket(rankedLeaves: SlotRef[]): BracketMatch[] {
  const count = rankedLeaves.length;
  if (count < 2) return [];

  let size = 1;
  while (size < count) size *= 2;

  const order = seedOrder(size);
  const matches: BracketMatch[] = [];

  // Los byes recaen en los peores sembrados (índices >= count). Como `size` es la menor
  // potencia de 2 >= count, hay menos de size/2 byes, y en el orden de siembra cada par de
  // posiciones suma size-1, por lo que nunca se emparejan dos byes en el mismo partido.
  const leafForSeed = (s: number): SlotRef => (s < count ? rankedLeaves[s] : { type: 'bye' });

  for (let i = 0; i < size / 2; i++) {
    matches.push({
      matchId: `r0m${i}`,
      round: 0,
      slotA: leafForSeed(order[2 * i]),
      slotB: leafForSeed(order[2 * i + 1]),
    });
  }

  let round = 1;
  let prevCount = size / 2;
  while (prevCount > 1) {
    const c = prevCount / 2;
    for (let i = 0; i < c; i++) {
      matches.push({
        matchId: `r${round}m${i}`,
        round,
        slotA: { type: 'matchWinner', matchId: `r${round - 1}m${2 * i}` },
        slotB: { type: 'matchWinner', matchId: `r${round - 1}m${2 * i + 1}` },
      });
    }
    prevCount = c;
    round += 1;
  }

  return matches;
}

// Genera el cuadro a partir de parejas ya sembradas (en orden de siembra).
export function generateBracket(seededPairIds: string[]): BracketMatch[] {
  return buildBracket(seededPairIds.map((pairId) => ({ type: 'pair', pairId })));
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/fixed-pairs.test.ts`
Expected: PASS (17 tests — los 15 previos + 2 nuevos de `buildBracket`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/fixed-pairs.ts src/lib/tournament/fixed-pairs.test.ts
git commit -m "refactor(tournaments): extrae buildBracket (cuadro desde hojas arbitrarias)"
```

---

## Task 2: Tipos del orquestador + reparto del pozo

Define los tipos de entrada/salida y `layoutPozo`, que pre-dibuja todas las rondas del pozo.

**Files:**
- Create: `src/lib/tournament/generate.ts`
- Test: `src/lib/tournament/generate.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { layoutPozo } from './generate';
import type { GenPozoBlock, GenCourt } from './generate';

const courts: GenCourt[] = [
  { courtId: 'c1', order: 1, fromMin: 17 * 60, toMin: 20 * 60 },
  { courtId: 'c2', order: 2, fromMin: 17 * 60, toMin: 20 * 60 },
];

describe('layoutPozo', () => {
  it('ronda 0 concreta + rondas siguientes con huecos null, una franja por ronda y pista', () => {
    const block: GenPozoBlock = {
      blockId: 'b1', type: 'pozo', startMin: 17 * 60, durationMinutes: 45,
      matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' }, bufferMinutes: 0,
      roundMinutes: 15, participantIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
    };
    const matches = layoutPozo(block, courts);
    // 8 jugadores -> 2 pistas; 45/15 = 3 rondas -> 2 pistas * 3 rondas = 6 partidos
    expect(matches).toHaveLength(6);

    // Ronda 0, pista 1 (order 1 -> c1): seedPozoCourts pone [p1,p2,p3,p4] en pista 0;
    // courtPairing ronda 0 -> (p1,p2) vs (p3,p4).
    const r0c1 = matches.find((m) => m.round === 0 && m.courtId === 'c1')!;
    expect(r0c1).toMatchObject({
      blockId: 'b1', phaseTag: 'pozo', round: 0, startMin: 17 * 60, endMin: 17 * 60 + 15,
      slotA1: { type: 'participant', participantId: 'p1' },
      slotA2: { type: 'participant', participantId: 'p2' },
      slotB1: { type: 'participant', participantId: 'p3' },
      slotB2: { type: 'participant', participantId: 'p4' },
    });

    // Ronda 1: huecos a null, hora corrida.
    const r1c1 = matches.find((m) => m.round === 1 && m.courtId === 'c1')!;
    expect(r1c1).toMatchObject({ startMin: 17 * 60 + 15, endMin: 17 * 60 + 30, slotA1: null, slotB1: null });
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/generate.test.ts`
Expected: FAIL — `layoutPozo`/tipos no existen.

- [ ] **Step 3: Implementar**

> Importaciones incrementales: este Task solo importa lo que usa `layoutPozo`. Las Tareas 4 y 5 añadirán los imports del scheduler y de fixed-pairs cuando hagan falta (no los añadas ahora o quedarán imports sin usar).

```ts
import type { MatchFormat, SlotRef } from './types';
import { seedPozoCourts, courtPairing } from './pozo';

export interface GenCourt {
  courtId: string;
  order: number;   // 1 = pista más alta
  fromMin: number; // minutos desde medianoche
  toMin: number;
}

interface GenBlockBase {
  blockId: string;
  startMin: number;          // inicio del bloque (minutos desde medianoche)
  durationMinutes: number;
  matchFormat: MatchFormat;
  bufferMinutes: number;
}

export interface GenPozoBlock extends GenBlockBase {
  type: 'pozo';
  roundMinutes: number;
  participantIds: string[];  // orden de sembrado en las pistas
}

export interface GenFixedPairsBlock extends GenBlockBase {
  type: 'fixed_pairs';
  groups: { groupId: string; name: string; pairIds: string[] }[]; // vacío si solo cuadro
  knockout: boolean;
  advancePerGroup: number;   // cuántos pasan por grupo (si hay grupos)
  knockoutSeeds: string[];   // parejas sembradas (si NO hay grupos)
}

export type GenBlock = GenPozoBlock | GenFixedPairsBlock;

export interface GenMatch {
  blockId: string;
  courtId: string | null;
  round: number;
  phaseTag: string;
  startMin: number | null;
  endMin: number | null;
  slotA1: SlotRef | null;
  slotA2: SlotRef | null;
  slotB1: SlotRef | null;
  slotB2: SlotRef | null;
}

export interface GenResult {
  matches: GenMatch[];
  warnings: string[];
}

// Pre-dibuja todas las rondas del pozo. Ronda 0 con participantes concretos; rondas
// siguientes con huecos null (se rellenan en vivo al cerrar cada ronda). Todas las pistas
// juegan a la vez por ronda.
export function layoutPozo(block: GenPozoBlock, courts: GenCourt[]): GenMatch[] {
  const sortedCourts = [...courts].sort((a, b) => a.order - b.order);
  const numCourts = Math.min(sortedCourts.length, Math.floor(block.participantIds.length / 4));
  const numRounds = Math.floor(block.durationMinutes / block.roundMinutes);
  if (numCourts < 1 || numRounds < 1) return [];

  const seeded = seedPozoCourts(block.participantIds, numCourts);
  const matches: GenMatch[] = [];

  for (let round = 0; round < numRounds; round++) {
    const startMin = block.startMin + round * block.roundMinutes;
    const endMin = startMin + block.roundMinutes;
    for (let courtIdx = 0; courtIdx < numCourts; courtIdx++) {
      const courtId = sortedCourts[courtIdx].courtId;
      if (round === 0) {
        const { teamA, teamB } = courtPairing(seeded.courts[courtIdx], 0);
        matches.push({
          blockId: block.blockId, courtId, round, phaseTag: 'pozo', startMin, endMin,
          slotA1: { type: 'participant', participantId: teamA[0] },
          slotA2: { type: 'participant', participantId: teamA[1] },
          slotB1: { type: 'participant', participantId: teamB[0] },
          slotB2: { type: 'participant', participantId: teamB[1] },
        });
      } else {
        matches.push({
          blockId: block.blockId, courtId, round, phaseTag: 'pozo', startMin, endMin,
          slotA1: null, slotA2: null, slotB1: null, slotB2: null,
        });
      }
    }
  }
  return matches;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/generate.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/generate.ts src/lib/tournament/generate.test.ts
git commit -m "feat(tournaments): orquestador - tipos + reparto del pozo por rondas"
```

---

## Task 3: Hojas de clasificados para el cuadro (placeholders)

`qualifierSeeds(groups, advancePerGroup)` produce las hojas del cuadro (en orden de siembra) cuando el cuadro viene de grupos: intercala posiciones por grupo (`1ºG1, 1ºG2, …, 2ºG1, …`).

**Files:**
- Modify: `src/lib/tournament/generate.ts`
- Modify: `src/lib/tournament/generate.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade `qualifierSeeds` al import de `./generate` en el fichero de test:

```ts
import { layoutPozo, qualifierSeeds } from './generate';
```

Y añade este bloque:

```ts
describe('qualifierSeeds', () => {
  it('intercala posiciones por grupo: 1º de cada grupo, luego 2º de cada grupo', () => {
    const groups = [
      { groupId: 'g1', name: 'A', pairIds: ['a1', 'a2', 'a3'] },
      { groupId: 'g2', name: 'B', pairIds: ['b1', 'b2', 'b3'] },
    ];
    expect(qualifierSeeds(groups, 2)).toEqual([
      { type: 'placeholder', desc: '1º A' },
      { type: 'placeholder', desc: '1º B' },
      { type: 'placeholder', desc: '2º A' },
      { type: 'placeholder', desc: '2º B' },
    ]);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/generate.test.ts`
Expected: FAIL — `qualifierSeeds` no existe.

- [ ] **Step 3: Implementar**

Añade a `src/lib/tournament/generate.ts`:

```ts
// Hojas del cuadro (en orden de siembra) cuando los clasificados salen de grupos.
// Intercala por posición: 1º de cada grupo, luego 2º de cada grupo, etc.
export function qualifierSeeds(
  groups: { groupId: string; name: string; pairIds: string[] }[],
  advancePerGroup: number,
): SlotRef[] {
  const leaves: SlotRef[] = [];
  for (let pos = 1; pos <= advancePerGroup; pos++) {
    for (const group of groups) {
      leaves.push({ type: 'placeholder', desc: `${pos}º ${group.name}` });
    }
  }
  return leaves;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/generate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/generate.ts src/lib/tournament/generate.test.ts
git commit -m "feat(tournaments): hojas de clasificados (placeholders) para el cuadro"
```

---

## Task 4: Reparto de la liguilla (round-robin) en pistas

`layoutGroups(block, courts)` genera los partidos round-robin de todos los grupos (parejas concretas) y los reparte con el planificador greedy dentro de la ventana del bloque. Devuelve los partidos, el minuto en que acaba la fase de grupos y avisos de lo que no cabe.

**Files:**
- Modify: `src/lib/tournament/generate.ts`
- Modify: `src/lib/tournament/generate.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade `layoutGroups` al import de `./generate` y el tipo `GenFixedPairsBlock`:

```ts
import { layoutPozo, qualifierSeeds, layoutGroups } from './generate';
import type { GenPozoBlock, GenCourt, GenFixedPairsBlock } from './generate';
```

Y añade este bloque:

```ts
describe('layoutGroups', () => {
  it('reparte la liguilla en pistas sin solapar parejas y reporta el fin de fase', () => {
    const block: GenFixedPairsBlock = {
      blockId: 'b2', type: 'fixed_pairs', startMin: 17 * 60, durationMinutes: 120,
      matchFormat: { kind: 'timed', minutes: 20, tieRule: 'golden_point' }, bufferMinutes: 0,
      groups: [{ groupId: 'g1', name: 'A', pairIds: ['pa', 'pb', 'pc', 'pd'] }],
      knockout: false, advancePerGroup: 2, knockoutSeeds: [],
    };
    const res = layoutGroups(block, courts);
    // Round-robin de 4 parejas = 6 partidos.
    expect(res.matches).toHaveLength(6);
    expect(res.matches.every((m) => m.phaseTag === 'group:A')).toBe(true);
    expect(res.warnings).toEqual([]);
    // Todos quedan planificados (con courtId y hora) en 120 min con 2 pistas y slots de 20.
    expect(res.matches.every((m) => m.courtId !== null && m.startMin !== null)).toBe(true);
    // endMin = mayor endMin de los partidos planificados.
    const maxEnd = Math.max(...res.matches.map((m) => m.endMin!));
    expect(res.endMin).toBe(maxEnd);
    // Cada partido enfrenta dos parejas concretas (slotA1/slotB1 son pares; A2/B2 null).
    const m0 = res.matches[0];
    expect(m0.slotA1).toMatchObject({ type: 'pair' });
    expect(m0.slotA2).toBeNull();
  });

  it('avisa de los partidos que no caben en la ventana', () => {
    const block: GenFixedPairsBlock = {
      blockId: 'b3', type: 'fixed_pairs', startMin: 17 * 60, durationMinutes: 20, // solo 1 slot por pista
      matchFormat: { kind: 'timed', minutes: 20, tieRule: 'golden_point' }, bufferMinutes: 0,
      groups: [{ groupId: 'g1', name: 'A', pairIds: ['pa', 'pb', 'pc', 'pd'] }],
      knockout: false, advancePerGroup: 2, knockoutSeeds: [],
    };
    const res = layoutGroups(block, courts);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toContain('no caben');
  });

  it('sin grupos: vacío y endMin = inicio del bloque', () => {
    const block: GenFixedPairsBlock = {
      blockId: 'b4', type: 'fixed_pairs', startMin: 17 * 60, durationMinutes: 60,
      matchFormat: { kind: 'best_of_3' }, bufferMinutes: 0,
      groups: [], knockout: true, advancePerGroup: 0, knockoutSeeds: ['x', 'y'],
    };
    const res = layoutGroups(block, courts);
    expect(res.matches).toEqual([]);
    expect(res.endMin).toBe(17 * 60);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/generate.test.ts`
Expected: FAIL — `layoutGroups` no existe.

- [ ] **Step 3: Implementar**

Primero añade los imports que faltan al principio de `src/lib/tournament/generate.ts` (junto a los de `./types` y `./pozo`):

```ts
import { estimatedMatchMinutes, scheduleMatches, type CourtWindow, type ScheduleItem } from './scheduler';
import { roundRobinSchedule } from './fixed-pairs';
```

Luego añade:

```ts
export interface GroupLayout {
  matches: GenMatch[];
  endMin: number;     // fin de la fase de grupos (o inicio del bloque si no hay grupos)
  warnings: string[];
}

// Ventana efectiva de cada pista dentro del bloque.
function blockCourtWindows(block: GenBlockBase, courts: GenCourt[]): CourtWindow[] {
  const blockEnd = block.startMin + block.durationMinutes;
  return courts
    .map((c) => ({
      courtId: c.courtId,
      order: c.order,
      fromMin: Math.max(c.fromMin, block.startMin),
      toMin: Math.min(c.toMin, blockEnd),
    }))
    .filter((c) => c.toMin > c.fromMin);
}

// Genera y reparte la liguilla de todos los grupos. Conflicto por pairId (una pareja no
// juega dos partidos a la vez). slotMinutes = duración estimada + buffer.
export function layoutGroups(block: GenFixedPairsBlock, courts: GenCourt[]): GroupLayout {
  if (block.groups.length === 0) {
    return { matches: [], endMin: block.startMin, warnings: [] };
  }

  const slotMinutes = estimatedMatchMinutes(block.matchFormat) + block.bufferMinutes;
  const windows = blockCourtWindows(block, courts);

  // Descriptores intermedios: partido lógico con sus dos parejas y la etiqueta de grupo.
  const logical = block.groups.flatMap((group) =>
    roundRobinSchedule(group.pairIds).map((rr, i) => ({
      key: `${group.groupId}:${i}`,
      phaseTag: `group:${group.name}`,
      round: rr.round,
      pairA: rr.pairA,
      pairB: rr.pairB,
    })),
  );

  const items: ScheduleItem[] = logical.map((l) => ({ matchId: l.key, players: [l.pairA, l.pairB] }));
  const sched = scheduleMatches(items, windows, slotMinutes);
  const placed = new Map(sched.scheduled.map((s) => [s.matchId, s]));

  const matches: GenMatch[] = logical.map((l) => {
    const s = placed.get(l.key);
    return {
      blockId: block.blockId,
      courtId: s ? s.courtId : null,
      round: l.round,
      phaseTag: l.phaseTag,
      startMin: s ? s.startMin : null,
      endMin: s ? s.endMin : null,
      slotA1: { type: 'pair', pairId: l.pairA },
      slotA2: null,
      slotB1: { type: 'pair', pairId: l.pairB },
      slotB2: null,
    };
  });

  const ends = matches.map((m) => m.endMin).filter((e): e is number => e !== null);
  const endMin = ends.length > 0 ? Math.max(...ends) : block.startMin;
  const warnings = sched.unscheduled.length > 0
    ? [`Bloque ${block.blockId}: ${sched.unscheduled.length} partidos de liguilla no caben en la ventana`]
    : [];

  return { matches, endMin, warnings };
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/generate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/generate.ts src/lib/tournament/generate.test.ts
git commit -m "feat(tournaments): reparto de la liguilla en pistas con aviso de viabilidad"
```

---

## Task 5: Reparto del cuadro por rondas

`layoutBracket(leafSlots, block, courts, startMin)` construye el cuadro (con `buildBracket`) y lo reparte por rondas: cada ronda empieza tras acabar la anterior, una franja de `slotMinutes`, distribuyendo los partidos entre pistas por `order`. Avisa si el cuadro se sale del tiempo del bloque.

**Files:**
- Modify: `src/lib/tournament/generate.ts`
- Modify: `src/lib/tournament/generate.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade `layoutBracket` al import de `./generate`:

```ts
import { layoutPozo, qualifierSeeds, layoutGroups, layoutBracket } from './generate';
```

Y añade este bloque:

```ts
describe('layoutBracket', () => {
  const block: GenFixedPairsBlock = {
    blockId: 'b5', type: 'fixed_pairs', startMin: 18 * 60, durationMinutes: 120,
    matchFormat: { kind: 'timed', minutes: 30, tieRule: 'golden_point' }, bufferMinutes: 0,
    groups: [], knockout: true, advancePerGroup: 0, knockoutSeeds: ['A', 'B', 'C', 'D'],
  };

  it('4 parejas: ronda 0 (2 partidos en paralelo) y luego la final, en franjas consecutivas', () => {
    const leaves: import('./types').SlotRef[] = block.knockoutSeeds.map((pairId) => ({ type: 'pair', pairId }));
    const res = layoutBracket(leaves, block, courts, block.startMin);
    expect(res.warnings).toEqual([]);
    expect(res.matches).toHaveLength(3); // 2 de ronda 0 + 1 final

    const r0 = res.matches.filter((m) => m.round === 0);
    expect(r0).toHaveLength(2);
    // Ronda 0 en paralelo: ambos a las 18:00, en pistas distintas.
    expect(r0.every((m) => m.startMin === 18 * 60)).toBe(true);
    expect(new Set(r0.map((m) => m.courtId)).size).toBe(2);
    expect(r0.every((m) => m.phaseTag === 'ko:r0')).toBe(true);

    // La final empieza después de la ronda 0 (18:30).
    const final = res.matches.find((m) => m.round === 1)!;
    expect(final.startMin).toBe(18 * 60 + 30);
    expect(final.phaseTag).toBe('ko:r1');
    expect(final.slotA1).toEqual({ type: 'matchWinner', matchId: 'r0m0' });
  });

  it('avisa si el cuadro se sale del tiempo del bloque', () => {
    const tight: GenFixedPairsBlock = { ...block, durationMinutes: 30 }; // solo cabe 1 franja
    const leaves: import('./types').SlotRef[] = ['A', 'B', 'C', 'D'].map((pairId) => ({ type: 'pair', pairId }));
    const res = layoutBracket(leaves, tight, courts, tight.startMin);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toContain('cuadro');
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/generate.test.ts`
Expected: FAIL — `layoutBracket` no existe.

- [ ] **Step 3: Implementar**

Primero añade `buildBracket` al import de `./fixed-pairs` al principio de `src/lib/tournament/generate.ts`:

```ts
import { roundRobinSchedule, buildBracket } from './fixed-pairs';
```

Luego añade:

```ts
export interface BracketLayout {
  matches: GenMatch[];
  warnings: string[];
}

// Construye y reparte el cuadro por rondas. Cada ronda arranca tras la anterior; los partidos
// de una ronda se distribuyen entre pistas (por order) en franjas de slotMinutes. Asume que las
// pistas siguen disponibles; avisa si se sale del tiempo del bloque.
export function layoutBracket(
  leafSlots: SlotRef[],
  block: GenFixedPairsBlock,
  courts: GenCourt[],
  startMin: number,
): BracketLayout {
  const bracket = buildBracket(leafSlots);
  if (bracket.length === 0) return { matches: [], warnings: [] };

  const slotMinutes = estimatedMatchMinutes(block.matchFormat) + block.bufferMinutes;
  const sortedCourts = [...courts].sort((a, b) => a.order - b.order);
  const numCourts = Math.max(1, sortedCourts.length);

  const rounds = [...new Set(bracket.map((m) => m.round))].sort((a, b) => a - b);
  const matches: GenMatch[] = [];
  let cursor = startMin;

  for (const round of rounds) {
    const inRound = bracket.filter((m) => m.round === round);
    let roundEnd = cursor;
    inRound.forEach((bm, idx) => {
      const courtIdx = idx % numCourts;
      const slot = Math.floor(idx / numCourts);
      const sMin = cursor + slot * slotMinutes;
      const eMin = sMin + slotMinutes;
      if (eMin > roundEnd) roundEnd = eMin;
      matches.push({
        blockId: block.blockId,
        courtId: sortedCourts[courtIdx].courtId,
        round,
        phaseTag: `ko:r${round}`,
        startMin: sMin,
        endMin: eMin,
        slotA1: bm.slotA,
        slotA2: null,
        slotB1: bm.slotB,
        slotB2: null,
      });
    });
    cursor = roundEnd;
  }

  const blockEnd = block.startMin + block.durationMinutes;
  const warnings = cursor > blockEnd
    ? [`Bloque ${block.blockId}: el cuadro no cabe en el tiempo del bloque (acaba a los ${cursor - block.startMin} min, disponible ${block.durationMinutes})`]
    : [];

  return { matches, warnings };
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/generate.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/generate.ts src/lib/tournament/generate.test.ts
git commit -m "feat(tournaments): reparto del cuadro por rondas con aviso de viabilidad"
```

---

## Task 6: Composición — `generateTournament`

Compone todos los bloques (en orden) en una sola parrilla. Para cada bloque: pozo → `layoutPozo`; parejas fijas → `layoutGroups` y, si hay cuadro, `layoutBracket` con las hojas adecuadas (placeholders desde grupos, o parejas sembradas) empezando tras la fase de grupos.

**Files:**
- Modify: `src/lib/tournament/generate.ts`
- Modify: `src/lib/tournament/generate.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade `generateTournament` al import de `./generate` y el tipo `GenBlock`:

```ts
import { layoutPozo, qualifierSeeds, layoutGroups, layoutBracket, generateTournament } from './generate';
import type { GenPozoBlock, GenCourt, GenFixedPairsBlock, GenBlock } from './generate';
```

Y añade este bloque:

```ts
describe('generateTournament', () => {
  it('compone un pozo seguido de un bloque de parejas fijas (grupos + cuadro con placeholders)', () => {
    const blocks: GenBlock[] = [
      {
        blockId: 'pozo1', type: 'pozo', startMin: 17 * 60, durationMinutes: 30,
        matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' }, bufferMinutes: 0,
        roundMinutes: 15, participantIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
      },
      {
        blockId: 'tor1', type: 'fixed_pairs', startMin: 18 * 60, durationMinutes: 120,
        matchFormat: { kind: 'timed', minutes: 20, tieRule: 'golden_point' }, bufferMinutes: 0,
        groups: [
          { groupId: 'gA', name: 'A', pairIds: ['pa', 'pb', 'pc'] },
          { groupId: 'gB', name: 'B', pairIds: ['pd', 'pe', 'pf'] },
        ],
        knockout: true, advancePerGroup: 2, knockoutSeeds: [],
      },
    ];
    const res = generateTournament(blocks, courts);

    // Pozo: 2 pistas * 2 rondas = 4 partidos con phaseTag 'pozo'.
    expect(res.matches.filter((m) => m.phaseTag === 'pozo')).toHaveLength(4);
    // Grupos: round-robin de 3 = 3 partidos por grupo -> 6 partidos group:*.
    expect(res.matches.filter((m) => m.phaseTag.startsWith('group:'))).toHaveLength(6);
    // Cuadro de 4 clasificados (2 por grupo): hojas placeholder; 2 partidos r0 + final.
    const ko = res.matches.filter((m) => m.phaseTag.startsWith('ko:'));
    expect(ko).toHaveLength(3);
    const koR0 = ko.filter((m) => m.phaseTag === 'ko:r0');
    expect(koR0.some((m) => m.slotA1 && m.slotA1.type === 'placeholder')).toBe(true);
  });

  it('cuadro sin grupos usa las parejas sembradas y arranca al inicio del bloque', () => {
    const blocks: GenBlock[] = [{
      blockId: 'koonly', type: 'fixed_pairs', startMin: 19 * 60, durationMinutes: 120,
      matchFormat: { kind: 'timed', minutes: 30, tieRule: 'golden_point' }, bufferMinutes: 0,
      groups: [], knockout: true, advancePerGroup: 0, knockoutSeeds: ['A', 'B', 'C', 'D'],
    }];
    const res = generateTournament(blocks, courts);
    const koR0 = res.matches.filter((m) => m.phaseTag === 'ko:r0');
    expect(koR0).toHaveLength(2);
    expect(koR0.every((m) => m.startMin === 19 * 60)).toBe(true);
    expect(koR0.some((m) => m.slotA1 && m.slotA1.type === 'pair')).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/generate.test.ts`
Expected: FAIL — `generateTournament` no existe.

- [ ] **Step 3: Implementar**

Añade a `src/lib/tournament/generate.ts`:

```ts
// Compone todos los bloques (en orden) en una sola parrilla con avisos de viabilidad.
export function generateTournament(blocks: GenBlock[], courts: GenCourt[]): GenResult {
  const matches: GenMatch[] = [];
  const warnings: string[] = [];

  const ordered = [...blocks].sort((a, b) => a.startMin - b.startMin);

  for (const block of ordered) {
    if (block.type === 'pozo') {
      matches.push(...layoutPozo(block, courts));
      continue;
    }

    // fixed_pairs
    const groupLayout = layoutGroups(block, courts);
    matches.push(...groupLayout.matches);
    warnings.push(...groupLayout.warnings);

    if (block.knockout) {
      const fromGroups = block.groups.length > 0;
      const leaves = fromGroups
        ? qualifierSeeds(block.groups, block.advancePerGroup)
        : block.knockoutSeeds.map((pairId): SlotRef => ({ type: 'pair', pairId }));
      const startMin = fromGroups ? groupLayout.endMin : block.startMin;
      const bracketLayout = layoutBracket(leaves, block, courts, startMin);
      matches.push(...bracketLayout.matches);
      warnings.push(...bracketLayout.warnings);
    }
  }

  return { matches, warnings };
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/generate.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/generate.ts src/lib/tournament/generate.test.ts
git commit -m "feat(tournaments): generateTournament compone bloques en la parrilla"
```

---

## Task 7: Verificación final del plan

- [ ] **Step 1: Ejecutar toda la suite de tournament**

Run: `npx vitest run src/lib/tournament`
Expected: PASS — `time`, `scheduler`, `pozo`, `fixed-pairs` y `generate`.

- [ ] **Step 2: Comprobar tipos del proyecto**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (solo el preexistente y ajeno de `web-push`).

- [ ] **Step 3: Lint**

Run: `npx eslint src/lib/tournament`
Expected: sin errores.

---

## Self-review (cubierto en este plan vs. spec)

- **Generación de la distribución de partidos / parrilla** a partir de jugadores, pistas y bloques: `generateTournament` (Task 6). ✓
- **Pistas con ventanas distintas** respetadas en la liguilla vía `blockCourtWindows` + el planificador: Task 4. ✓
- **Bloques en secuencia con su propio formato**: cada bloque se procesa según su `type`/`matchFormat`: Tasks 2,4,5,6. ✓
- **Pozo pre-dibujado por rondas** (ronda 0 concreta, resto TBD para rellenar en vivo): Task 2. ✓
- **Parejas fijas: liguilla + cuadro con placeholders desde grupos** (o parejas sembradas si solo cuadro): Tasks 3,4,5. ✓
- **Cuadro con byes** reutilizando `buildBracket`: Task 1. ✓
- **Avisos de viabilidad** cuando no cabe en el tiempo: Tasks 4,5. ✓

**Fuera de este plan (planes posteriores):** persistencia (guardar `GenMatch[]` en `tournament_matches`, mapeando `matchId` posicional del cuadro a `phase_tag`), API HTTP, registro de resultados (que alimenta `groupStandings`/`resolveBracket` y la progresión del pozo recalculando las rondas TBD), UI admin y vista pública. La conversión minutos↔"HH:MM" la hace la capa de persistencia con `hhmmToMin`/`minToHHMM`.
