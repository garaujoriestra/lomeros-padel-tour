# Pozo — Plan 2: Motores nuevos (siembra aleatoria + parejas fijas + clasificación por escalera)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir los tres motores puros nuevos del Pozo que el modelo viejo no tenía: siembra **aleatoria determinista**, motor de movimiento de **parejas fijas** (rey de la pista por parejas), y **clasificación por escalera** (la pista en la que acabas), válida para ambas variantes.

**Architecture:** Funciones puras sin DB, en `src/lib/tournament/`, testeadas con vitest. No tocan persistencia ni UI (eso es Plan 2b/2c). Reutilizan el patrón de `pozo.ts` (movimiento clásico de rey de la pista) pero (a) con parejas como unidad atómica (2 por pista) en vez de 4 individuos, y (b) cambian la clasificación de "puntos acumulados" a "posición final en la escalera, desempate por acumulado".

**Tech Stack:** TypeScript puro, vitest. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-06-15-pozo-torneo-split-design.md` (secciones Pozo).

**Contexto del motor existente (`src/lib/tournament/pozo.ts`, NO se modifica):**
- `PozoRound { courts: string[][]; resting: string[] }` — americano: 4 individuos por pista.
- `nextPozoRound`/`nextPozoRoundWithRest` — movimiento clásico: ganadores suben, perdedores bajan; top y fondo retienen.
- `seedPozoCourts(participantIds, numCourts)` — llena 4 por pista EN ORDEN (sin aleatoriedad).
- `pozoStandings(...)` — clasifica por juegos acumulados (esto NO es lo que queremos para la clasif. final; ver Task 3).

---

## File Structure

- **Create:** `src/lib/tournament/seeding.ts` — barajado determinista por semilla (PRNG). Una responsabilidad: orden aleatorio reproducible.
- **Create:** `src/lib/tournament/seeding.test.ts`.
- **Create:** `src/lib/tournament/pozo-pairs.ts` — rey de la pista con **parejas fijas** (2 parejas por pista, se mueven como bloque).
- **Create:** `src/lib/tournament/pozo-pairs.test.ts`.
- **Create:** `src/lib/tournament/ladder.ts` — clasificación por posición final en la escalera (común a ambas variantes).
- **Create:** `src/lib/tournament/ladder.test.ts`.

---

## Task 1: Siembra aleatoria determinista

**Files:**
- Create: `src/lib/tournament/seeding.ts`
- Test: `src/lib/tournament/seeding.test.ts`

- [ ] **Step 1: Test**

Create `src/lib/tournament/seeding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shuffleDeterministic } from './seeding';

describe('shuffleDeterministic', () => {
  it('es reproducible con la misma semilla', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(shuffleDeterministic(items, 42)).toEqual(shuffleDeterministic(items, 42));
  });

  it('da un orden distinto con otra semilla (en general)', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(shuffleDeterministic(items, 1)).not.toEqual(shuffleDeterministic(items, 2));
  });

  it('es una permutación (mismos elementos, sin perder ni duplicar)', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const out = shuffleDeterministic(items, 7);
    expect([...out].sort()).toEqual([...items].sort());
    expect(out.length).toBe(items.length);
  });

  it('no muta el array de entrada', () => {
    const items = ['a', 'b', 'c'];
    const copy = [...items];
    shuffleDeterministic(items, 3);
    expect(items).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npx vitest run src/lib/tournament/seeding.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implement**

Create `src/lib/tournament/seeding.ts`:

```ts
// PRNG determinista (mulberry32) + Fisher-Yates. Mismo seed → mismo orden.
// Se usa para sembrar pozos/cuadros de forma aleatoria pero reproducible/testeable.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleDeterministic<T>(items: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```

- [ ] **Step 4: Run → PASS**

Run: `npx vitest run src/lib/tournament/seeding.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/seeding.ts src/lib/tournament/seeding.test.ts
git commit -m "feat(pozo): siembra aleatoria determinista (mulberry32 + Fisher-Yates)"
```

---

## Task 2: Motor de pozo de parejas fijas

**Files:**
- Create: `src/lib/tournament/pozo-pairs.ts`
- Test: `src/lib/tournament/pozo-pairs.test.ts`

Modelo: cada pista la ocupan **2 parejas** (identificadas por `pairId`). El movimiento es el clásico rey de la pista pero con parejas como unidad: la pareja que gana sube una pista, la que pierde baja; la pista top retiene al ganador, la pista fondo retiene al perdedor. Parejas sobrantes (si el nº de parejas no llena las pistas a 2) descansan y rotan.

- [ ] **Step 1: Test**

Create `src/lib/tournament/pozo-pairs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { seedPozoPairsCourts, nextPozoPairsRound, type PairsRound, type PairCourtResult } from './pozo-pairs';

describe('seedPozoPairsCourts', () => {
  it('coloca 2 parejas por pista en orden; sobrantes descansan', () => {
    const r = seedPozoPairsCourts(['A', 'B', 'C', 'D', 'E'], 2);
    expect(r.courts).toEqual([['A', 'B'], ['C', 'D']]);
    expect(r.resting).toEqual(['E']);
  });
  it('no crea pistas a medias: con 3 parejas y 2 pistas, 1 pista + 1 descansa', () => {
    const r = seedPozoPairsCourts(['A', 'B', 'C'], 2);
    expect(r.courts).toEqual([['A', 'B']]);
    expect(r.resting).toEqual(['C']);
  });
});

describe('nextPozoPairsRound', () => {
  it('sube ganadores y baja perdedores; top y fondo retienen', () => {
    // 3 pistas: [A,B] [C,D] [E,F]. Ganan: A (top), D (media), E (fondo).
    const current: PairsRound = { courts: [['A', 'B'], ['C', 'D'], ['E', 'F']], resting: [] };
    const results: PairCourtResult[] = [
      { winner: 'A', loser: 'B' },
      { winner: 'D', loser: 'C' },
      { winner: 'E', loser: 'F' },
    ];
    const next = nextPozoPairsRound(current, results);
    // Top: gana A (retiene) + sube D desde la media → [A, D]
    // Media: baja B desde top + sube E desde fondo → [B, E]
    // Fondo: baja C desde media + pierde F (retiene) → [C, F]
    expect(next.courts).toEqual([['A', 'D'], ['B', 'E'], ['C', 'F']]);
  });

  it('rota descansos: el que descansaba entra por el fondo', () => {
    const current: PairsRound = { courts: [['A', 'B'], ['C', 'D']], resting: ['E'] };
    const results: PairCourtResult[] = [
      { winner: 'A', loser: 'B' },
      { winner: 'C', loser: 'D' },
    ];
    const next = nextPozoPairsRound(current, results);
    // Top: A retiene + sube C → [A, C]
    // Fondo: baja B + (D sería retención del fondo) ... con descanso: la última posición del fondo sale a descansar y entra E.
    // Fondo base (sin descanso) = [B, D]; sale D a descansar, entra E → [B, E]; descansa D.
    expect(next.courts[0]).toEqual(['A', 'C']);
    expect(next.courts[1]).toEqual(['B', 'E']);
    expect(next.resting).toEqual(['D']);
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npx vitest run src/lib/tournament/pozo-pairs.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implement**

Create `src/lib/tournament/pozo-pairs.ts`:

```ts
// Rey de la pista con PAREJAS FIJAS: cada pista = 2 parejas (pairId). La pareja que
// gana sube una pista, la que pierde baja; top retiene al ganador, fondo al perdedor.
// Las parejas no se rompen nunca. Estructura análoga a pozo.ts pero con parejas
// como unidad atómica (2 por pista en vez de 4 individuos).

export interface PairsRound {
  courts: string[][]; // courts[i] = [pairIdTop, pairIdBottom] de la pista de orden i+1
  resting: string[];  // pairIds que descansan esta ronda
}

export interface PairCourtResult {
  winner: string; // pairId ganador
  loser: string;  // pairId perdedor
}

// Siembra: 2 parejas por pista en orden; sobrantes a resting; no crea pistas a medias.
export function seedPozoPairsCourts(pairIds: string[], numCourts: number): PairsRound {
  const fillable = Math.min(numCourts, Math.floor(pairIds.length / 2));
  const courts: string[][] = [];
  for (let i = 0; i < fillable; i++) courts.push(pairIds.slice(i * 2, i * 2 + 2));
  const resting = pairIds.slice(fillable * 2);
  return { courts, resting };
}

// Movimiento clásico aplicado a parejas. results[i] corresponde a current.courts[i].
function moveCourts(current: PairsRound, results: PairCourtResult[]): PairsRound {
  const n = current.courts.length;
  const fromAbove: string[][] = Array.from({ length: n }, () => []); // perdedores que bajan
  const fromBelow: string[][] = Array.from({ length: n }, () => []); // ganadores que suben
  const stayTop: string[][] = Array.from({ length: n }, () => []);
  const stayBottom: string[][] = Array.from({ length: n }, () => []);

  results.forEach((res, k) => {
    const isTop = k === 0;
    const isBottom = k === n - 1;
    if (isTop) stayTop[k].push(res.winner); else fromBelow[k - 1].push(res.winner);
    if (isBottom) stayBottom[k].push(res.loser); else fromAbove[k + 1].push(res.loser);
  });

  const courts: string[][] = [];
  for (let k = 0; k < n; k++) {
    courts.push([...stayTop[k], ...fromAbove[k], ...fromBelow[k], ...stayBottom[k]]);
  }
  return { courts, resting: [...current.resting] };
}

// Aplica el movimiento y rota los descansos: la última pareja del fondo sale a descansar
// y entran las que descansaban.
export function nextPozoPairsRound(current: PairsRound, results: PairCourtResult[]): PairsRound {
  const moved = moveCourts(current, results);
  const restCount = current.resting.length;
  if (restCount === 0 || moved.courts.length === 0) return moved;

  const bottomIdx = moved.courts.length - 1;
  const bottom = moved.courts[bottomIdx];
  const goRest = bottom.slice(bottom.length - restCount);
  const staying = bottom.slice(0, bottom.length - restCount);
  moved.courts[bottomIdx] = [...staying, ...current.resting];
  moved.resting = goRest;
  return moved;
}
```

- [ ] **Step 4: Run → PASS**

Run: `npx vitest run src/lib/tournament/pozo-pairs.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo-pairs.ts src/lib/tournament/pozo-pairs.test.ts
git commit -m "feat(pozo): motor de rey de la pista con parejas fijas"
```

---

## Task 3: Clasificación por escalera (pista final)

**Files:**
- Create: `src/lib/tournament/ladder.ts`
- Test: `src/lib/tournament/ladder.test.ts`

La clasificación final del pozo (ambas variantes) es **por la pista en la que acaba cada entidad** (individuo en americano, pareja en parejas fijas): la pista de arriba (índice 0) es la mejor. **Desempate dentro de una misma pista: por juegos acumulados** a lo largo del pozo (desc). Las entidades que descansan en la ronda final van al final.

- [ ] **Step 1: Test**

Create `src/lib/tournament/ladder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ladderStandings } from './ladder';

describe('ladderStandings', () => {
  it('clasifica por pista (0 = mejor); dentro de la pista, por juegos acumulados', () => {
    // Ronda final: pista0 = [X, Y], pista1 = [Z, W]. Juegos: Y>X, Z>W.
    const finalCourts = [['X', 'Y'], ['Z', 'W']];
    const games = new Map([['X', 10], ['Y', 14], ['Z', 9], ['W', 3]]);
    const table = ladderStandings(finalCourts, games, []);
    expect(table.map((r) => r.entityId)).toEqual(['Y', 'X', 'Z', 'W']);
    expect(table.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(table[0].court).toBe(0);
    expect(table[2].court).toBe(1);
  });

  it('los que descansan en la ronda final van al final', () => {
    const finalCourts = [['A', 'B']];
    const games = new Map([['A', 5], ['B', 8], ['R', 99]]);
    const table = ladderStandings(finalCourts, games, ['R']);
    expect(table.map((r) => r.entityId)).toEqual(['B', 'A', 'R']);
    expect(table[2].entityId).toBe('R');
    expect(table[2].court).toBeNull();
  });

  it('sin juegos registrados, mantiene el orden dentro de la pista de forma estable', () => {
    const finalCourts = [['A', 'B']];
    const table = ladderStandings(finalCourts, new Map(), []);
    expect(table.map((r) => r.entityId)).toEqual(['A', 'B']);
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npx vitest run src/lib/tournament/ladder.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implement**

Create `src/lib/tournament/ladder.ts`:

```ts
// Clasificación final del pozo POR ESCALERA: la pista de arriba (índice 0) es la mejor.
// Desempate dentro de una misma pista: por juegos acumulados (desc), estable si empatan.
// Vale para individuos (americano) o parejas (parejas fijas): opera sobre los ids que
// ocupan las pistas en la RONDA FINAL. Los que descansan van al final (court = null).

export interface LadderStanding {
  entityId: string;
  court: number | null; // índice de pista en la ronda final (0 = top); null si descansaba
  rank: number;
}

export function ladderStandings(
  finalCourts: string[][],
  gamesByEntity: Map<string, number>,
  restingFinal: string[],
): LadderStanding[] {
  const out: LadderStanding[] = [];
  finalCourts.forEach((court, courtIdx) => {
    const sorted = court
      .map((entityId, pos) => ({ entityId, pos, games: gamesByEntity.get(entityId) ?? 0 }))
      // juegos desc; desempate estable por la posición original dentro de la pista
      .sort((a, b) => b.games - a.games || a.pos - b.pos);
    for (const s of sorted) out.push({ entityId: s.entityId, court: courtIdx, rank: 0 });
  });
  for (const entityId of restingFinal) out.push({ entityId, court: null, rank: 0 });
  out.forEach((row, i) => { row.rank = i + 1; });
  return out;
}
```

- [ ] **Step 4: Run → PASS**

Run: `npx vitest run src/lib/tournament/ladder.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/ladder.ts src/lib/tournament/ladder.test.ts
git commit -m "feat(pozo): clasificación por escalera (pista final + desempate por acumulado)"
```

---

## Task 4: Verificación del conjunto

**Files:** —

- [ ] **Step 1: Suite completa verde + tipos**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests" && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: todos los tests verdes (≈258), `0` errores de tipos.

- [ ] **Step 2: Push**

```bash
git push origin pozo-torneo-redesign
```

---

## Self-review (cobertura vs. spec)

- **Siembra aleatoria, reproducible** (para barajar participantes/parejas antes de sembrar pistas) → Task 1. ✓
- **Pozo de parejas fijas** (parejas que suben/bajan como bloque, 2 por pista) → Task 2. ✓
- **Clasificación por escalera** (pista final, desempate por juegos acumulados), común a americano y parejas fijas → Task 3. ✓
- **Americano** (4 individuos, rotación de compañero) → ya existe en `pozo.ts`, NO se toca aquí. La clasificación por escalera del americano se calcula con `ladderStandings` sobre las pistas de individuos en la ronda final. ✓
- **NO en este plan** (Plan 2b/2c): generación que escribe a la BD nueva, avance de rondas persistido, parrilla/resultados/clasificación en UI, vista pública, e2e. Este plan es solo los motores puros nuevos. ✓

**Notas para Plan 2b (generación + persistencia):**
- La generación del americano siembra con `seedPozoCourts` PERO barajando antes los participantes con `shuffleDeterministic` (semilla guardada en el evento para reproducibilidad/ajuste).
- La generación de parejas fijas usa `seedPozoPairsCourts` sobre los `pairId` barajados.
- El avance de ronda persistido usará `nextPozoRoundWithRest` (americano) / `nextPozoPairsRound` (parejas) leyendo resultados de la BD.
- La clasificación en vivo usará `ladderStandings` sobre la ÚLTIMA ronda con datos + un mapa de juegos acumulados leído de `tournament_matches`.
- `phase_tag` sugerido para las rondas del pozo: `pozo:r0`, `pozo:r1`, … (discriminar ronda).
