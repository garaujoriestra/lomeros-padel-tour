# Constructor de torneos — Plan 2: Motor de parejas fijas (puro)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el motor de lógica pura para bloques de parejas fijas: calendario round-robin de grupo, clasificación de grupo, generación de cuadro eliminatorio con siembra y byes, y propagación de ganadores por el cuadro.

**Architecture:** Módulo puro `src/lib/tournament/fixed-pairs.ts` (sin acceso a DB), testeable con Vitest, en el mismo estilo que el motor del pozo del Plan 1. Reutiliza el tipo `SlotRef` de `src/lib/tournament/types.ts` (extendido con una variante `bye`) para representar los huecos del cuadro y permitir dibujar el cuadro completo con placeholders que se rellenan según los resultados.

**Tech Stack:** TypeScript, Vitest. Sin dependencias nuevas.

**Roadmap de planes (contexto):**
- Plan 1 (hecho): esquema + migración + tipos + helpers de tiempo + planificador + motor del pozo.
- **Plan 2 (este):** motor puro de parejas fijas (round-robin, clasificación de grupos, cuadro con byes, propagación).
- Plan 3: capa de persistencia/API del torneo (crear/configurar, generar parrilla llamando al scheduler, registrar resultados).
- Plan 4: UI admin (crear torneo, configurar bloques/parejas/grupos, parrilla editable).
- Plan 5: vista pública de solo lectura.

**Referencia del diseño:** `docs/superpowers/specs/2026-06-13-tournament-builder-design.md`
**Plan previo:** `docs/superpowers/plans/2026-06-13-tournament-builder-foundation.md`

---

## Estructura de ficheros (este plan)

- Modificar: `src/lib/tournament/types.ts` — añadir la variante `{ type: 'bye' }` a `SlotRef`.
- Crear: `src/lib/tournament/fixed-pairs.ts` — round-robin, clasificación, cuadro y propagación.
- Crear: `src/lib/tournament/fixed-pairs.test.ts` — tests.

Convenciones (confirmadas en Plan 1): tests `*.test.ts` junto al código; alias `@` → `src`; ejecutar tests con `npx vitest run <ruta>`. Mantener TODOS los `import` consolidados al principio del fichero de test (no esparcir imports entre `describe` para evitar avisos de lint `import/first`).

**Decisiones de reglas (fijadas en este plan, configurables en el futuro si hace falta):**
- Puntos de clasificación de grupo: victoria = 3, empate = 1, derrota = 0.
- Desempate de grupo: puntos desc → diferencia de juegos desc → juegos a favor desc → `pairId` asc (determinista).
- Los empates solo son posibles en partidos a tiempo con `tieRule: 'allow_draw'`; el cuadro eliminatorio nunca admite empate (lo garantiza la capa que registra resultados, no este motor).
- Siembra del cuadro: orden estándar de bracket; los byes se asignan a los mejores sembrados. La siembra (orden de la lista de parejas) la decide el admin; este motor solo la consume.

---

## Task 1: Round-robin de grupo (método del círculo)

Genera el calendario todos-contra-todos de un grupo. Con número impar de parejas, una descansa cada ronda (no se emite partido). Rondas numeradas desde 0.

**Files:**
- Create: `src/lib/tournament/fixed-pairs.ts`
- Test: `src/lib/tournament/fixed-pairs.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { roundRobinSchedule } from './fixed-pairs';

describe('roundRobinSchedule', () => {
  it('4 parejas: 3 rondas, 6 partidos, todos contra todos', () => {
    const matches = roundRobinSchedule(['p1', 'p2', 'p3', 'p4']);
    expect(matches).toEqual([
      { round: 0, pairA: 'p1', pairB: 'p4' },
      { round: 0, pairA: 'p2', pairB: 'p3' },
      { round: 1, pairA: 'p1', pairB: 'p3' },
      { round: 1, pairA: 'p4', pairB: 'p2' },
      { round: 2, pairA: 'p1', pairB: 'p2' },
      { round: 2, pairA: 'p3', pairB: 'p4' },
    ]);
  });

  it('3 parejas (impar): 3 partidos, cada una juega 2, una descansa por ronda', () => {
    const matches = roundRobinSchedule(['p1', 'p2', 'p3']);
    expect(matches).toEqual([
      { round: 0, pairA: 'p2', pairB: 'p3' },
      { round: 1, pairA: 'p1', pairB: 'p3' },
      { round: 2, pairA: 'p1', pairB: 'p2' },
    ]);
  });

  it('menos de 2 parejas: sin partidos', () => {
    expect(roundRobinSchedule(['p1'])).toEqual([]);
    expect(roundRobinSchedule([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/fixed-pairs.test.ts`
Expected: FAIL — `roundRobinSchedule` no existe.

- [ ] **Step 3: Implementar**

```ts
export interface RoundRobinMatch {
  round: number;
  pairA: string;
  pairB: string;
}

const BYE = '__BYE__';

// Calendario todos-contra-todos por el método del círculo. Con impar, añade un hueco
// fantasma (BYE) que hace descansar a una pareja por ronda (no se emite partido).
export function roundRobinSchedule(pairIds: string[]): RoundRobinMatch[] {
  if (pairIds.length < 2) return [];
  let arr = [...pairIds];
  if (arr.length % 2 !== 0) arr.push(BYE);
  const n = arr.length;
  const half = n / 2;
  const matches: RoundRobinMatch[] = [];
  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== BYE && b !== BYE) matches.push({ round, pairA: a, pairB: b });
    }
    // Rota dejando fijo el primer elemento.
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return matches;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/fixed-pairs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/fixed-pairs.ts src/lib/tournament/fixed-pairs.test.ts
git commit -m "feat(tournaments): round-robin de grupo (método del círculo)"
```

---

## Task 2: Clasificación de grupo

Calcula la tabla de un grupo a partir de los resultados. Puntos: victoria 3, empate 1, derrota 0. Orden: puntos desc → diferencia de juegos desc → juegos a favor desc → `pairId` asc.

**Files:**
- Modify: `src/lib/tournament/fixed-pairs.ts`
- Modify: `src/lib/tournament/fixed-pairs.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade el import `groupStandings` al bloque de imports del principio del fichero de test, junto con el tipo `PairMatchResult`:

```ts
import { roundRobinSchedule, groupStandings } from './fixed-pairs';
import type { PairMatchResult } from './fixed-pairs';
```

(reemplaza la línea de import existente de `roundRobinSchedule` por la combinada de arriba). Y añade este bloque al final del fichero:

```ts
describe('groupStandings', () => {
  it('ordena por puntos, luego diferencia de juegos, luego juegos a favor', () => {
    const results: PairMatchResult[] = [
      { pairA: 'p1', pairB: 'p2', gamesA: 6, gamesB: 2, winner: 'A' }, // p1 gana
      { pairA: 'p1', pairB: 'p3', gamesA: 6, gamesB: 4, winner: 'A' }, // p1 gana
      { pairA: 'p2', pairB: 'p3', gamesA: 6, gamesB: 3, winner: 'A' }, // p2 gana
    ];
    const table = groupStandings(['p1', 'p2', 'p3'], results);
    // p1: 2W 6pts, dif=(12-6)=+6 ; p2: 1W1L 3pts, dif=(8-9)=-1 ; p3: 2L 0pts, dif=(7-12)=-5
    expect(table.map((r) => r.pairId)).toEqual(['p1', 'p2', 'p3']);
    expect(table[0]).toMatchObject({ pairId: 'p1', played: 2, wins: 2, draws: 0, losses: 0, gamesFor: 12, gamesAgainst: 6, gameDiff: 6, points: 6, rank: 1 });
    expect(table[1]).toMatchObject({ pairId: 'p2', wins: 1, losses: 1, points: 3, gameDiff: -1, rank: 2 });
    expect(table[2]).toMatchObject({ pairId: 'p3', wins: 0, losses: 2, points: 0, rank: 3 });
  });

  it('cuenta empates con 1 punto', () => {
    const results: PairMatchResult[] = [
      { pairA: 'a', pairB: 'b', gamesA: 5, gamesB: 5, winner: 'draw' },
    ];
    const table = groupStandings(['a', 'b'], results);
    expect(table[0]).toMatchObject({ played: 1, wins: 0, draws: 1, losses: 0, points: 1 });
    expect(table[1]).toMatchObject({ played: 1, draws: 1, points: 1 });
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/fixed-pairs.test.ts`
Expected: FAIL — `groupStandings`/`PairMatchResult` no existen.

- [ ] **Step 3: Implementar**

Añade a `src/lib/tournament/fixed-pairs.ts`:

```ts
export interface PairMatchResult {
  pairA: string;
  pairB: string;
  gamesA: number;
  gamesB: number;
  winner: 'A' | 'B' | 'draw';
}

export interface GroupStanding {
  pairId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gamesFor: number;
  gamesAgainst: number;
  gameDiff: number;
  points: number;
  rank: number;
}

// Clasificación de grupo. Victoria 3, empate 1, derrota 0. Desempate: puntos,
// diferencia de juegos, juegos a favor, y pairId asc para ser determinista.
export function groupStandings(pairIds: string[], results: PairMatchResult[]): GroupStanding[] {
  const rows = new Map<string, GroupStanding>();
  for (const pairId of pairIds) {
    rows.set(pairId, {
      pairId, played: 0, wins: 0, draws: 0, losses: 0,
      gamesFor: 0, gamesAgainst: 0, gameDiff: 0, points: 0, rank: 0,
    });
  }

  const apply = (pairId: string, gf: number, ga: number, outcome: 'win' | 'draw' | 'loss') => {
    const row = rows.get(pairId);
    if (!row) return;
    row.played += 1;
    row.gamesFor += gf;
    row.gamesAgainst += ga;
    if (outcome === 'win') { row.wins += 1; row.points += 3; }
    else if (outcome === 'draw') { row.draws += 1; row.points += 1; }
    else { row.losses += 1; }
  };

  for (const r of results) {
    if (r.winner === 'A') {
      apply(r.pairA, r.gamesA, r.gamesB, 'win');
      apply(r.pairB, r.gamesB, r.gamesA, 'loss');
    } else if (r.winner === 'B') {
      apply(r.pairA, r.gamesA, r.gamesB, 'loss');
      apply(r.pairB, r.gamesB, r.gamesA, 'win');
    } else {
      apply(r.pairA, r.gamesA, r.gamesB, 'draw');
      apply(r.pairB, r.gamesB, r.gamesA, 'draw');
    }
  }

  const table = [...rows.values()];
  table.forEach((row) => { row.gameDiff = row.gamesFor - row.gamesAgainst; });
  table.sort((a, b) =>
    b.points - a.points ||
    b.gameDiff - a.gameDiff ||
    b.gamesFor - a.gamesFor ||
    a.pairId.localeCompare(b.pairId),
  );
  table.forEach((row, i) => { row.rank = i + 1; });
  return table;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/fixed-pairs.test.ts`
Expected: PASS (5 tests en el fichero).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/fixed-pairs.ts src/lib/tournament/fixed-pairs.test.ts
git commit -m "feat(tournaments): clasificación de grupo (puntos + desempates)"
```

---

## Task 3: Variante `bye` en SlotRef + orden de siembra

Añade la variante `bye` al tipo `SlotRef` (para huecos del cuadro sin rival) y el helper `seedOrder` que devuelve el orden estándar de siembra de un bracket de tamaño potencia de 2 (índices de cabeza de serie, base 0).

**Files:**
- Modify: `src/lib/tournament/types.ts`
- Modify: `src/lib/tournament/fixed-pairs.ts`
- Modify: `src/lib/tournament/fixed-pairs.test.ts`

- [ ] **Step 1: Añadir la variante `bye` a `SlotRef`**

En `src/lib/tournament/types.ts`, modifica `SlotRef` para que quede así (añade la línea `bye`):

```ts
// Referencia de un hueco de participante en un partido (se serializa a JSON en DB).
export type SlotRef =
  | { type: 'participant'; participantId: string }
  | { type: 'pair'; pairId: string }
  | { type: 'placeholder'; desc: string }
  | { type: 'matchWinner'; matchId: string }
  | { type: 'matchLoser'; matchId: string }
  | { type: 'bye' };
```

- [ ] **Step 2: Escribir el test que falla para `seedOrder`**

Añade `seedOrder` al import combinado del principio del fichero de test:

```ts
import { roundRobinSchedule, groupStandings, seedOrder } from './fixed-pairs';
```

Y añade este bloque al final del fichero:

```ts
describe('seedOrder', () => {
  it('tamaño 2: [0,1]', () => {
    expect(seedOrder(2)).toEqual([0, 1]);
  });
  it('tamaño 4: [0,3,1,2]', () => {
    expect(seedOrder(4)).toEqual([0, 3, 1, 2]);
  });
  it('tamaño 8: orden estándar de 8', () => {
    expect(seedOrder(8)).toEqual([0, 7, 3, 4, 1, 6, 2, 5]);
  });
});
```

- [ ] **Step 3: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/fixed-pairs.test.ts`
Expected: FAIL — `seedOrder` no existe.

- [ ] **Step 4: Implementar `seedOrder`**

Añade a `src/lib/tournament/fixed-pairs.ts`:

```ts
// Orden estándar de siembra de un bracket de tamaño potencia de 2 (base 0).
// Empareja cabezas de serie altas con bajas en cada ronda. Ej. tamaño 4 -> [0,3,1,2].
export function seedOrder(size: number): number[] {
  let seeds = [0, 1];
  while (seeds.length < size) {
    const sum = seeds.length * 2 - 1; // suma de cada par de sembrados (base 0)
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}
```

- [ ] **Step 5: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/fixed-pairs.test.ts`
Expected: PASS (8 tests en el fichero).

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (el único preexistente y ajeno es `web-push` en `src/lib/push/send.ts`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/tournament/types.ts src/lib/tournament/fixed-pairs.ts src/lib/tournament/fixed-pairs.test.ts
git commit -m "feat(tournaments): SlotRef bye + orden de siembra del cuadro"
```

---

## Task 4: Generar el cuadro eliminatorio (con byes)

A partir de una lista de parejas ya sembradas (en orden de siembra), genera todos los partidos del cuadro. El tamaño se redondea a la potencia de 2 superior; los huecos sobrantes son byes que recaen en los mejores sembrados. Los partidos de ronda 0 tienen huecos `pair`/`bye`; las rondas siguientes tienen huecos `matchWinner` referenciando los dos partidos que les alimentan.

**Files:**
- Modify: `src/lib/tournament/fixed-pairs.ts`
- Modify: `src/lib/tournament/fixed-pairs.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade `generateBracket` al import combinado y el tipo `BracketMatch`:

```ts
import { roundRobinSchedule, groupStandings, seedOrder, generateBracket } from './fixed-pairs';
import type { PairMatchResult, BracketMatch } from './fixed-pairs';
```

(combina con los imports existentes; deja un único import de valores y un único `import type` al principio). Añade este bloque al final:

```ts
describe('generateBracket', () => {
  it('4 parejas, sin byes: 2 partidos de ronda 0 + final', () => {
    const bracket = generateBracket(['A', 'B', 'C', 'D']);
    expect(bracket).toEqual<BracketMatch[]>([
      { matchId: 'r0m0', round: 0, slotA: { type: 'pair', pairId: 'A' }, slotB: { type: 'pair', pairId: 'D' } },
      { matchId: 'r0m1', round: 0, slotA: { type: 'pair', pairId: 'B' }, slotB: { type: 'pair', pairId: 'C' } },
      { matchId: 'r1m0', round: 1, slotA: { type: 'matchWinner', matchId: 'r0m0' }, slotB: { type: 'matchWinner', matchId: 'r0m1' } },
    ]);
  });

  it('3 parejas: el mejor sembrado recibe bye en ronda 0', () => {
    const bracket = generateBracket(['A', 'B', 'C']);
    // tamaño 4, orden [0,3,1,2]: m0 = seed0(A) vs seed3(bye), m1 = seed1(B) vs seed2(C)
    expect(bracket).toEqual<BracketMatch[]>([
      { matchId: 'r0m0', round: 0, slotA: { type: 'pair', pairId: 'A' }, slotB: { type: 'bye' } },
      { matchId: 'r0m1', round: 0, slotA: { type: 'pair', pairId: 'B' }, slotB: { type: 'pair', pairId: 'C' } },
      { matchId: 'r1m0', round: 1, slotA: { type: 'matchWinner', matchId: 'r0m0' }, slotB: { type: 'matchWinner', matchId: 'r0m1' } },
    ]);
  });

  it('menos de 2 parejas: cuadro vacío', () => {
    expect(generateBracket(['A'])).toEqual([]);
    expect(generateBracket([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/fixed-pairs.test.ts`
Expected: FAIL — `generateBracket`/`BracketMatch` no existen.

- [ ] **Step 3: Implementar**

Añade a `src/lib/tournament/fixed-pairs.ts` (importa `SlotRef` al principio del fichero):

```ts
import type { SlotRef } from './types';

export interface BracketMatch {
  matchId: string;
  round: number;
  slotA: SlotRef;
  slotB: SlotRef;
}

// Genera el cuadro completo a partir de parejas ya sembradas (en orden de siembra).
// Tamaño = potencia de 2 superior; los byes recaen en los mejores sembrados.
export function generateBracket(seededPairIds: string[]): BracketMatch[] {
  const numPairs = seededPairIds.length;
  if (numPairs < 2) return [];

  let size = 1;
  while (size < numPairs) size *= 2;

  const order = seedOrder(size);
  const matches: BracketMatch[] = [];

  // Ronda 0: size/2 partidos con huecos pair/bye según la siembra.
  const seedToSlot = (seedIdx: number): SlotRef =>
    seedIdx < numPairs ? { type: 'pair', pairId: seededPairIds[seedIdx] } : { type: 'bye' };

  for (let i = 0; i < size / 2; i++) {
    matches.push({
      matchId: `r0m${i}`,
      round: 0,
      slotA: seedToSlot(order[2 * i]),
      slotB: seedToSlot(order[2 * i + 1]),
    });
  }

  // Rondas siguientes: cada partido lo alimentan dos partidos de la ronda anterior.
  let round = 1;
  let prevCount = size / 2;
  while (prevCount > 1) {
    const count = prevCount / 2;
    for (let i = 0; i < count; i++) {
      matches.push({
        matchId: `r${round}m${i}`,
        round,
        slotA: { type: 'matchWinner', matchId: `r${round - 1}m${2 * i}` },
        slotB: { type: 'matchWinner', matchId: `r${round - 1}m${2 * i + 1}` },
      });
    }
    prevCount = count;
    round += 1;
  }

  return matches;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/fixed-pairs.test.ts`
Expected: PASS (11 tests en el fichero).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/fixed-pairs.ts src/lib/tournament/fixed-pairs.test.ts
git commit -m "feat(tournaments): generación del cuadro eliminatorio con siembra y byes"
```

---

## Task 5: Propagar ganadores por el cuadro

Dada la estructura del cuadro y un mapa de resultados (`matchId → 'A' | 'B'`), resuelve los huecos `matchWinner` a la pareja concreta cuando ya se conoce, y calcula el ganador de cada partido. Los byes avanzan automáticamente (sin resultado). Se procesa por rondas para que los partidos anteriores estén resueltos antes que los posteriores.

**Files:**
- Modify: `src/lib/tournament/fixed-pairs.ts`
- Modify: `src/lib/tournament/fixed-pairs.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade `resolveBracket` al import combinado y el tipo `ResolvedBracketMatch`:

```ts
import { roundRobinSchedule, groupStandings, seedOrder, generateBracket, resolveBracket } from './fixed-pairs';
import type { PairMatchResult, BracketMatch, ResolvedBracketMatch } from './fixed-pairs';
```

Añade este bloque al final:

```ts
describe('resolveBracket', () => {
  it('un bye avanza solo; un ganador propaga a la siguiente ronda', () => {
    const bracket = generateBracket(['A', 'B', 'C']); // A tiene bye en r0m0
    // B gana a C en r0m1 (B es slotA -> 'A')
    const results = new Map<string, 'A' | 'B'>([['r0m1', 'A']]);
    const resolved = resolveBracket(bracket, results);
    const byId = new Map(resolved.map((m) => [m.matchId, m]));

    // r0m0: A vs bye -> A gana automáticamente
    expect(byId.get('r0m0')!.winnerPairId).toBe('A');
    // r0m1: B gana a C
    expect(byId.get('r0m1')!.winnerPairId).toBe('B');
    // final r1m0: huecos resueltos a A y B, sin ganador aún
    expect(byId.get('r1m0')!.slotA).toEqual({ type: 'pair', pairId: 'A' });
    expect(byId.get('r1m0')!.slotB).toEqual({ type: 'pair', pairId: 'B' });
    expect(byId.get('r1m0')!.winnerPairId).toBeUndefined();
  });

  it('al cerrar la final, devuelve el campeón', () => {
    const bracket = generateBracket(['A', 'B', 'C']);
    const results = new Map<string, 'A' | 'B'>([
      ['r0m1', 'A'], // B gana a C
      ['r1m0', 'B'], // en la final, slotB (B) gana a slotA (A)
    ]);
    const resolved = resolveBracket(bracket, results);
    const final = resolved.find((m) => m.matchId === 'r1m0')!;
    expect(final.winnerPairId).toBe('B');
  });

  it('hueco no resuelto se queda como matchWinner', () => {
    const bracket = generateBracket(['A', 'B', 'C', 'D']);
    const resolved = resolveBracket(bracket, new Map());
    const final = resolved.find((m) => m.matchId === 'r1m0')!;
    expect(final.slotA).toEqual({ type: 'matchWinner', matchId: 'r0m0' });
    expect(final.winnerPairId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/fixed-pairs.test.ts`
Expected: FAIL — `resolveBracket`/`ResolvedBracketMatch` no existen.

- [ ] **Step 3: Implementar**

Añade a `src/lib/tournament/fixed-pairs.ts`:

```ts
export interface ResolvedBracketMatch {
  matchId: string;
  round: number;
  slotA: SlotRef;
  slotB: SlotRef;
  winnerPairId?: string; // ganador resuelto si ya se conoce (incluye avance por bye)
}

// Resuelve los huecos matchWinner a la pareja concreta cuando se conoce, y calcula el
// ganador de cada partido. Los byes avanzan sin resultado. Procesa por rondas crecientes.
export function resolveBracket(
  bracket: BracketMatch[],
  results: Map<string, 'A' | 'B'>,
): ResolvedBracketMatch[] {
  const winnerByMatch = new Map<string, string>(); // matchId -> pairId ganador

  const resolveSlot = (slot: SlotRef): SlotRef => {
    if (slot.type === 'matchWinner') {
      const w = winnerByMatch.get(slot.matchId);
      return w ? { type: 'pair', pairId: w } : slot;
    }
    return slot;
  };

  const sorted = [...bracket].sort((a, b) => a.round - b.round);
  const out: ResolvedBracketMatch[] = [];

  for (const m of sorted) {
    const slotA = resolveSlot(m.slotA);
    const slotB = resolveSlot(m.slotB);
    const aPair = slotA.type === 'pair' ? slotA.pairId : undefined;
    const bPair = slotB.type === 'pair' ? slotB.pairId : undefined;
    const aBye = slotA.type === 'bye';
    const bBye = slotB.type === 'bye';

    let winnerPairId: string | undefined;
    if (aPair && bBye) winnerPairId = aPair;
    else if (bPair && aBye) winnerPairId = bPair;
    else if (aPair && bPair) {
      const res = results.get(m.matchId);
      if (res === 'A') winnerPairId = aPair;
      else if (res === 'B') winnerPairId = bPair;
    }

    if (winnerPairId) winnerByMatch.set(m.matchId, winnerPairId);
    out.push({ matchId: m.matchId, round: m.round, slotA, slotB, winnerPairId });
  }

  return out;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/fixed-pairs.test.ts`
Expected: PASS (14 tests en el fichero).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/fixed-pairs.ts src/lib/tournament/fixed-pairs.test.ts
git commit -m "feat(tournaments): propagación de ganadores por el cuadro (incl. byes)"
```

---

## Task 6: Verificación final del plan

- [ ] **Step 1: Ejecutar toda la suite de tournament**

Run: `npx vitest run src/lib/tournament`
Expected: PASS — incluye `time`, `scheduler`, `pozo` y `fixed-pairs`.

- [ ] **Step 2: Comprobar tipos del proyecto**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (solo el preexistente y ajeno de `web-push`).

- [ ] **Step 3: Lint**

Run: `npx eslint src/lib/tournament`
Expected: sin errores.

---

## Self-review (cubierto en este plan vs. spec)

- **Round-robin de grupo** (liguilla todos-contra-todos, incluido nº impar de parejas): Task 1. ✓
- **Clasificación de grupo** (puntos, diferencia de juegos, desempates deterministas): Task 2. ✓
- **Cuadro eliminatorio con byes** cuando el nº de parejas no es potencia de 2, byes a los mejores sembrados: Tasks 3–4. ✓
- **Siembra a mano consumida por el motor** (lista ordenada de parejas → cuadro): Task 4. ✓
- **Propagación de ganadores** por el cuadro y avance automático por bye: Task 5. ✓
- **Reutiliza `SlotRef`** del Plan 1 (extendido con `bye`) para los huecos del cuadro y placeholders: Task 3. ✓

**Fuera de este plan (planes posteriores):** persistencia/API (crear torneo, generar parrilla con el scheduler, registrar resultados que alimentan `groupStandings`/`resolveBracket`), UI admin y vista pública. La conexión "clasificación de grupos → siembra del cuadro" la hace el admin a mano (decisión del spec); este motor solo provee `groupStandings` (de dónde salen los clasificados) y `generateBracket` (que consume el orden de siembra que fije el admin).
