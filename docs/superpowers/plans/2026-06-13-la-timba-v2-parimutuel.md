# La Timba v2 (pari-mutuel + buy-in) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescribir el motor de La Timba de cuotas-fijas-contra-la-banca a **apuesta mutua (pari-mutuel)** con economía de **buy-in** (entras pagando 5 €→500 fichas), rol de **apostante** (amigos que no juegan), **auto-apuesta** solo a victoria propia, y **bote** siempre solvente.

**Architecture:** Lógica pura nueva y testeada (`parimutuel.ts`, `provisional-odds.ts`); la orquestación con DB (`settle.ts`, `match-odds.ts`) se reescribe para usarla; `bank.ts` se reutiliza. Las fichas nunca se crean/destruyen al apostar (solo se mueven), así que `bote € = Σ(saldos) × 1 céntimo` por construcción. Reinicio limpio de datos (La Timba aún no se jugó con dinero real).

**Tech Stack:** Next.js 16 App Router, Drizzle + Turso/libSQL, Vitest, web-push, shadcn/ui + componentes `lpt`.

**Spec:** `docs/superpowers/specs/2026-06-13-la-timba-v2-parimutuel-design.md`

**Reglas de oro del repo (todas las tareas):**
- Lee `node_modules/next/dist/docs/` ante dudas de API de Next.js 16.
- Rutas API: `const auth = await requireAdmin(); if ('response' in auth) return auth.response;` (o `requireSession`). Params dinámicos son `Promise<{id}>`.
- Tests: Vitest, `*.test.ts` junto al módulo, solo lógica pura. Comando: `npx vitest run <ruta>`.
- `npx tsc --noEmit` tiene **un error PREEXISTENTE** en `src/lib/push/send.ts` (tipos de web-push). Ignóralo; lo que no se permite es ningún error NUEVO.
- Textos de UI y errores en castellano. Commits frecuentes estilo `feat(betting): …`.
- **Worktree aislado:** si compilas/`npm run build`, hace falta `npm install` dentro del worktree y copiar `.env.local` del repo padre (web-push falta en node_modules del padre).

**Convención de claves de selección (usada en varias tareas):**
- Apuesta de mercado `winner` → selección = `team:${predictedTeam}` (`team:1` / `team:2`).
- Apuesta de mercado `exact_score` → selección = `exact:${predictedTeam}:${predictedScore}` (`exact:1:2-0`…).
- Resultado ganador del mercado `winner` = `team:${winnerTeam}`.
- Resultado ganador del mercado `exact_score` = `exact:${winnerTeam}:${matchSetsScore(sets, winnerTeam)}`.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/betting/parimutuel.ts` (+test, nuevo) | Reparto pari-mutuel puro: `distributePool` (resto mayor), `settlePool`, `selectionOfBet`, `winningSelection`. |
| `src/lib/betting/provisional-odds.ts` (+test, nuevo) | Cuota provisional de pool + guía de favorito por Elo (puro). |
| `src/lib/betting/config.ts` (modificar) | Constantes v2 (buy-in, peg); fuera lo de cuotas Elo. |
| `src/lib/betting/settle-logic.ts` (modificar) | Mantener `matchSetsScore` e `isBankrupt`; eliminar `settleBet` y los tipos de cuota fija. |
| `src/lib/betting/odds.ts` (eliminar) | Reemplazado por `provisional-odds.ts`. |
| `src/lib/betting/odds.test.ts` (eliminar) | — |
| `src/lib/betting/match-odds.ts` (reescribir) | Cuotas provisionales desde los pools actuales + guía Elo. |
| `src/lib/betting/settle.ts` (reescribir) | Liquidación pari-mutuel por pools; devoluciones; reversión; bancarrota. |
| `src/lib/betting/bank.ts` (modificar) | Añadir reasons `buyin`/`rebuy`. |
| `src/lib/betting/pot.ts` (nuevo) | `potEuros()` = Σ saldos × céntimo. |
| `src/lib/db/schema.ts` (modificar) | `players.juegaPadel`; `bets.odds` deja de escribirse (nullable). |
| `src/app/api/migrate-timba-v2/route.ts` (nuevo) | Reinicio limpio + columna `juegaPadel`. |
| `src/app/api/players/route.ts` (modificar) | Quitar grant automático; aceptar `juegaPadel` al crear. |
| `src/app/api/bets/route.ts` (reescribir POST) | Sin congelar cuota; regla de auto-apuesta; registrar selección+cantidad. |
| `src/app/api/timba/entry/route.ts` (nuevo) | Admin: registrar pago 5 € → buy-in o rebuy (+500). |
| `src/app/api/matches/route.ts` + `[id]/result` UI | Selector de jugadores excluye `juegaPadel=false`. |
| `src/components/admin/match-form.tsx` (modificar) | El selector solo lista jugadores de pádel. |
| `src/components/admin/player-form.tsx` (modificar) | Casilla «juega al pádel» (alta de apostante). |
| `src/components/admin/timba-entries.tsx` + page (nuevos) | Registrar entradas/recompras; ver bote. |
| `src/components/betting/betting-card.tsx` (reescribir) | Cuotas provisionales, guía Elo, auto-apuesta, reparto potencial. |
| `src/components/betting/bets-summary.tsx` (modificar) | Resumen pari-mutuel (reparto). |
| `src/app/(public)/matches/[id]/page.tsx` (modificar) | Pasar pools/elo/ownTeam a la card. |
| `src/app/me/tokens/page.tsx` + `src/app/(public)/rankings/tokens/page.tsx` + home (modificar) | Mostrar bote; distinguir «no ha entrado». |
| `src/components/admin/rewards-manager.tsx` (modificar) | Guía de precio 1 céntimo/ficha. |

---

### Task 1: Reparto pari-mutuel puro (TDD)

**Files:**
- Create: `src/lib/betting/parimutuel.ts`
- Test: `src/lib/betting/parimutuel.test.ts`

- [ ] **Step 1: Escribir los tests (fallan)**

```ts
// src/lib/betting/parimutuel.test.ts
import { describe, it, expect } from 'vitest';
import { distributePool, settlePool, type PoolBet } from './parimutuel';

describe('distributePool', () => {
  it('reparte proporcional y la suma cuadra exacta', () => {
    // pool 100 entre apuestas 30 y 70 → 30 y 70
    const m = distributePool(100, [{ betId: 'a', amount: 30 }, { betId: 'b', amount: 70 }]);
    expect(m.get('a')).toBe(30);
    expect(m.get('b')).toBe(70);
    expect(m.get('a')! + m.get('b')!).toBe(100);
  });
  it('reparte los restos del redondeo por resto mayor, sin perder fichas', () => {
    // pool 100 entre tres iguales (33.33 c/u) → 34/33/33, suma 100
    const m = distributePool(100, [{ betId: 'a', amount: 10 }, { betId: 'b', amount: 10 }, { betId: 'c', amount: 10 }]);
    const total = [...m.values()].reduce((s, n) => s + n, 0);
    expect(total).toBe(100);
    expect([...m.values()].sort()).toEqual([33, 33, 34]);
  });
  it('un solo ganador se lleva todo el pool', () => {
    const m = distributePool(150, [{ betId: 'a', amount: 50 }]);
    expect(m.get('a')).toBe(150);
  });
});

describe('settlePool', () => {
  const bets: PoolBet[] = [
    { id: 'a', playerId: 'p1', selection: 'team:1', amount: 40 },
    { id: 'b', playerId: 'p2', selection: 'team:1', amount: 60 },
    { id: 'c', playerId: 'p3', selection: 'team:2', amount: 50 },
  ];
  it('los acertantes se reparten todo el pool proporcionalmente', () => {
    const out = settlePool(bets, 'team:1');
    const a = out.find((o) => o.betId === 'a')!;
    const b = out.find((o) => o.betId === 'b')!;
    const c = out.find((o) => o.betId === 'c')!;
    // pool=150, ganan a y b proporcional a 40/60 sobre 100 → 60 y 90
    expect(a).toMatchObject({ status: 'won', payout: 60 });
    expect(b).toMatchObject({ status: 'won', payout: 90 });
    expect(c).toMatchObject({ status: 'lost', payout: 0 });
    expect(a.payout + b.payout + c.payout).toBe(150);
  });
  it('si nadie acierta, se devuelve a todos su apuesta', () => {
    const out = settlePool(bets, 'team:1 que nadie eligió' as string);
    expect(out.every((o) => o.status === 'refunded')).toBe(true);
    expect(out.find((o) => o.betId === 'c')!.payout).toBe(50);
  });
  it('todos al mismo lado y aciertan → cada uno recupera su apuesta (×1)', () => {
    const all: PoolBet[] = [
      { id: 'a', playerId: 'p1', selection: 'team:1', amount: 40 },
      { id: 'b', playerId: 'p2', selection: 'team:1', amount: 60 },
    ];
    const out = settlePool(all, 'team:1');
    expect(out.find((o) => o.betId === 'a')!.payout).toBe(40);
    expect(out.find((o) => o.betId === 'b')!.payout).toBe(60);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/betting/parimutuel.test.ts`
Expected: FAIL — `Cannot find module './parimutuel'`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/betting/parimutuel.ts
// Reparto de apuestas en pari-mutuel (lógica pura, sin DB).
// El pool de un mercado se reparte entre los acertantes proporcional a lo
// apostado; si nadie acierta, devolución íntegra. Fichas conservadas: Σ pagos
// == pool (método del resto mayor para cuadrar el redondeo a enteros).

export interface PoolBet {
  id: string;
  playerId: string;
  selection: string; // 'team:1' | 'team:2' | 'exact:1:2-0' …
  amount: number;
}

export interface PoolPayout {
  betId: string;
  playerId: string;
  status: 'won' | 'lost' | 'refunded';
  amount: number;  // lo apostado
  payout: number;  // fichas que recibe (0 si lost)
}

// Reparte `pool` entre `winners` proporcional a su amount. Devuelve betId→payout.
// Método del resto mayor: floor de cada cuota + reparte las fichas sobrantes a
// los mayores restos fraccionarios. Garantiza Σ payout == pool exactamente.
export function distributePool(
  pool: number,
  winners: { betId: string; amount: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  const totalStake = winners.reduce((s, w) => s + w.amount, 0);
  if (totalStake === 0) return out;

  let assigned = 0;
  const remainders: { betId: string; frac: number }[] = [];
  for (const w of winners) {
    const exact = (pool * w.amount) / totalStake;
    const floor = Math.floor(exact);
    out.set(w.betId, floor);
    assigned += floor;
    remainders.push({ betId: w.betId, frac: exact - floor });
  }
  // Repartir las fichas que faltan (pool - assigned) a los mayores restos.
  let leftover = pool - assigned;
  remainders.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < leftover; i++) {
    const r = remainders[i % remainders.length];
    out.set(r.betId, out.get(r.betId)! + 1);
  }
  return out;
}

// Liquida un mercado pari-mutuel. `allBets` = TODAS las apuestas del mercado.
export function settlePool(allBets: PoolBet[], winningSelection: string): PoolPayout[] {
  const pool = allBets.reduce((s, b) => s + b.amount, 0);
  const winners = allBets.filter((b) => b.selection === winningSelection);

  if (winners.length === 0) {
    // Nadie acertó → devolución íntegra.
    return allBets.map((b) => ({
      betId: b.id, playerId: b.playerId, status: 'refunded' as const,
      amount: b.amount, payout: b.amount,
    }));
  }

  const shares = distributePool(pool, winners.map((w) => ({ betId: w.id, amount: w.amount })));
  return allBets.map((b) => {
    const won = b.selection === winningSelection;
    return {
      betId: b.id, playerId: b.playerId,
      status: won ? ('won' as const) : ('lost' as const),
      amount: b.amount,
      payout: won ? (shares.get(b.id) ?? 0) : 0,
    };
  });
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/betting/parimutuel.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/betting/parimutuel.ts src/lib/betting/parimutuel.test.ts
git commit -m "feat(betting): reparto pari-mutuel puro con método del resto mayor"
```

---

### Task 2: Cuota provisional de pool + guía Elo (TDD)

**Files:**
- Create: `src/lib/betting/provisional-odds.ts`
- Test: `src/lib/betting/provisional-odds.test.ts`

- [ ] **Step 1: Escribir los tests (fallan)**

```ts
// src/lib/betting/provisional-odds.test.ts
import { describe, it, expect } from 'vitest';
import { provisionalMultiplier, eloFavorite } from './provisional-odds';

describe('provisionalMultiplier', () => {
  it('= pool total / pool de la selección, a 1 decimal', () => {
    expect(provisionalMultiplier(100, 40)).toBe(2.5); // 100/40
  });
  it('null si la selección no tiene apuestas (sin cuota orientativa)', () => {
    expect(provisionalMultiplier(100, 0)).toBeNull();
  });
  it('null si el pool total es 0', () => {
    expect(provisionalMultiplier(0, 0)).toBeNull();
  });
});

describe('eloFavorite', () => {
  it('marca el equipo de mayor Elo medio', () => {
    expect(eloFavorite(1550, 1500)).toBe(1);
    expect(eloFavorite(1500, 1560)).toBe(2);
  });
  it('0 si están parejos (≤ 5 pts de diferencia)', () => {
    expect(eloFavorite(1500, 1503)).toBe(0);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/betting/provisional-odds.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/betting/provisional-odds.ts
// Cuotas provisionales de pari-mutuel (solo display) + guía de favorito por Elo.
// El Elo NO determina el pago (eso lo hace el reparto del pool); solo orienta.

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Lo que multiplicarías tu apuesta si tu selección gana y el pool no cambiara.
// null cuando no hay base para una cuota (selección o pool vacíos).
export function provisionalMultiplier(totalPool: number, selectionPool: number): number | null {
  if (totalPool <= 0 || selectionPool <= 0) return null;
  return round1(totalPool / selectionPool);
}

// Guía: qué equipo es favorito según la media de Elo. 0 = parejo.
export function eloFavorite(team1Avg: number, team2Avg: number): 0 | 1 | 2 {
  if (Math.abs(team1Avg - team2Avg) <= 5) return 0;
  return team1Avg > team2Avg ? 1 : 2;
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/betting/provisional-odds.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/betting/provisional-odds.ts src/lib/betting/provisional-odds.test.ts
git commit -m "feat(betting): cuota provisional de pool y guía de favorito por Elo"
```

---

### Task 3: Config v2 + recortar settle-logic (TDD del recorte)

**Files:**
- Modify: `src/lib/betting/config.ts`
- Modify: `src/lib/betting/settle-logic.ts`
- Modify: `src/lib/betting/settle-logic.test.ts`

Este grupo (Tasks 3–7) reescribe el motor; el árbol puede no compilar del todo hasta el final de la Task 7. `npx tsc --noEmit` se valida al cierre de la Task 7.

- [ ] **Step 1: Reescribir `src/lib/betting/config.ts`**

```ts
// src/lib/betting/config.ts
// Economía de «La Timba» v2 (pari-mutuel + buy-in). Cambiar aquí.
export const BETTING = {
  buyInTokens: 500,   // fichas que recibes al pagar la entrada
  buyInEuros: 5,      // € de la entrada / recompra
  centsPerToken: 1,   // peg: 1 ficha = 1 céntimo (bote = Σ saldos × 1c)
  minBet: 10,         // apuesta mínima por mercado
  maxBet: 100,        // apuesta máxima por mercado
} as const;

export type BetMarket = 'winner' | 'exact_score';
export type BetStatus = 'open' | 'won' | 'lost' | 'refunded';
export type SetsScore = '2-0' | '2-1';
```

- [ ] **Step 2: Recortar `src/lib/betting/settle-logic.ts`** (quitar cuota fija, conservar lo que se reutiliza)

```ts
// src/lib/betting/settle-logic.ts
// Utilidades puras de liquidación compartidas (sin DB).
import { BETTING, type SetsScore } from './config';

// Marcador en sets a partir de los juegos: '2-0' si el perdedor no ganó set, '2-1' si ganó uno.
export function matchSetsScore(
  sets: { team1Games: number; team2Games: number }[],
  winnerTeam: 1 | 2,
): SetsScore {
  const loserSetsWon = sets.filter((s) =>
    winnerTeam === 1 ? s.team2Games > s.team1Games : s.team1Games > s.team2Games,
  ).length;
  return loserSetsWon === 0 ? '2-0' : '2-1';
}

// Bancarrota: por debajo de la apuesta mínima y sin apuestas abiertas pendientes de cobro.
export function isBankrupt(balance: number, openBetsCount: number): boolean {
  return balance < BETTING.minBet && openBetsCount === 0;
}
```

- [ ] **Step 3: Recortar `src/lib/betting/settle-logic.test.ts`** (quitar tests de `settleBet`, conservar `matchSetsScore` e `isBankrupt`)

```ts
// src/lib/betting/settle-logic.test.ts
import { describe, it, expect } from 'vitest';
import { matchSetsScore, isBankrupt } from './settle-logic';

describe('matchSetsScore', () => {
  it('2-0 si el perdedor no ganó ningún set', () => {
    expect(matchSetsScore([{ team1Games: 6, team2Games: 3 }, { team1Games: 6, team2Games: 4 }], 1)).toBe('2-0');
  });
  it('2-1 si el perdedor ganó un set', () => {
    expect(matchSetsScore([
      { team1Games: 6, team2Games: 3 }, { team1Games: 4, team2Games: 6 }, { team1Games: 7, team2Games: 5 },
    ], 1)).toBe('2-1');
  });
  it('funciona cuando gana el equipo 2', () => {
    expect(matchSetsScore([
      { team1Games: 3, team2Games: 6 }, { team1Games: 6, team2Games: 4 }, { team1Games: 2, team2Games: 6 },
    ], 2)).toBe('2-1');
  });
});

describe('isBankrupt', () => {
  it('saldo bajo y sin apuestas abiertas: bancarrota', () => { expect(isBankrupt(9, 0)).toBe(true); });
  it('saldo bajo pero con apuestas abiertas: aún no', () => { expect(isBankrupt(0, 1)).toBe(false); });
  it('saldo igual a la apuesta mínima: no', () => { expect(isBankrupt(10, 0)).toBe(false); });
});
```

- [ ] **Step 4: Ejecutar los tests recortados**

Run: `npx vitest run src/lib/betting/settle-logic.test.ts`
Expected: PASS (6 tests). (El resto del árbol aún no compila; se cierra en Task 7.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/betting/config.ts src/lib/betting/settle-logic.ts src/lib/betting/settle-logic.test.ts
git commit -m "feat(betting): config v2 (buy-in/peg) y recorte de settle-logic a utilidades puras"
```

---

### Task 4: Eliminar el motor de cuotas fijas

**Files:**
- Delete: `src/lib/betting/odds.ts`
- Delete: `src/lib/betting/odds.test.ts`

- [ ] **Step 1: Borrar los archivos**

```bash
git rm src/lib/betting/odds.ts src/lib/betting/odds.test.ts
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(betting): eliminar motor de cuotas fijas (reemplazado por pari-mutuel)"
```

---

### Task 5: `bank.ts` — reasons de buy-in/rebuy

**Files:**
- Modify: `src/lib/betting/bank.ts`

- [ ] **Step 1: Ampliar el union `LedgerReason`**

En `src/lib/betting/bank.ts`, reemplaza el tipo:

```ts
export type LedgerReason =
  | 'initial' | 'bet_placed' | 'bet_cancelled' | 'bet_won' | 'bet_refunded'
  | 'recharge' | 'redemption' | 'redemption_refunded' | 'settlement_reversal' | 'adjustment';
```

por:

```ts
export type LedgerReason =
  | 'buyin' | 'rebuy' | 'bet_placed' | 'bet_cancelled' | 'bet_won' | 'bet_refunded'
  | 'redemption' | 'redemption_refunded' | 'settlement_reversal' | 'adjustment';
```

(El resto del archivo —`applyTokenMovement`, `hasLedgerEntry`— no cambia.)

- [ ] **Step 2: Commit**

```bash
git add src/lib/betting/bank.ts
git commit -m "feat(betting): reasons de ledger buyin/rebuy (entrada y recompra)"
```

---

### Task 6: `match-odds.ts` — cuotas provisionales desde los pools

**Files:**
- Modify (reescribir): `src/lib/betting/match-odds.ts`

Antes de escribir, lee `src/lib/rating/elo.ts` (no se usa para el pago, pero sí para la media de Elo de la guía) y el schema de `bets`.

- [ ] **Step 1: Reescribir `src/lib/betting/match-odds.ts`**

```ts
// src/lib/betting/match-odds.ts
// Estado de los pools de un partido + cuotas provisionales + guía de favorito.
import { db } from '@/lib/db';
import { bets, players, type Match } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { provisionalMultiplier, eloFavorite } from './provisional-odds';

export interface MarketView {
  total: number;                              // pool total del mercado
  selections: Record<string, { pool: number; multiplier: number | null }>;
}

export interface MatchPools {
  winner: MarketView;       // selecciones: 'team:1', 'team:2'
  exact: MarketView;        // selecciones: 'exact:1:2-0', 'exact:1:2-1', 'exact:2:2-0', 'exact:2:2-1'
  eloFavoriteTeam: 0 | 1 | 2;
}

function emptyMarket(keys: string[]): MarketView {
  const selections: MarketView['selections'] = {};
  for (const k of keys) selections[k] = { pool: 0, multiplier: null };
  return { total: 0, selections };
}

export async function currentMatchPools(
  match: Pick<Match, 'id' | 'team1Player1Id' | 'team1Player2Id' | 'team2Player1Id' | 'team2Player2Id'>,
): Promise<MatchPools> {
  const open = await db.select().from(bets)
    .where(and(eq(bets.matchId, match.id), eq(bets.status, 'open')));

  const winner = emptyMarket(['team:1', 'team:2']);
  const exact = emptyMarket(['exact:1:2-0', 'exact:1:2-1', 'exact:2:2-0', 'exact:2:2-1']);

  for (const b of open) {
    if (b.market === 'winner') {
      const key = `team:${b.predictedTeam}`;
      if (winner.selections[key]) { winner.selections[key].pool += b.amount; winner.total += b.amount; }
    } else {
      const key = `exact:${b.predictedTeam}:${b.predictedScore}`;
      if (exact.selections[key]) { exact.selections[key].pool += b.amount; exact.total += b.amount; }
    }
  }
  for (const k of Object.keys(winner.selections)) {
    winner.selections[k].multiplier = provisionalMultiplier(winner.total, winner.selections[k].pool);
  }
  for (const k of Object.keys(exact.selections)) {
    exact.selections[k].multiplier = provisionalMultiplier(exact.total, exact.selections[k].pool);
  }

  // Guía Elo (media individual de cada pareja)
  const ids = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id];
  const rows = await db.select().from(players).where(inArray(players.id, ids));
  const eloOf = (id: string) => rows.find((p) => p.id === id)?.eloRating ?? 1500;
  const t1 = (eloOf(match.team1Player1Id) + eloOf(match.team1Player2Id)) / 2;
  const t2 = (eloOf(match.team2Player1Id) + eloOf(match.team2Player2Id)) / 2;

  return { winner, exact, eloFavoriteTeam: eloFavorite(t1, t2) };
}
```

- [ ] **Step 2: Commit** (la compilación global se valida en Task 7)

```bash
git add src/lib/betting/match-odds.ts
git commit -m "feat(betting): pools y cuotas provisionales de partido desde la DB"
```

---

### Task 7: `settle.ts` — liquidación pari-mutuel (cierre del grupo motor)

**Files:**
- Modify (reescribir): `src/lib/betting/settle.ts`

- [ ] **Step 1: Reescribir `src/lib/betting/settle.ts`**

```ts
// src/lib/betting/settle.ts
// Orquestación de liquidación pari-mutuel / devoluciones / reversión / bancarrota.
import { db } from '@/lib/db';
import { bets, players, penalties } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { matchSetsScore, isBankrupt } from './settle-logic';
import { settlePool, type PoolBet } from './parimutuel';
import { applyTokenMovement, hasLedgerEntry } from './bank';
import { type SetsScore } from './config';
import type { SettledBetForPush } from '@/lib/push/bet-events';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function selectionOfBet(b: { market: string; predictedTeam: number; predictedScore: string | null }): string {
  return b.market === 'winner' ? `team:${b.predictedTeam}` : `exact:${b.predictedTeam}:${b.predictedScore}`;
}

// Liquida ambos mercados de un partido completado por reparto pari-mutuel.
export async function settleMatchBets(
  matchId: string,
  winnerTeam: 1 | 2,
  sets: { team1Games: number; team2Games: number }[],
): Promise<SettledBetForPush[]> {
  const open = await db.select().from(bets)
    .where(and(eq(bets.matchId, matchId), eq(bets.status, 'open')));
  if (open.length === 0) return [];

  const score: SetsScore = matchSetsScore(sets, winnerTeam);
  const winningSel = {
    winner: `team:${winnerTeam}`,
    exact_score: `exact:${winnerTeam}:${score}`,
  };

  const results: SettledBetForPush[] = [];
  for (const market of ['winner', 'exact_score'] as const) {
    const marketBets = open.filter((b) => b.market === market);
    if (marketBets.length === 0) continue;
    const poolBets: PoolBet[] = marketBets.map((b) => ({
      id: b.id, playerId: b.playerId, selection: selectionOfBet(b), amount: b.amount,
    }));
    const payouts = settlePool(poolBets, winningSel[market]);

    for (const o of payouts) {
      // Dinero antes de marcar (idempotente vía hasLedgerEntry): si muere a
      // medias, la apuesta sigue 'open' y la reliquidación retoma.
      if (o.status === 'won' && !(await hasLedgerEntry('bet_won', o.betId))) {
        await applyTokenMovement(o.playerId, o.payout, 'bet_won', o.betId);
      } else if (o.status === 'refunded' && !(await hasLedgerEntry('bet_refunded', o.betId))) {
        await applyTokenMovement(o.playerId, o.payout, 'bet_refunded', o.betId);
      }
      await db.update(bets)
        .set({ status: o.status, payout: o.payout, settledAt: now() })
        .where(eq(bets.id, o.betId));
      results.push({ playerId: o.playerId, status: o.status, amount: o.amount, payout: o.payout });
    }
  }

  await detectBankruptcies([...new Set(results.map((r) => r.playerId))]);
  return results;
}

// Devuelve todas las apuestas abiertas (lesión, cambio de cartel, borrado).
export async function refundOpenBets(matchId: string): Promise<SettledBetForPush[]> {
  const open = await db.select().from(bets)
    .where(and(eq(bets.matchId, matchId), eq(bets.status, 'open')));
  const results: SettledBetForPush[] = [];
  for (const bet of open) {
    if (!(await hasLedgerEntry('bet_refunded', bet.id))) {
      await applyTokenMovement(bet.playerId, bet.amount, 'bet_refunded', bet.id);
    }
    await db.update(bets).set({ status: 'refunded', settledAt: now() }).where(eq(bets.id, bet.id));
    results.push({ playerId: bet.playerId, status: 'refunded', amount: bet.amount, payout: 0 });
  }
  return results;
}

// Revierte una liquidación ya hecha (al borrar un partido completado): retira lo
// pagado a ganadores/devueltos y restaura las apuestas a 'open'.
export async function reverseSettlement(matchId: string): Promise<void> {
  const settled = await db.select().from(bets)
    .where(and(eq(bets.matchId, matchId), inArray(bets.status, ['won', 'lost', 'refunded'])));
  for (const bet of settled) {
    if (!(await hasLedgerEntry('settlement_reversal', bet.id))) {
      if (bet.status === 'won' || bet.status === 'refunded') {
        // se le pagó `payout` (won) o se le devolvió `amount` (refunded): retirar.
        const paid = bet.status === 'won' ? bet.payout : bet.amount;
        await applyTokenMovement(bet.playerId, -paid, 'settlement_reversal', bet.id, { allowNegative: true });
      }
      // 'lost' no recibió nada: nada que retirar.
    }
    await db.update(bets).set({ status: 'open', payout: 0, settledAt: null }).where(eq(bets.id, bet.id));
  }
  await detectBankruptcies([...new Set(settled.map((b) => b.playerId))]);
}

// Crea penalización pendiente para quien quede en bancarrota (si no tiene ya una).
export async function detectBankruptcies(playerIds: string[]): Promise<void> {
  for (const playerId of playerIds) {
    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    if (!player) continue;
    const [{ count: openCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bets)
      .where(and(eq(bets.playerId, playerId), eq(bets.status, 'open')));
    if (!isBankrupt(player.tokenBalance, Number(openCount))) continue;

    const pending = await db.select().from(penalties)
      .where(and(eq(penalties.playerId, playerId), eq(penalties.status, 'pending')));
    if (pending.length > 0) continue;

    await db.insert(penalties).values({ playerId });
  }
}

export async function hasPendingPenalty(playerId: string): Promise<boolean> {
  const rows = await db.select().from(penalties)
    .where(and(eq(penalties.playerId, playerId), eq(penalties.status, 'pending')));
  return rows.length > 0;
}
```

Nota: `penalties.rechargeAmount` ya tiene default 250 en el schema; en v2 la recompra es de 500 fichas y se gestiona en el endpoint de entrada (Task 11), no aquí. El `insert` de penalización no fija importe (usa el default, irrelevante para el flujo v2).

- [ ] **Step 2: Verificar compilación de todo el motor**

Run: `npx tsc --noEmit`
Expected: solo el error PREEXISTENTE de web-push. Si aparece algo en `src/app/api/bets/route.ts` (usa `currentMatchOdds`, que ya no existe), es esperado: se arregla en la Task 9. Para aislar, comprueba que los módulos de `src/lib/betting/` no tienen errores:
Run: `npx tsc --noEmit 2>&1 | grep "src/lib/betting" || echo "betting OK"`
Expected: `betting OK`.

- [ ] **Step 3: Tests del motor**

Run: `npx vitest run src/lib/betting`
Expected: PASS (parimutuel, provisional-odds, settle-logic, close-time).

- [ ] **Step 4: Commit**

```bash
git add src/lib/betting/settle.ts
git commit -m "feat(betting): liquidación pari-mutuel por pools (cierre del motor v2)"
```

---

### Task 8: Schema — `juegaPadel` y `bets.odds` opcional

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Añadir el flag a `players`**

En la tabla `players` (tras `tokenBalance`):

```ts
  juegaPadel: integer('juega_padel', { mode: 'boolean' }).notNull().default(true),
```

- [ ] **Step 2: Hacer `bets.odds` nullable** (deja de escribirse en v2; se conserva la columna)

En la tabla `bets`, cambia:

```ts
  odds: real('odds').notNull(),
```

por:

```ts
  odds: real('odds'), // obsoleta en v2 (pari-mutuel); nullable, no se escribe
```

- [ ] **Step 3: Compilar**

Run: `npx tsc --noEmit 2>&1 | grep "schema.ts" || echo "schema OK"`
Expected: `schema OK`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(betting): schema v2 — players.juegaPadel y bets.odds opcional"
```

---

### Task 9: Reescribir `POST /api/bets` (sin cuota fija + auto-apuesta)

**Files:**
- Modify: `src/app/api/bets/route.ts`

Mantén `GET` y `DELETE` tal cual. Reescribe solo el `POST` y ajusta imports (quita `currentMatchOdds`).

- [ ] **Step 1: Quitar el import de cuotas en la cabecera del archivo**

Elimina la línea:

```ts
import { currentMatchOdds } from '@/lib/betting/match-odds';
```

- [ ] **Step 2: Reemplazar el handler `POST` completo** por:

```ts
// POST /api/bets
// Body: { matchId, market: 'winner'|'exact_score', predictedTeam: 1|2,
//         predictedScore?: '2-0'|'2-1', amount }
// Pari-mutuel: solo se registra la selección + cantidad (sin cuota congelada).
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  const player = auth.session.player;
  if (!player) {
    return NextResponse.json({ error: 'Tu cuenta no está vinculada a un jugador' }, { status: 403 });
  }
  let chargedAmount: number | null = null;
  try {
    const body = await request.json();
    const { matchId, market, predictedTeam, predictedScore, amount } = body;

    if (market !== 'winner' && market !== 'exact_score') {
      return NextResponse.json({ error: 'Mercado inválido' }, { status: 400 });
    }
    if (predictedTeam !== 1 && predictedTeam !== 2) {
      return NextResponse.json({ error: 'Equipo inválido' }, { status: 400 });
    }
    if (market === 'exact_score' && predictedScore !== '2-0' && predictedScore !== '2-1') {
      return NextResponse.json({ error: 'Marcador inválido' }, { status: 400 });
    }
    if (!Number.isInteger(amount) || amount < BETTING.minBet || amount > BETTING.maxBet) {
      return NextResponse.json(
        { error: `La apuesta debe estar entre ${BETTING.minBet} y ${BETTING.maxBet} tokens` },
        { status: 400 },
      );
    }

    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (!isBettingOpen(match)) {
      return NextResponse.json({ error: 'Las apuestas de este partido están cerradas' }, { status: 400 });
    }

    // Auto-apuesta: si el jugador juega el partido, solo «ganador» a su pareja.
    const inTeam1 = [match.team1Player1Id, match.team1Player2Id].includes(player.id);
    const inTeam2 = [match.team2Player1Id, match.team2Player2Id].includes(player.id);
    if (inTeam1 || inTeam2) {
      const ownTeam = inTeam1 ? 1 : 2;
      if (market !== 'winner' || predictedTeam !== ownTeam) {
        return NextResponse.json(
          { error: 'Si juegas el partido solo puedes apostar a tu propia victoria (mercado ganador)' },
          { status: 403 },
        );
      }
    }

    if (await hasPendingPenalty(player.id)) {
      return NextResponse.json(
        { error: 'Estás en bancarrota: cumple tu penalización para volver a apostar' },
        { status: 403 },
      );
    }

    // Sustituir apuesta previa abierta en este mercado, si la hay.
    const [previous] = await db.select().from(bets).where(and(
      eq(bets.matchId, matchId), eq(bets.playerId, player.id), eq(bets.market, market),
    ));
    if (previous) {
      if (previous.status !== 'open') {
        return NextResponse.json({ error: 'Esa apuesta ya está liquidada' }, { status: 400 });
      }
      await applyTokenMovement(player.id, previous.amount, 'bet_cancelled', previous.id);
      await db.delete(bets).where(eq(bets.id, previous.id));
    }

    let newBalance: number;
    try {
      newBalance = await applyTokenMovement(player.id, -amount, 'bet_placed');
    } catch {
      return NextResponse.json({ error: 'No tienes saldo suficiente' }, { status: 400 });
    }
    chargedAmount = amount;

    const [bet] = await db.insert(bets).values({
      matchId,
      playerId: player.id,
      market,
      predictedTeam,
      predictedScore: market === 'exact_score' ? predictedScore : null,
      amount,
    }).returning();

    return NextResponse.json({ bet, balance: newBalance }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (chargedAmount !== null && msg.includes('UNIQUE')) {
      await applyTokenMovement(player.id, chargedAmount, 'bet_cancelled');
      return NextResponse.json({ error: 'Apuesta duplicada; inténtalo de nuevo' }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al apostar' }, { status: 500 });
  }
}
```

(Nota: el `insert` ya no incluye `odds`. La columna es nullable.)

- [ ] **Step 3: Compilar (comprobación acotada)**

Run: `npx tsc --noEmit 2>&1 | grep "api/bets/route.ts" || echo "bets route OK"`
Expected: `bets route OK`.
Nota: el `tsc` global todavía mostrará errores en `src/components/betting/betting-card.tsx` y `src/app/(public)/matches/[id]/page.tsx` (usan el `MatchOdds`/`currentMatchOdds` antiguos), que se reescriben en la Task 15. El `tsc` global limpio se logra al terminar la Task 15. No es regresión de esta tarea.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/bets/route.ts
git commit -m "feat(betting): apuestas pari-mutuel (sin cuota fija) + auto-apuesta solo a victoria propia"
```

---

### Task 10: Bote (`pot.ts`)

**Files:**
- Create: `src/lib/betting/pot.ts`

- [ ] **Step 1: Crear `src/lib/betting/pot.ts`**

```ts
// src/lib/betting/pot.ts
// Bote real (€) = suma de todas las fichas en circulación × 1 céntimo.
// Por construcción (pari-mutuel + buy-in) el bote siempre respalda las fichas.
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { BETTING } from './config';

export async function potEuros(): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${players.tokenBalance}), 0)` })
    .from(players);
  return (Number(total) * BETTING.centsPerToken) / 100;
}
```

- [ ] **Step 2: Compilar**

Run: `npx tsc --noEmit 2>&1 | grep "pot.ts" || echo "pot OK"`
Expected: `pot OK`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/betting/pot.ts
git commit -m "feat(betting): bote en euros derivado de la suma de saldos"
```

---

### Task 11: Entrada/recompra (admin) + limpieza de v1 obsoleto

**Files:**
- Create: `src/app/api/timba/entry/route.ts`
- Modify: `src/app/api/players/route.ts`
- Delete: `src/app/api/migrate-betting/route.ts` (usa `BETTING.initialBalance`/reason `initial`, ya inexistentes)
- Delete: `src/app/api/penalties/route.ts`, `src/app/api/penalties/[id]/route.ts` (usaban reason `recharge`; en v2 la bancarrota se limpia con la recompra del endpoint de entrada)
- Delete: `src/app/admin/penalties/page.tsx`, `src/components/admin/penalties-manager.tsx`
- Modify: `src/components/admin/admin-sidebar.tsx` (quitar enlace «Sanciones»)
- Modify: `src/app/me/tokens/page.tsx` (etiquetas de ledger `buyin`/`rebuy`)

- [ ] **Step 1: Crear `src/app/api/timba/entry/route.ts`**

```ts
// src/app/api/timba/entry/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { players, penalties } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { applyTokenMovement } from '@/lib/betting/bank';
import { BETTING } from '@/lib/betting/config';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// POST /api/timba/entry — admin registra que un jugador pagó la entrada (5 €).
// Body: { playerId }. Si tiene penalización pendiente → recompra (rebuy) y la
// marca cumplida; si no → entrada (buyin). En ambos casos +500 fichas.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { playerId } = await request.json();
    const [player] = await db.select().from(players).where(eq(players.id, playerId));
    if (!player) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });

    const [pending] = await db.select().from(penalties)
      .where(and(eq(penalties.playerId, playerId), eq(penalties.status, 'pending')));

    if (pending) {
      await applyTokenMovement(playerId, BETTING.buyInTokens, 'rebuy', pending.id);
      await db.update(penalties).set({ status: 'fulfilled', fulfilledAt: now() }).where(eq(penalties.id, pending.id));
    } else {
      await applyTokenMovement(playerId, BETTING.buyInTokens, 'buyin');
    }

    const [updated] = await db.select().from(players).where(eq(players.id, playerId));
    return NextResponse.json({ playerId, balance: updated.tokenBalance, kind: pending ? 'rebuy' : 'buyin' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al registrar la entrada' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Quitar el grant automático en `src/app/api/players/route.ts`**

Elimina del `POST` el bloque que inserta el asiento inicial:

```ts
    // Saldo inicial de «La Timba» (el default de la columna ya pone 500).
    // Requiere haber ejecutado POST /api/migrate-betting antes de crear jugadores.
    await db.insert(tokenLedger).values({
      playerId: player.id,
      amount: BETTING.initialBalance,
      reason: 'initial',
      balanceAfter: player.tokenBalance,
    });
```

Quita también de los imports lo que quede sin usar (`tokenLedger`, `BETTING`) si ya no se referencian en el archivo.

- [ ] **Step 3: Aceptar `juegaPadel` al crear jugador** (alta de apostante)

En el `POST` de `src/app/api/players/route.ts`, donde se hace `db.insert(players).values({...})`, añade el campo (con default `true`) leyéndolo del body:

```ts
      juegaPadel: body.juegaPadel === false ? false : true,
```

(Asegúrate de que `body` está disponible; si el handler ya destructura, añade `juegaPadel` a la lectura del body.)

- [ ] **Step 4: Borrar el endpoint v1 `migrate-betting`** (usa `BETTING.initialBalance` y reason `initial`, ya inexistentes → no compila)

```bash
git rm src/app/api/migrate-betting/route.ts
```

- [ ] **Step 5: Borrar la maquinaria v1 de penalizaciones** (usaba reason `recharge`; en v2 la bancarrota se limpia con la recompra del endpoint de entrada)

```bash
git rm src/app/api/penalties/route.ts "src/app/api/penalties/[id]/route.ts" src/app/admin/penalties/page.tsx src/components/admin/penalties-manager.tsx
```

Y en `src/components/admin/admin-sidebar.tsx`, **elimina** el enlace de Sanciones (la línea con `href: '/admin/penalties'`) y su import de icono (`Skull`) si queda sin uso. (`detectBankruptcies` sigue creando el registro de penalización como simple marca de bancarrota; el endpoint de entrada lo limpia al registrar la recompra.)

- [ ] **Step 6: Actualizar etiquetas del ledger en `src/app/me/tokens/page.tsx`**

En el objeto `REASON_LABEL`, sustituye las claves obsoletas por las de v2:

```ts
  buyin: 'Entrada (5 €)',
  rebuy: 'Recompra (5 €)',
```

(Quita las entradas `initial` y `recharge`. El resto —`bet_placed`, `bet_won`, etc.— se mantiene.)

- [ ] **Step 7: Compilar (comprobación acotada)**

Run: `npx tsc --noEmit 2>&1 | grep -E "api/(timba|players|penalties|migrate-betting)" || echo "endpoints OK"`
Expected: `endpoints OK`.
Nota: el `tsc` global sigue con los errores conocidos de `betting-card.tsx` y `matches/[id]/page.tsx` hasta la Task 15.

- [ ] **Step 8: Commit**

```bash
git add -A src/app/api/timba src/app/api/players src/app/api/migrate-betting src/app/api/penalties src/app/admin/penalties src/components/admin src/app/me/tokens
git commit -m "feat(betting): entrada/recompra por 5€ (admin), jugadores a 0 y limpieza de penalizaciones v1"
```

---

### Task 12: Migración v2 (reinicio limpio)

**Files:**
- Create: `src/app/api/migrate-timba-v2/route.ts`

- [ ] **Step 1: Crear `src/app/api/migrate-timba-v2/route.ts`**

Sigue el patrón de los `migrate-*` existentes (sin auth, idempotente, SQL crudo con try/catch).

```ts
// src/app/api/migrate-timba-v2/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// POST /api/migrate-timba-v2 — reinicio limpio de La Timba para el modelo v2
// (pari-mutuel + buy-in). La Timba no se jugó con dinero real, así que se borra
// el estado y todos arrancan a 0 fichas. Idempotente.
export async function POST() {
  try {
    // 1. Columna juega_padel (default true) para players
    try {
      await db.run(sql`ALTER TABLE players ADD COLUMN juega_padel INTEGER NOT NULL DEFAULT 1`);
    } catch { /* ya existe */ }

    // 2. Reinicio del estado de apuestas
    await db.run(sql`DELETE FROM bets`);
    await db.run(sql`DELETE FROM token_ledger`);
    await db.run(sql`DELETE FROM redemptions`);
    await db.run(sql`DELETE FROM penalties`);
    await db.run(sql`UPDATE players SET token_balance = 0`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error en la migración v2', detail: String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Compilar**

Run: `npx tsc --noEmit 2>&1 | grep "migrate-timba-v2" || echo "migrate OK"`
Expected: `migrate OK`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/migrate-timba-v2/route.ts
git commit -m "feat(betting): migración v2 — reinicio limpio + columna juega_padel"
```

---

### Task 13: Admin — excluir apostantes del pádel + casilla en alta

**Files:**
- Modify: `src/components/admin/player-form.tsx`
- Modify: `src/app/admin/matches/new/page.tsx` (y cualquier page que cargue jugadores para el selector de partido)
- Modify: `src/components/admin/match-form.tsx` (si filtra en cliente)

Lee los tres archivos antes de editar.

- [ ] **Step 1: Casilla «juega al pádel» en `player-form.tsx`**

Añade un estado y una casilla (estilo de los toggles existentes del formulario; reutiliza `isLeftHanded` como referencia de patrón):

```tsx
  const [juegaPadel, setJuegaPadel] = useState(true);
```

En el JSX, junto al control de zurdo, una casilla:

```tsx
  <label className="flex items-center gap-2">
    <input type="checkbox" checked={juegaPadel} onChange={(e) => setJuegaPadel(e.target.checked)} />
    <span>Juega al pádel (desmarca para un apostante de La Timba que no juega)</span>
  </label>
```

Y en el body del POST a `/api/players`, añade `juegaPadel`:

```tsx
      juegaPadel,
```

(Si el formulario también edita jugadores existentes vía PUT, incluye `juegaPadel` igual; revisa el endpoint PUT de `players/[id]` y añade el campo si soporta edición.)

- [ ] **Step 2: Excluir apostantes del selector de partidos**

En `src/app/admin/matches/new/page.tsx`, la consulta de jugadores filtra por `juegaPadel`:

```ts
import { eq } from 'drizzle-orm';
// …
const allPlayers = await db.select().from(players).where(eq(players.juegaPadel, true)).orderBy(players.name);
```

Haz lo mismo en cualquier otra page/componente que cargue la lista para asignar jugadores a un partido (busca `from(players)` en `src/app/admin/matches`).

- [ ] **Step 3: Compilar (comprobación acotada)**

Run: `npx tsc --noEmit 2>&1 | grep -E "player-form|admin/matches" || echo "admin OK"`
Expected: `admin OK`.
Nota: el `tsc` global sigue con los errores conocidos de `betting-card.tsx` y `matches/[id]/page.tsx` hasta la Task 15.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/player-form.tsx src/app/admin/matches src/components/admin/match-form.tsx
git commit -m "feat(betting): alta de apostante (juega_padel) y exclusión del selector de partidos"
```

---

### Task 14: Admin — entradas/recompras y bote

**Files:**
- Create: `src/components/admin/timba-entries.tsx`
- Create: `src/app/admin/timba/page.tsx`
- Modify: `src/components/admin/admin-sidebar.tsx`

Lee `src/components/admin/broadcast-form.tsx` y `src/components/admin/admin-sidebar.tsx` para el estilo.

- [ ] **Step 1: `src/components/admin/timba-entries.tsx` (client)**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export interface TimbaPlayerRow {
  id: string;
  name: string;
  nickname: string | null;
  tokenBalance: number;
  hasEntered: boolean;   // tiene algún movimiento de buy-in/rebuy
  bankrupt: boolean;     // penalización pendiente
}

export function TimbaEntries({ players, potEuros }: { players: TimbaPlayerRow[]; potEuros: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function registerEntry(playerId: string) {
    setLoading(playerId);
    try {
      const res = await fetch('/api/timba/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success(data.kind === 'rebuy' ? 'Recompra registrada (+500)' : 'Entrada registrada (+500)');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="lpt-card" style={{ padding: 16, textAlign: 'center' }}>
        <div className="muted text-sm">💰 Bote actual</div>
        <div className="display" style={{ fontSize: 36 }}>{potEuros.toFixed(2)} €</div>
      </div>
      <div className="lpt-card" style={{ padding: 12 }}>
        {players.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-2 gap-3">
            <div className="text-sm">
              <strong>{p.nickname || p.name}</strong>{' '}
              <span className="muted">· {p.tokenBalance} fichas {p.bankrupt ? '· 💀 en bancarrota' : ''}{!p.hasEntered ? '· (no ha entrado)' : ''}</span>
            </div>
            <Button size="sm" disabled={loading === p.id} onClick={() => registerEntry(p.id)}>
              {p.bankrupt ? 'Recompra 5€' : 'Entrada 5€'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `src/app/admin/timba/page.tsx` (server)**

```tsx
import { db } from '@/lib/db';
import { players, penalties, tokenLedger } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { potEuros } from '@/lib/betting/pot';
import { TimbaEntries, type TimbaPlayerRow } from '@/components/admin/timba-entries';

export const dynamic = 'force-dynamic';

export default async function AdminTimbaPage() {
  const [allPlayers, pendingPen, entries, pot] = await Promise.all([
    db.select().from(players).orderBy(players.name),
    db.select().from(penalties).where(eq(penalties.status, 'pending')),
    db.select({ playerId: tokenLedger.playerId, reason: tokenLedger.reason })
      .from(tokenLedger).where(inArray(tokenLedger.reason, ['buyin', 'rebuy'])),
    potEuros(),
  ]);
  const bankrupt = new Set(pendingPen.map((p) => p.playerId));
  const entered = new Set(entries.map((e) => e.playerId));

  const rows: TimbaPlayerRow[] = allPlayers.map((p) => ({
    id: p.id, name: p.name, nickname: p.nickname, tokenBalance: p.tokenBalance,
    hasEntered: entered.has(p.id), bankrupt: bankrupt.has(p.id),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">💰 La Timba — entradas y bote</h1>
        <p className="muted text-sm mt-1.5">Registra el pago de 5 € (entrada o recompra) y consulta el bote</p>
      </div>
      <TimbaEntries players={rows} potEuros={pot} />
    </div>
  );
}
```

- [ ] **Step 3: Enlace en el sidebar admin**

En `src/components/admin/admin-sidebar.tsx`, añade a `adminLinks` (importa el icono `Coins` de lucide-react):

```ts
  { href: '/admin/timba', label: 'La Timba', icon: Coins },
```

- [ ] **Step 4: Compilar y commit**

Run: `npx tsc --noEmit` — solo web-push.

```bash
git add src/components/admin/timba-entries.tsx src/app/admin/timba src/components/admin/admin-sidebar.tsx
git commit -m "feat(betting): admin de entradas/recompras y bote"
```

---

### Task 15: Reescribir la card de apuestas (pari-mutuel)

**Files:**
- Modify (reescribir): `src/components/betting/betting-card.tsx`
- Modify: `src/app/(public)/matches/[id]/page.tsx`

Lee ambos archivos enteros antes. La card pasa de "cuotas fijas" a "pools + cuota provisional + guía Elo + reparto potencial", y aplica la restricción de auto-apuesta.

- [ ] **Step 1: Reescribir `src/components/betting/betting-card.tsx`**

```tsx
'use client';

// Card de apuestas pari-mutuel para partidos programados.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { LptAvatar } from '@/components/lpt/ui';
import type { MatchPools } from '@/lib/betting/match-odds';

export interface PublicBet {
  id: string; playerId: string;
  playerName: string; playerNickname: string | null; playerAvatarUrl: string | null;
  market: string; predictedTeam: number; predictedScore: string | null; amount: number;
}

interface BettingCardProps {
  matchId: string;
  team1Label: string;
  team2Label: string;
  pools: MatchPools;
  closesAtIso: string;
  balance: number | null;        // null = sin jugador vinculado
  bankrupt: boolean;
  ownTeam: 0 | 1 | 2;            // 0 = no juega este partido; 1/2 = su pareja
  myBets: { market: string; predictedTeam: number; predictedScore: string | null; amount: number }[];
  allBets: PublicBet[];
  minBet: number;
  maxBet: number;
}

const SCORES = ['2-0', '2-1'] as const;

export function BettingCard(props: BettingCardProps) {
  const router = useRouter();
  const isPlayer = props.ownTeam !== 0;
  // Si juega el partido, forzamos mercado ganador y su propia pareja.
  const [market, setMarket] = useState<'winner' | 'exact_score'>('winner');
  const [team, setTeam] = useState<1 | 2>(isPlayer ? (props.ownTeam as 1 | 2) : 1);
  const [score, setScore] = useState<'2-0' | '2-1'>('2-0');
  const [amount, setAmount] = useState(props.minBet);
  const [loading, setLoading] = useState(false);

  const closesAt = new Date(props.closesAtIso);
  const closesLabel = closesAt.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  const outOfRange = amount < props.minBet || amount > props.maxBet;
  const overBalance = props.balance != null && amount > props.balance;
  const canSubmit = !loading && !outOfRange && !overBalance && props.balance !== null && !props.bankrupt;

  // Cuota provisional de la selección actual (informativa).
  const selKey = market === 'winner' ? `team:${team}` : `exact:${team}:${score}`;
  const marketView = market === 'winner' ? props.pools.winner : props.pools.exact;
  const provMult = marketView.selections[selKey]?.multiplier ?? null;

  async function placeBet() {
    setLoading(true);
    try {
      const res = await fetch('/api/bets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: props.matchId, market, predictedTeam: team,
          predictedScore: market === 'exact_score' ? score : undefined, amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al apostar');
      toast.success(`Apuesta hecha: ${amount} fichas`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al apostar');
    } finally { setLoading(false); }
  }

  async function cancelBet(m: 'winner' | 'exact_score') {
    setLoading(true);
    try {
      const res = await fetch(`/api/bets?matchId=${props.matchId}&market=${m}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cancelar');
      toast.success('Apuesta cancelada y fichas devueltas');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cancelar');
    } finally { setLoading(false); }
  }

  const teamLabel = (t: number) => (t === 1 ? props.team1Label : props.team2Label);

  return (
    <section className="section">
      <div className="lpt-card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h2 className="sec-title" style={{ margin: 0 }}>🎰 La Timba</h2>
          <span className="small muted" style={{ fontWeight: 600 }}>Cierra {closesLabel}</span>
        </div>

        {/* Pools por equipo (mercado ganador) + guía Elo */}
        <div style={{ display: 'flex', gap: 10 }}>
          {[1, 2].map((t) => {
            const v = props.pools.winner.selections[`team:${t}`];
            const fav = props.pools.eloFavoriteTeam === t;
            const selected = team === t;
            const selectable = !isPlayer || props.ownTeam === t;
            return (
              <button
                key={t} type="button"
                disabled={!selectable}
                onClick={() => selectable && setTeam(t as 1 | 2)}
                style={{
                  flex: 1, minWidth: 0, textAlign: 'left', padding: '11px 12px', borderRadius: 12,
                  border: selected ? '1.5px solid var(--acc)' : '1px solid var(--line)',
                  background: selected ? 'color-mix(in oklab, var(--acc) 12%, transparent)' : 'var(--surface)',
                  color: 'inherit', cursor: selectable ? 'pointer' : 'not-allowed', opacity: selectable ? 1 : 0.45,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {teamLabel(t)} {fav && <span title="Favorito según Elo">⭐</span>}
                </div>
                <div className="small num muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                  Bote {v.pool} {v.multiplier != null ? `· x${v.multiplier}` : '· —'}
                </div>
              </button>
            );
          })}
        </div>

        {props.balance === null && <p className="small muted" style={{ margin: 0 }}>Inicia sesión con tu cuenta para apostar.</p>}
        {props.balance !== null && props.bankrupt && (
          <p className="small" style={{ margin: 0, color: 'var(--loss)', fontWeight: 600 }}>💀 Estás en bancarrota. Recompra para volver a apostar.</p>
        )}
        {isPlayer && props.balance !== null && !props.bankrupt && (
          <p className="small muted" style={{ margin: 0 }}>Juegas este partido: solo puedes apostar a tu propia victoria. 💪</p>
        )}

        {props.balance !== null && !props.bankrupt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Mercado: el marcador exacto solo si NO juega el partido */}
            {!isPlayer && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setMarket('winner')}
                  style={toggleStyle(market === 'winner')}>Ganador</button>
                <button type="button" onClick={() => setMarket('exact_score')}
                  style={toggleStyle(market === 'exact_score')}>Marcador exacto</button>
              </div>
            )}
            {market === 'exact_score' && (
              <div style={{ display: 'flex', gap: 8 }}>
                {SCORES.map((s) => (
                  <button key={s} type="button" onClick={() => setScore(s)} style={toggleStyle(score === s)}>{s}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Input type="number" min={props.minBet} max={props.maxBet} step={1} value={amount}
                onChange={(e) => setAmount(Number(e.target.value))} style={{ maxWidth: 110 }} aria-label="Fichas a apostar" />
              <span className="small muted" style={{ fontWeight: 600 }}>fichas ({props.minBet}–{props.maxBet})</span>
            </div>
            <button type="button" onClick={placeBet} disabled={!canSubmit}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 14,
                cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5,
                background: 'var(--acc)', color: 'var(--on-acc)',
              }}>
              Apostar · {teamLabel(team)}{market === 'exact_score' ? ` ${score}` : ''}
            </button>
            <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
              <span>Saldo: <b className="num" style={{ color: 'var(--ink)' }}>{props.balance} fichas</b></span>
              <span>Cuota provisional: <b className="num" style={{ color: 'var(--acc-text)' }}>{provMult != null ? `x${provMult}` : '—'}</b></span>
            </div>
            <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
              La cuota es orientativa: el pago final depende de cómo quede el bote al cerrar.
            </p>
          </div>
        )}

        {/* Apuestas de la peña */}
        {props.allBets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="small muted" style={{ fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 10.5 }}>Apuestas de la peña</div>
            {props.allBets.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LptAvatar player={{ id: b.playerId, name: b.playerName, nickname: b.playerNickname, avatarUrl: b.playerAvatarUrl }} size={26} />
                <span className="small" style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.playerNickname || b.playerName}</span>
                <span className="small muted num" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  → {teamLabel(b.predictedTeam)}{b.market === 'exact_score' ? ` (${b.predictedScore})` : ''} · {b.amount} fichas
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '8px 10px', borderRadius: 10, fontWeight: 700, fontSize: 12.5,
    border: active ? '1.5px solid var(--acc)' : '1px solid var(--line)',
    background: active ? 'color-mix(in oklab, var(--acc) 14%, transparent)' : 'var(--surface)',
    color: active ? 'var(--acc-text)' : 'var(--ink-3)', cursor: 'pointer',
  };
}
```

(Se eliminó el bloque «Tus apuestas» con cancelar por brevedad del pool; si quieres conservarlo, replica el de v1 mostrando `props.myBets` con un botón que llame a `cancelBet`. Mantenlo si el archivo v1 lo tenía y quieres paridad.)

- [ ] **Step 2: Actualizar el page del partido `src/app/(public)/matches/[id]/page.tsx`**

Cambia los imports de La Timba: usa `currentMatchPools` en vez de `currentMatchOdds`, y calcula `ownTeam`. Sustituye el bloque `if (bettingOpen) { … }`:

```tsx
  const session = await getSession();
  const bettingOpen = isBettingOpen(match);
  let timba: React.ReactNode = null;
  if (bettingOpen) {
    const pools = await currentMatchPools(match);
    const allBets = (await db
      .select({
        id: bets.id, playerId: bets.playerId, market: bets.market,
        predictedTeam: bets.predictedTeam, predictedScore: bets.predictedScore, amount: bets.amount,
        playerName: players.name, playerNickname: players.nickname, playerAvatarUrl: players.avatarUrl,
      })
      .from(bets).innerJoin(players, eq(players.id, bets.playerId))
      .where(eq(bets.matchId, match.id))) as PublicBet[];

    const me = session?.player ?? null;
    const team1Ids = [match.team1Player1Id, match.team1Player2Id];
    const team2Ids = [match.team2Player1Id, match.team2Player2Id];
    const ownTeam: 0 | 1 | 2 = me && team1Ids.includes(me.id) ? 1 : me && team2Ids.includes(me.id) ? 2 : 0;
    const myBets = me ? allBets.filter((b) => b.playerId === me.id) : [];

    timba = (
      <BettingCard
        matchId={match.id}
        team1Label={`${displayName(t1p1)}/${displayName(t1p2)}`}
        team2Label={`${displayName(t2p1)}/${displayName(t2p2)}`}
        pools={pools}
        closesAtIso={bettingClosesAt(match.date, match.time).toISOString()}
        balance={me ? me.tokenBalance : null}
        bankrupt={me ? await hasPendingPenalty(me.id) : false}
        ownTeam={ownTeam}
        myBets={myBets}
        allBets={allBets}
        minBet={BETTING.minBet}
        maxBet={BETTING.maxBet}
      />
    );
  } else {
    timba = <BetsSummary matchId={match.id} />;
  }
```

Actualiza el import: `import { currentMatchPools } from '@/lib/betting/match-odds';` y `import { BettingCard, type PublicBet } from '@/components/betting/betting-card';`. Adapta `t1p1…` a los nombres reales de variables de jugadores del page.

- [ ] **Step 3: Compilar y probar visualmente (si hay dev server)**

Run: `npx tsc --noEmit`
Expected: **ahora sí, solo el error PREEXISTENTE de web-push.** Esta tarea reescribe los dos archivos que rompían el `tsc` global desde la Task 6 (`betting-card.tsx` y `matches/[id]/page.tsx`), así que el árbol vuelve a compilar entero. (`bets-summary.tsx` aún muestra `xnull` en runtime; es cosmético y se arregla en la Task 16, no rompe `tsc`.)
Con dev server + datos: crear partido programado con hora futura, registrar entradas (Task 14) a un par de cuentas, apostar desde ambas, comprobar que el bote y las cuotas provisionales se actualizan.

- [ ] **Step 4: Commit**

```bash
git add src/components/betting/betting-card.tsx "src/app/(public)/matches/[id]/page.tsx"
git commit -m "feat(betting): card pari-mutuel (pools, cuota provisional, guía Elo, auto-apuesta)"
```

---

### Task 16: Resumen de liquidación + bote + guía de precio de premios

**Files:**
- Modify: `src/components/betting/bets-summary.tsx`
- Modify: `src/app/me/tokens/page.tsx`
- Modify: `src/app/(public)/rankings/tokens/page.tsx`
- Modify: `src/components/admin/rewards-manager.tsx`

- [ ] **Step 1: `bets-summary.tsx` — quitar referencia a `odds`**

Lee el archivo. En la consulta y el render, **elimina** la columna `odds` (ya no existe valor) y muestra el reparto con `payout`/`amount`/`status` (won 🎉 +payout, lost 💸 −amount, refunded ↩️ +amount). Si el render mostraba `x{odds}`, quítalo.

- [ ] **Step 2: Mostrar el bote en `/rankings/tokens`**

En `src/app/(public)/rankings/tokens/page.tsx`, importa y muestra el bote arriba:

```ts
import { potEuros } from '@/lib/betting/pot';
// dentro del componente, en el Promise.all añade potEuros(); y renderiza:
```

```tsx
<div className="lpt-card" style={{ padding: 14, textAlign: 'center', marginBottom: 12 }}>
  <span className="muted text-sm">💰 Bote actual: </span>
  <strong>{pot.toFixed(2)} €</strong>
</div>
```

Y en la lista, para jugadores que nunca entraron (saldo 0 sin movimientos) puedes añadir un matiz «(no ha entrado)»; si resulta complejo de calcular aquí, déjalo como mejora opcional y no bloquees por ello.

- [ ] **Step 3: Mostrar el bote en `/me/tokens`**

En `src/app/me/tokens/page.tsx`, añade `potEuros()` al `Promise.all` y muestra una línea «💰 Bote de La Timba: X €» bajo el saldo.

- [ ] **Step 4: Guía de precio en `rewards-manager.tsx` (1 céntimo/ficha)**

Lee `src/components/admin/rewards-manager.tsx`. El formulario de alta de premio tiene un input de coste en fichas. Añade un texto de ayuda **vivo** que traduzca el coste a € (el peg de v2):

```tsx
  <p className="muted text-xs">
    Valor recomendado del premio: <b>{(cost * 1) / 100} €</b> (1 ficha = 1 céntimo).
    Mantén esta relación para que el bote cuadre.
  </p>
```

Colócalo bajo el input de `cost` (la variable de estado del coste en ese formulario; ajusta el nombre si difiere). No cambia la lógica de canje, solo orienta al admin.

- [ ] **Step 5: Compilar y commit**

Run: `npx tsc --noEmit` — solo web-push.

```bash
git add src/components/betting/bets-summary.tsx src/app/me/tokens "src/app/(public)/rankings/tokens" src/components/admin/rewards-manager.tsx
git commit -m "feat(betting): resumen pari-mutuel, bote visible y guía de precio de premios"
```

---

### Task 17: Verificación final, despliegue y migración en producción

- [ ] **Step 1: Suite completa + build**

Run: `npx vitest run`
Expected: PASS todos (parimutuel, provisional-odds, settle-logic, close-time, push, etc.).

Run: `npm run build` (con `npm install` y `.env.local` en el worktree)
Expected: build sin errores.

- [ ] **Step 2: Prueba manual del flujo completo (si hay entorno local)**

1. `POST /api/migrate-timba-v2` → `{ success: true }`.
2. Registrar entrada (5 €) a 3-4 cuentas → saldo 500 cada una.
3. Crear partido programado con hora futura.
4. Apostar desde varias cuentas al mismo y a distinto equipo → bote y cuotas provisionales cambian.
5. Un jugador del partido intenta apostar al rival → 403; a su victoria → OK.
6. Registrar resultado → reparto pari-mutuel; comprobar que Σ pagos == pool; push a cada apostante.
7. Forzar bancarrota → registrar recompra → +500 y desbloqueo.
8. Canjear un premio → bote baja en consecuencia.
9. Comprobar `bote € == Σ saldos × 0,01` en todo momento.

- [ ] **Step 3: Merge a main, push y migración en producción**

```bash
git push origin HEAD:main
```

Cuando el deploy esté listo:

```bash
curl -s -X POST https://lomeros-padel-tour.vercel.app/api/migrate-timba-v2
```

Expected: `{"success":true}`.

- [ ] **Step 4: Verificación en producción**

- Abrir un partido programado → card pari-mutuel con pools y guía Elo.
- `/rankings/tokens` y `/me/tokens` muestran el bote.
- `/admin/timba` permite registrar entradas y ver el bote.

---

## Notas para quien ejecute

- **Ventana de `tsc` global sucio (Tasks 4–14):** al borrar `odds.ts` (Task 4) y reescribir `match-odds.ts` (Task 6), quedan rotos `src/components/betting/betting-card.tsx` y `src/app/(public)/matches/[id]/page.tsx` (usan `MatchOdds`/`currentMatchOdds` antiguos). **Es esperado.** Durante esas tareas valida con los `grep` acotados indicados en cada Step de compilación; el **`tsc` global vuelve a estar limpio al terminar la Task 15** (que reescribe esos dos archivos). No trates esos dos errores como regresión hasta entonces.
- **Conservación:** el invariante `Σ pagos == pool` (método del resto mayor) es lo que garantiza que el bote nunca se descuadre. No lo toques sin reejecutar los tests de `parimutuel.test.ts`.
- **Reversión por borrado:** `reverseSettlement` retira lo pagado a ganadores y devueltos; los perdedores no recibieron nada. La guarda `hasLedgerEntry('settlement_reversal', betId)` asume una sola reversión por apuesta (se cumple: solo se revierte al borrar el partido).
- **Migración destructiva:** `migrate-timba-v2` **borra** apuestas, ledger, canjes y penalizaciones y pone todos los saldos a 0. Es intencionado (arranque limpio v2). Confirmado por Guillermo.
- **Estilo:** antes de cualquier componente, lee 1-2 vecinos. Clases (`lpt-card`, `card-pad`, `sec-title`, `muted`) y vars (`--acc`, `--line`, `--on-acc`) del design system «Pista Central».
