# La Timba (apuestas con tokens) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistema de apuestas con tokens virtuales sobre partidos programados: cuotas según Elo congeladas al apostar, liquidación automática al registrar el resultado con push a cada apostante, bancarrota con penalización real + recarga, y canjeo de tokens por premios de un catálogo admin.

**Architecture:** Libro contable (`token_ledger`) + saldo cacheado en `players.tokenBalance`. La lógica pura (cuotas, cierre, liquidación, bancarrota) vive en `src/lib/betting/` con tests; la orquestación con DB sigue el patrón de `process-match.ts` (sin tests unitarios, como el resto del codebase). La liquidación se engancha a los flujos existentes de resultado (`PUT /api/matches/[id]`), lesión (`abandon`) y borrado.

**Tech Stack:** Next.js 16 App Router, Drizzle + Turso/libSQL, Vitest, web-push, shadcn/ui + componentes `lpt`.

**Spec:** `docs/superpowers/specs/2026-06-12-betting-tokens-design.md`

**Reglas de oro del repo** (aplican a TODAS las tareas):

- Lee `node_modules/next/dist/docs/` ante cualquier duda de API de Next.js — esta versión (16.x) tiene breaking changes respecto a tu conocimiento.
- Rutas API: el patrón de auth es `const auth = await requireAdmin(); if ('response' in auth) return auth.response;` (o `requireSession`). Params de rutas dinámicas son `Promise`: `{ params }: { params: Promise<{ id: string }> }`.
- Tests: Vitest, archivos `*.test.ts` junto al módulo, solo para lógica pura (sin DB). Comando: `npx vitest run <ruta>`.
- Los textos de UI y mensajes de error van en castellano.
- Commits frecuentes, mensajes estilo `feat(betting): …` como el historial del repo.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/betting/config.ts` (nuevo) | Constantes de la economía |
| `src/lib/betting/odds.ts` (+test, nuevo) | Cuotas según Elo (puro) |
| `src/lib/betting/close-time.ts` (+test, nuevo) | Instante de cierre de apuestas (puro) |
| `src/lib/betting/settle-logic.ts` (+test, nuevo) | Resultado de cada apuesta y bancarrota (puro) |
| `src/lib/betting/bank.ts` (nuevo) | Movimientos de tokens: saldo + asiento (DB) |
| `src/lib/betting/match-odds.ts` (nuevo) | Cuotas de un partido leyendo players/pairStats (DB) |
| `src/lib/betting/settle.ts` (nuevo) | Liquidar/devolver/revertir apuestas de un partido (DB) |
| `src/lib/push/notifications.ts` (+test, modificar) | Builder del push de liquidación |
| `src/lib/push/bet-events.ts` (nuevo) | Envío de pushes de liquidación (DB, best-effort) |
| `src/lib/db/schema.ts` (modificar) | Tablas `bets`, `token_ledger`, `rewards`, `redemptions`, `penalties`; columnas `players.token_balance`, `matches.time` |
| `src/app/api/migrate-betting/route.ts` (nuevo) | Migración idempotente + backfill saldo inicial |
| `src/app/api/bets/route.ts` (nuevo) | GET/POST/DELETE apuestas |
| `src/app/api/rewards/route.ts` + `[id]/route.ts` (nuevos) | Catálogo de premios (admin) |
| `src/app/api/redemptions/route.ts` + `[id]/route.ts` (nuevos) | Canjes |
| `src/app/api/penalties/route.ts` + `[id]/route.ts` (nuevos) | Penalizaciones de bancarrota |
| `src/app/api/matches/route.ts` (modificar) | Aceptar `time` al crear |
| `src/app/api/matches/[id]/route.ts` (modificar) | Liquidar en PUT; devolver/revertir en DELETE |
| `src/app/api/matches/[id]/abandon/route.ts` (modificar) | Devolver apuestas al abortar por lesión |
| `src/app/api/players/route.ts` (modificar) | Asiento `initial` al crear jugador |
| `src/components/admin/match-form.tsx` (modificar) | Campo hora |
| `src/components/betting/betting-card.tsx` (nuevo) | Card de apuestas (client) |
| `src/components/betting/bets-summary.tsx` (nuevo) | Resumen de liquidación en partido jugado |
| `src/app/(public)/matches/[id]/page.tsx` (modificar) | Integrar card/resumen |
| `src/app/me/tokens/page.tsx` (nuevo) + `src/components/betting/redeem-button.tsx` (nuevo) | Mi cartera: saldo, historial, canjes |
| `src/app/me/page.tsx` (modificar) | Enlace a la cartera |
| `src/app/(public)/rankings/tokens/page.tsx` (nuevo) | Clasificación de tokens |
| `src/app/admin/rewards|redemptions|penalties/page.tsx` + componentes (nuevos) | Gestión admin |
| `src/components/admin/admin-sidebar.tsx` (modificar) | Enlaces nuevos |

---

### Task 1: Constantes de la economía

**Files:**
- Create: `src/lib/betting/config.ts`

- [ ] **Step 1: Crear el archivo de configuración**

```ts
// src/lib/betting/config.ts
// Economía de «La Timba». Cambiar aquí, nunca hardcodear en la lógica.
export const BETTING = {
  initialBalance: 500,   // tokens al crear un jugador / backfill
  minBet: 10,            // apuesta mínima por mercado
  maxBet: 100,           // apuesta máxima por mercado
  oddsMin: 1.2,          // cuota mínima (favorito extremo)
  oddsMax: 4.0,          // cuota máxima (underdog extremo)
  exactScoreMultiplier: 2, // la cuota de marcador exacto = cuota ganador × 2
  rechargeAmount: 250,   // recarga al cumplir la penalización de bancarrota
} as const;

export type BetMarket = 'winner' | 'exact_score';
export type BetStatus = 'open' | 'won' | 'lost' | 'refunded';
export type SetsScore = '2-0' | '2-1';
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/betting/config.ts
git commit -m "feat(betting): constantes de la economía de tokens"
```

---

### Task 2: Cuotas según Elo (TDD)

**Files:**
- Create: `src/lib/betting/odds.ts`
- Test: `src/lib/betting/odds.test.ts`

La probabilidad usa `expectedScore` de `src/lib/rating/elo.ts:14`. Rating de equipo: `pairElo` si la pareja existe en `pair_stats`; si no, media de los Elo individuales.

- [ ] **Step 1: Escribir los tests (fallan)**

```ts
// src/lib/betting/odds.test.ts
import { describe, it, expect } from 'vitest';
import { teamRating, winnerOdds, matchOddsFromRatings } from './odds';

const even = { player1Elo: 1500, player2Elo: 1500, pairElo: null };

describe('teamRating', () => {
  it('usa pairElo cuando existe', () => {
    expect(teamRating({ player1Elo: 1400, player2Elo: 1600, pairElo: 1550 })).toBe(1550);
  });
  it('cae a la media individual sin pairElo', () => {
    expect(teamRating({ player1Elo: 1400, player2Elo: 1600, pairElo: null })).toBe(1500);
  });
});

describe('winnerOdds', () => {
  it('partido igualado paga x2.0', () => {
    expect(winnerOdds(even, even)).toBe(2.0);
  });
  it('el favorito paga menos que el underdog', () => {
    const fav = { player1Elo: 1700, player2Elo: 1700, pairElo: null };
    expect(winnerOdds(fav, even)).toBeLessThan(2.0);
    expect(winnerOdds(even, fav)).toBeGreaterThan(2.0);
  });
  it('clampa a [1.2, 4.0] en desniveles extremos', () => {
    const crack = { player1Elo: 2400, player2Elo: 2400, pairElo: null };
    expect(winnerOdds(crack, even)).toBe(1.2);
    expect(winnerOdds(even, crack)).toBe(4.0);
  });
  it('redondea a 1 decimal', () => {
    const slight = { player1Elo: 1540, player2Elo: 1540, pairElo: null };
    const o = winnerOdds(slight, even);
    expect(o * 10).toBe(Math.round(o * 10));
  });
});

describe('matchOddsFromRatings', () => {
  it('marcador exacto duplica la cuota del ganador', () => {
    const odds = matchOddsFromRatings(even, even);
    expect(odds.team1.winner).toBe(2.0);
    expect(odds.team1.exactScore).toBe(4.0);
    expect(odds.team2.exactScore).toBe(4.0);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/betting/odds.test.ts`
Expected: FAIL — `Cannot find module './odds'` (o equivalente).

- [ ] **Step 3: Implementar**

```ts
// src/lib/betting/odds.ts
// Cuotas según Elo (lógica pura, sin DB).
import { expectedScore } from '@/lib/rating/elo';
import { BETTING } from './config';

export interface TeamRatingInput {
  player1Elo: number;
  player2Elo: number;
  pairElo: number | null; // null si la pareja no figura en pair_stats
}

export interface MatchOdds {
  team1: { winner: number; exactScore: number };
  team2: { winner: number; exactScore: number };
}

export function teamRating(t: TeamRatingInput): number {
  return t.pairElo ?? (t.player1Elo + t.player2Elo) / 2;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function winnerOdds(team: TeamRatingInput, rival: TeamRatingInput): number {
  const p = expectedScore(teamRating(team), teamRating(rival));
  const clamped = Math.min(BETTING.oddsMax, Math.max(BETTING.oddsMin, 1 / p));
  return round1(clamped);
}

export function exactScoreOdds(team: TeamRatingInput, rival: TeamRatingInput): number {
  return round1(winnerOdds(team, rival) * BETTING.exactScoreMultiplier);
}

export function matchOddsFromRatings(team1: TeamRatingInput, team2: TeamRatingInput): MatchOdds {
  return {
    team1: { winner: winnerOdds(team1, team2), exactScore: exactScoreOdds(team1, team2) },
    team2: { winner: winnerOdds(team2, team1), exactScore: exactScoreOdds(team2, team1) },
  };
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/betting/odds.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/betting/odds.ts src/lib/betting/odds.test.ts
git commit -m "feat(betting): cuotas según Elo con clamp y fallback a media individual"
```

---

### Task 3: Cierre de apuestas (TDD)

**Files:**
- Create: `src/lib/betting/close-time.ts`
- Test: `src/lib/betting/close-time.test.ts`

Los partidos guardan `date` ("YYYY-MM-DD") y, tras esta feature, `time` ("HH:MM" o null). El grupo juega en España y el servidor (Vercel) corre en UTC, así que el instante de cierre se calcula en zona `Europe/Madrid`. Sin hora → 00:00 del día del partido.

- [ ] **Step 1: Escribir los tests (fallan)**

```ts
// src/lib/betting/close-time.test.ts
import { describe, it, expect } from 'vitest';
import { bettingClosesAt, isBettingOpen } from './close-time';

describe('bettingClosesAt', () => {
  it('con hora: cierra a esa hora de Madrid (verano = UTC+2)', () => {
    expect(bettingClosesAt('2026-07-10', '19:30').toISOString()).toBe('2026-07-10T17:30:00.000Z');
  });
  it('con hora: en invierno Madrid es UTC+1', () => {
    expect(bettingClosesAt('2026-01-10', '19:30').toISOString()).toBe('2026-01-10T18:30:00.000Z');
  });
  it('sin hora: cierra a las 00:00 de Madrid del día del partido', () => {
    expect(bettingClosesAt('2026-07-10', null).toISOString()).toBe('2026-07-09T22:00:00.000Z');
  });
});

describe('isBettingOpen', () => {
  const match = { date: '2026-07-10', time: '19:30', status: 'scheduled' };
  it('abierta antes del cierre', () => {
    expect(isBettingOpen(match, new Date('2026-07-10T17:29:00Z'))).toBe(true);
  });
  it('cerrada a partir del cierre', () => {
    expect(isBettingOpen(match, new Date('2026-07-10T17:30:00Z'))).toBe(false);
  });
  it('cerrada si el partido no está programado', () => {
    expect(isBettingOpen({ ...match, status: 'completed' }, new Date('2026-07-01T00:00:00Z'))).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/betting/close-time.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/betting/close-time.ts
// Instante de cierre de apuestas. Las fechas/horas del partido se interpretan
// en Europe/Madrid (el grupo juega allí); el servidor corre en UTC.
const TZ = 'Europe/Madrid';

// Offset (ms) de Madrid respecto a UTC en un instante dado.
function tzOffsetMs(at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour), Number(parts.minute), Number(parts.second),
  );
  return asUtc - at.getTime();
}

export function bettingClosesAt(date: string, time: string | null | undefined): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time ?? '00:00').split(':').map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(utcGuess - tzOffsetMs(new Date(utcGuess)));
}

export function isBettingOpen(
  match: { date: string; time?: string | null; status: string },
  now: Date = new Date(),
): boolean {
  if (match.status !== 'scheduled') return false;
  return now.getTime() < bettingClosesAt(match.date, match.time ?? null).getTime();
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/betting/close-time.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/betting/close-time.ts src/lib/betting/close-time.test.ts
git commit -m "feat(betting): cálculo del cierre de apuestas en Europe/Madrid"
```

---

### Task 4: Liquidación pura y bancarrota (TDD)

**Files:**
- Create: `src/lib/betting/settle-logic.ts`
- Test: `src/lib/betting/settle-logic.test.ts`

- [ ] **Step 1: Escribir los tests (fallan)**

```ts
// src/lib/betting/settle-logic.test.ts
import { describe, it, expect } from 'vitest';
import { matchSetsScore, settleBet, isBankrupt, type BetForSettlement } from './settle-logic';

const base: Omit<BetForSettlement, 'market' | 'predictedScore'> = {
  id: 'b1', playerId: 'p1', predictedTeam: 1, amount: 50, odds: 2.0,
};

describe('matchSetsScore', () => {
  it('2-0 si el perdedor no ganó ningún set', () => {
    const sets = [{ team1Games: 6, team2Games: 3 }, { team1Games: 6, team2Games: 4 }];
    expect(matchSetsScore(sets, 1)).toBe('2-0');
  });
  it('2-1 si el perdedor ganó un set', () => {
    const sets = [
      { team1Games: 6, team2Games: 3 },
      { team1Games: 4, team2Games: 6 },
      { team1Games: 7, team2Games: 5 },
    ];
    expect(matchSetsScore(sets, 1)).toBe('2-1');
  });
  it('funciona cuando gana el equipo 2', () => {
    const sets = [{ team1Games: 3, team2Games: 6 }, { team1Games: 6, team2Games: 4 }, { team1Games: 2, team2Games: 6 }];
    expect(matchSetsScore(sets, 2)).toBe('2-1');
  });
});

describe('settleBet — mercado ganador', () => {
  const bet: BetForSettlement = { ...base, market: 'winner', predictedScore: null };
  it('acierto: paga amount × odds redondeado', () => {
    const o = settleBet({ ...bet, odds: 2.3 }, 1, '2-0');
    expect(o.status).toBe('won');
    expect(o.payout).toBe(115); // 50 × 2.3
  });
  it('fallo: lost con payout 0', () => {
    const o = settleBet(bet, 2, '2-0');
    expect(o.status).toBe('lost');
    expect(o.payout).toBe(0);
  });
});

describe('settleBet — marcador exacto', () => {
  const bet: BetForSettlement = { ...base, market: 'exact_score', predictedScore: '2-1', odds: 4.0 };
  it('equipo y marcador correctos: won', () => {
    expect(settleBet(bet, 1, '2-1')).toMatchObject({ status: 'won', payout: 200 });
  });
  it('equipo correcto pero marcador incorrecto: lost', () => {
    expect(settleBet(bet, 1, '2-0').status).toBe('lost');
  });
  it('equipo incorrecto: lost aunque el marcador coincida', () => {
    expect(settleBet(bet, 2, '2-1').status).toBe('lost');
  });
});

describe('isBankrupt', () => {
  it('saldo bajo y sin apuestas abiertas: bancarrota', () => {
    expect(isBankrupt(9, 0)).toBe(true);
  });
  it('saldo bajo pero con apuestas abiertas: aún no', () => {
    expect(isBankrupt(0, 1)).toBe(false);
  });
  it('saldo igual a la apuesta mínima: no', () => {
    expect(isBankrupt(10, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/betting/settle-logic.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/betting/settle-logic.ts
// Decisiones de liquidación (lógica pura, sin DB).
import { BETTING, type BetMarket, type SetsScore } from './config';

export interface BetForSettlement {
  id: string;
  playerId: string;
  market: BetMarket;
  predictedTeam: number;            // 1 | 2
  predictedScore: SetsScore | null; // solo exact_score
  amount: number;
  odds: number;
}

export interface BetOutcome {
  betId: string;
  playerId: string;
  status: 'won' | 'lost';
  amount: number;
  payout: number; // 0 si lost
}

export function matchSetsScore(
  sets: { team1Games: number; team2Games: number }[],
  winnerTeam: 1 | 2,
): SetsScore {
  const loserSetsWon = sets.filter((s) =>
    winnerTeam === 1 ? s.team2Games > s.team1Games : s.team1Games > s.team2Games,
  ).length;
  return loserSetsWon === 0 ? '2-0' : '2-1';
}

export function settleBet(bet: BetForSettlement, winnerTeam: 1 | 2, score: SetsScore): BetOutcome {
  const teamOk = bet.predictedTeam === winnerTeam;
  const won = bet.market === 'winner' ? teamOk : teamOk && bet.predictedScore === score;
  return {
    betId: bet.id,
    playerId: bet.playerId,
    status: won ? 'won' : 'lost',
    amount: bet.amount,
    payout: won ? Math.round(bet.amount * bet.odds) : 0,
  };
}

export function isBankrupt(balance: number, openBetsCount: number): boolean {
  return balance < BETTING.minBet && openBetsCount === 0;
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/betting/settle-logic.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/betting/settle-logic.ts src/lib/betting/settle-logic.test.ts
git commit -m "feat(betting): liquidación pura de apuestas y predicado de bancarrota"
```

---

### Task 5: Schema y migración

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/app/api/migrate-betting/route.ts`
- Modify: `src/app/api/players/route.ts` (asiento `initial` al crear jugador)

- [ ] **Step 1: Añadir columnas a tablas existentes en `src/lib/db/schema.ts`**

En `players` (tras `isLeftHanded`, línea ~14):

```ts
  tokenBalance: integer('token_balance').notNull().default(500),
```

En `matches` (tras `date`, línea ~30):

```ts
  time: text('time'), // "HH:MM" hora local (Europe/Madrid), null en partidos antiguos
```

- [ ] **Step 2: Añadir las tablas nuevas al final de `src/lib/db/schema.ts` (antes del bloque TYPES)**

```ts
// ─── BETS (apuestas «La Timba») ──────────────────────────────────────────────
export const bets = sqliteTable('bets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  matchId: text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  market: text('market').notNull(),            // 'winner' | 'exact_score'
  predictedTeam: integer('predicted_team').notNull(), // 1 | 2
  predictedScore: text('predicted_score'),     // '2-0' | '2-1' | null (solo exact_score)
  amount: integer('amount').notNull(),
  odds: real('odds').notNull(),                // cuota congelada al apostar (incluye ×2 si exact_score)
  status: text('status').notNull().default('open'), // 'open' | 'won' | 'lost' | 'refunded'
  payout: integer('payout').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  settledAt: text('settled_at'),
}, (t) => ([
  unique().on(t.matchId, t.playerId, t.market),
]));

// ─── TOKEN LEDGER (libro contable de tokens) ─────────────────────────────────
export const tokenLedger = sqliteTable('token_ledger', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(), // con signo
  reason: text('reason').notNull(),
  // 'initial' | 'bet_placed' | 'bet_cancelled' | 'bet_won' | 'bet_refunded' |
  // 'recharge' | 'redemption' | 'redemption_refunded' | 'settlement_reversal' | 'adjustment'
  refId: text('ref_id'), // id de bet/redemption/penalty según reason
  balanceAfter: integer('balance_after').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── REWARDS (catálogo de premios) ───────────────────────────────────────────
export const rewards = sqliteTable('rewards', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  description: text('description'),
  cost: integer('cost').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── REDEMPTIONS (canjes) ────────────────────────────────────────────────────
export const redemptions = sqliteTable('redemptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  rewardId: text('reward_id').notNull().references(() => rewards.id),
  cost: integer('cost').notNull(), // precio congelado al canjear
  status: text('status').notNull().default('pending'), // 'pending' | 'fulfilled' | 'cancelled'
  requestedAt: text('requested_at').notNull().default(sql`(datetime('now'))`),
  resolvedAt: text('resolved_at'),
});

// ─── PENALTIES (bancarrotas) ─────────────────────────────────────────────────
export const penalties = sqliteTable('penalties', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  description: text('description'), // null hasta que el admin la asigne
  status: text('status').notNull().default('pending'), // 'pending' | 'fulfilled'
  rechargeAmount: integer('recharge_amount').notNull().default(250),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  fulfilledAt: text('fulfilled_at'),
});
```

Y en el bloque TYPES del final:

```ts
export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;
export type TokenLedgerRow = typeof tokenLedger.$inferSelect;
export type Reward = typeof rewards.$inferSelect;
export type Redemption = typeof redemptions.$inferSelect;
export type Penalty = typeof penalties.$inferSelect;
```

- [ ] **Step 3: Crear la migración idempotente**

Sigue el patrón de `src/app/api/migrate-db/route.ts` (sin auth, ALTER en try/catch, CREATE TABLE IF NOT EXISTS):

```ts
// src/app/api/migrate-betting/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql, inArray } from 'drizzle-orm';
import { players, tokenLedger } from '@/lib/db/schema';
import { BETTING } from '@/lib/betting/config';

// POST /api/migrate-betting — migración de «La Timba». Idempotente.
export async function POST() {
  try {
    // 1. Columnas nuevas
    try {
      await db.run(sql`ALTER TABLE players ADD COLUMN token_balance INTEGER NOT NULL DEFAULT 500`);
    } catch { /* ya existe */ }
    try {
      await db.run(sql`ALTER TABLE matches ADD COLUMN time TEXT`);
    } catch { /* ya existe */ }

    // 2. Tablas nuevas
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS bets (
        id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        market TEXT NOT NULL,
        predicted_team INTEGER NOT NULL,
        predicted_score TEXT,
        amount INTEGER NOT NULL,
        odds REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        payout INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        settled_at TEXT,
        UNIQUE (match_id, player_id, market)
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS token_ledger (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        ref_id TEXT,
        balance_after INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS rewards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        cost INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS redemptions (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        reward_id TEXT NOT NULL REFERENCES rewards(id),
        cost INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT
      )
    `);
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS penalties (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        recharge_amount INTEGER NOT NULL DEFAULT 250,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        fulfilled_at TEXT
      )
    `);

    // 3. Backfill: asiento 'initial' para jugadores que aún no lo tengan.
    //    (el ALTER con DEFAULT ya les dio los 500 de saldo)
    const allPlayers = await db.select().from(players);
    const existing = allPlayers.length
      ? await db.select().from(tokenLedger)
          .where(inArray(tokenLedger.playerId, allPlayers.map((p) => p.id)))
      : [];
    const hasInitial = new Set(existing.filter((e) => e.reason === 'initial').map((e) => e.playerId));
    let backfilled = 0;
    for (const p of allPlayers) {
      if (hasInitial.has(p.id)) continue;
      await db.insert(tokenLedger).values({
        playerId: p.id,
        amount: BETTING.initialBalance,
        reason: 'initial',
        balanceAfter: p.tokenBalance,
      });
      backfilled++;
    }

    return NextResponse.json({ success: true, backfilled });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error durante la migración', detail: String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Asiento `initial` al crear jugador nuevo**

En `src/app/api/players/route.ts`, dentro del POST, justo después del `db.insert(players)...returning()` (línea ~38, tras obtener `player`):

```ts
    // Saldo inicial de «La Timba» (el default de la columna ya pone 500)
    await db.insert(tokenLedger).values({
      playerId: player.id,
      amount: BETTING.initialBalance,
      reason: 'initial',
      balanceAfter: player.tokenBalance,
    });
```

Añade a los imports del archivo: `tokenLedger` desde `@/lib/db/schema` y `BETTING` desde `@/lib/betting/config`.

- [ ] **Step 5: Verificar compilación y migración en local**

Run: `npx tsc --noEmit`
Expected: sin errores.

Si tienes el dev server con DB local (`npm run dev` con las TURSO env vars):
Run: `curl -s -X POST http://localhost:3000/api/migrate-betting`
Expected: `{"success":true,"backfilled":N}` (y una segunda ejecución devuelve `backfilled: 0`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/app/api/migrate-betting/route.ts src/app/api/players/route.ts
git commit -m "feat(betting): schema de apuestas, ledger, premios y penalizaciones + migración"
```

---

### Task 6: Banco de tokens y cuotas de partido (DB)

**Files:**
- Create: `src/lib/betting/bank.ts`
- Create: `src/lib/betting/match-odds.ts`

Sin tests unitarios (acceso a DB), igual que `process-match.ts`.

- [ ] **Step 1: Crear `src/lib/betting/bank.ts`**

```ts
// src/lib/betting/bank.ts
// Movimientos de tokens: actualiza el saldo cacheado y deja asiento en el ledger.
import { db } from '@/lib/db';
import { players, tokenLedger } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

export type LedgerReason =
  | 'initial' | 'bet_placed' | 'bet_cancelled' | 'bet_won' | 'bet_refunded'
  | 'recharge' | 'redemption' | 'redemption_refunded' | 'settlement_reversal' | 'adjustment';

// Aplica un movimiento. El UPDATE condicional evita que dos peticiones
// concurrentes dejen el saldo en negativo (no hay transacciones multi-statement
// en este codebase; la condición en el WHERE hace de guarda atómica).
// `allowNegative` solo lo usa la reversión de liquidaciones.
export async function applyTokenMovement(
  playerId: string,
  amount: number,
  reason: LedgerReason,
  refId?: string | null,
  opts?: { allowNegative?: boolean },
): Promise<number> {
  const guard = amount < 0 && !opts?.allowNegative
    ? and(eq(players.id, playerId), sql`${players.tokenBalance} + ${amount} >= 0`)
    : eq(players.id, playerId);

  const updated = await db
    .update(players)
    .set({ tokenBalance: sql`${players.tokenBalance} + ${amount}` })
    .where(guard)
    .returning({ balance: players.tokenBalance });

  if (!updated[0]) throw new Error('SALDO_INSUFICIENTE');

  await db.insert(tokenLedger).values({
    playerId,
    amount,
    reason,
    refId: refId ?? null,
    balanceAfter: updated[0].balance,
  });
  return updated[0].balance;
}
```

- [ ] **Step 2: Crear `src/lib/betting/match-odds.ts`**

```ts
// src/lib/betting/match-odds.ts
// Cuotas vigentes de un partido, leyendo Elo individual y de pareja de la DB.
import { db } from '@/lib/db';
import { players, pairStats, type Match } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { matchOddsFromRatings, type MatchOdds, type TeamRatingInput } from './odds';

async function pairEloOf(p1: string, p2: string): Promise<number | null> {
  const [a, b] = [p1, p2].sort();
  const [row] = await db
    .select()
    .from(pairStats)
    .where(and(eq(pairStats.player1Id, a), eq(pairStats.player2Id, b)))
    .limit(1);
  // Una pareja sin partidos jugados no aporta señal: usar media individual.
  return row && row.matchesPlayed > 0 ? row.pairElo : null;
}

export async function currentMatchOdds(
  match: Pick<Match, 'team1Player1Id' | 'team1Player2Id' | 'team2Player1Id' | 'team2Player2Id'>,
): Promise<MatchOdds> {
  const ids = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id];
  const rows = await db.select().from(players).where(inArray(players.id, ids));
  const eloOf = (id: string) => rows.find((p) => p.id === id)?.eloRating ?? 1500;

  const team1: TeamRatingInput = {
    player1Elo: eloOf(match.team1Player1Id),
    player2Elo: eloOf(match.team1Player2Id),
    pairElo: await pairEloOf(match.team1Player1Id, match.team1Player2Id),
  };
  const team2: TeamRatingInput = {
    player1Elo: eloOf(match.team2Player1Id),
    player2Elo: eloOf(match.team2Player2Id),
    pairElo: await pairEloOf(match.team2Player1Id, match.team2Player2Id),
  };
  return matchOddsFromRatings(team1, team2);
}
```

- [ ] **Step 3: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/betting/bank.ts src/lib/betting/match-odds.ts
git commit -m "feat(betting): banco de tokens con guarda de saldo y cuotas de partido desde DB"
```

---

### Task 7: Push de liquidación (TDD del builder)

**Files:**
- Modify: `src/lib/push/notifications.ts`
- Test: `src/lib/push/notifications.test.ts` (añadir bloque)
- Create: `src/lib/push/bet-events.ts`

- [ ] **Step 1: Añadir tests del builder a `src/lib/push/notifications.test.ts`**

Añade el import `buildBetSettledNotification` al import existente de `./notifications`, y al final del archivo:

```ts
describe('buildBetSettledNotification', () => {
  it('apuesta ganada: muestra premio neto y enlace al partido', () => {
    const p = buildBetSettledNotification('won', 50, 115, 'Pepe/Juan vs Luis/Edu', 'm1');
    expect(p.title).toContain('Acertaste');
    expect(p.body).toContain('+115');
    expect(p.body).toContain('Pepe/Juan vs Luis/Edu');
    expect(p.url).toBe('/matches/m1');
  });
  it('apuesta perdida: muestra lo perdido', () => {
    const p = buildBetSettledNotification('lost', 40, 0, 'A/B vs C/D', 'm2');
    expect(p.title).toContain('Fallaste');
    expect(p.body).toContain('-40');
  });
  it('apuesta devuelta', () => {
    const p = buildBetSettledNotification('refunded', 40, 0, 'A/B vs C/D', 'm3');
    expect(p.title).toContain('devuelta');
    expect(p.body).toContain('+40');
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/push/notifications.test.ts`
Expected: FAIL — `buildBetSettledNotification` no exportado.

- [ ] **Step 3: Implementar el builder en `src/lib/push/notifications.ts`**

```ts
export function buildBetSettledNotification(
  status: 'won' | 'lost' | 'refunded',
  amount: number,
  payout: number,
  matchLabel: string,
  matchId: string,
): PushPayload {
  const title =
    status === 'won' ? '🎉 ¡Acertaste tu apuesta!'
    : status === 'lost' ? '💸 Fallaste tu apuesta'
    : '↩️ Apuesta devuelta';
  const delta = status === 'won' ? `+${payout}` : status === 'lost' ? `-${amount}` : `+${amount}`;
  return {
    title,
    body: `${matchLabel} · ${delta} tokens`,
    url: `/matches/${matchId}`,
    tag: `bet-${matchId}-${status}`,
  };
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/push/notifications.test.ts`
Expected: PASS (los previos + 3 nuevos).

- [ ] **Step 5: Crear `src/lib/push/bet-events.ts`**

Sigue el patrón best-effort de `src/lib/push/match-events.ts`:

```ts
// src/lib/push/bet-events.ts
import { db } from '@/lib/db';
import { matches, players } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { sendToUsers, userIdsForPlayers } from './send';
import { buildBetSettledNotification } from './notifications';

export interface SettledBetForPush {
  playerId: string;
  status: 'won' | 'lost' | 'refunded';
  amount: number;
  payout: number;
}

// Push individual a cada apostante con su resultado. Best-effort: nunca lanza.
export async function notifyBetSettlements(matchId: string, outcomes: SettledBetForPush[]): Promise<void> {
  try {
    if (outcomes.length === 0) return;
    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match) return;

    const ids = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id];
    const rows = await db.select().from(players).where(inArray(players.id, ids));
    const nameOf = (id: string) => {
      const p = rows.find((r) => r.id === id);
      return p?.nickname || p?.name || '?';
    };
    const label = `${nameOf(ids[0])}/${nameOf(ids[1])} vs ${nameOf(ids[2])}/${nameOf(ids[3])}`;

    for (const o of outcomes) {
      const userIds = await userIdsForPlayers([o.playerId]);
      if (userIds.length === 0) continue;
      await sendToUsers(userIds, buildBetSettledNotification(o.status, o.amount, o.payout, label, matchId));
    }
  } catch (error) {
    console.error('notifyBetSettlements error', error);
  }
}
```

- [ ] **Step 6: Compilar y commit**

Run: `npx tsc --noEmit` — sin errores.

```bash
git add src/lib/push/notifications.ts src/lib/push/notifications.test.ts src/lib/push/bet-events.ts
git commit -m "feat(betting): notificaciones push de liquidación de apuestas"
```

---

### Task 8: Orquestador de liquidación (DB)

**Files:**
- Create: `src/lib/betting/settle.ts`

- [ ] **Step 1: Crear `src/lib/betting/settle.ts`**

```ts
// src/lib/betting/settle.ts
// Orquestación de liquidación/devolución/reversión de apuestas (con DB).
// La decisión por apuesta es pura y vive en settle-logic.ts.
import { db } from '@/lib/db';
import { bets, players, penalties } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { matchSetsScore, settleBet, isBankrupt } from './settle-logic';
import { applyTokenMovement } from './bank';
import { BETTING, type SetsScore } from './config';
import type { SettledBetForPush } from '@/lib/push/bet-events';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// Liquida las apuestas abiertas de un partido completado.
export async function settleMatchBets(
  matchId: string,
  winnerTeam: 1 | 2,
  sets: { team1Games: number; team2Games: number }[],
): Promise<SettledBetForPush[]> {
  const open = await db.select().from(bets)
    .where(and(eq(bets.matchId, matchId), eq(bets.status, 'open')));
  if (open.length === 0) return [];

  const score: SetsScore = matchSetsScore(sets, winnerTeam);
  const results: SettledBetForPush[] = [];

  for (const bet of open) {
    const o = settleBet(
      {
        id: bet.id, playerId: bet.playerId,
        market: bet.market as 'winner' | 'exact_score',
        predictedTeam: bet.predictedTeam,
        predictedScore: bet.predictedScore as SetsScore | null,
        amount: bet.amount, odds: bet.odds,
      },
      winnerTeam, score,
    );
    await db.update(bets)
      .set({ status: o.status, payout: o.payout, settledAt: now() })
      .where(eq(bets.id, bet.id));
    if (o.status === 'won') {
      await applyTokenMovement(bet.playerId, o.payout, 'bet_won', bet.id);
    }
    results.push({ playerId: bet.playerId, status: o.status, amount: bet.amount, payout: o.payout });
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
    await db.update(bets)
      .set({ status: 'refunded', settledAt: now() })
      .where(eq(bets.id, bet.id));
    await applyTokenMovement(bet.playerId, bet.amount, 'bet_refunded', bet.id);
    results.push({ playerId: bet.playerId, status: 'refunded', amount: bet.amount, payout: 0 });
  }
  return results;
}

// Revierte una liquidación (p. ej. al borrar un partido completado):
// - won: retira el payout (puede dejar saldo negativo → bancarrota)
// - lost: devuelve lo apostado
// Las apuestas vuelven a 'open' conservando su cuota.
export async function reverseSettlement(matchId: string): Promise<void> {
  const settled = await db.select().from(bets)
    .where(and(eq(bets.matchId, matchId), inArray(bets.status, ['won', 'lost'])));
  for (const bet of settled) {
    if (bet.status === 'won') {
      await applyTokenMovement(bet.playerId, -bet.payout, 'settlement_reversal', bet.id, { allowNegative: true });
    } else {
      await applyTokenMovement(bet.playerId, bet.amount, 'settlement_reversal', bet.id);
    }
    await db.update(bets)
      .set({ status: 'open', payout: 0, settledAt: null })
      .where(eq(bets.id, bet.id));
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

    await db.insert(penalties).values({
      playerId,
      rechargeAmount: BETTING.rechargeAmount,
    });
  }
}

// ¿Tiene el jugador una penalización pendiente? (bloquea apostar y canjear)
export async function hasPendingPenalty(playerId: string): Promise<boolean> {
  const rows = await db.select().from(penalties)
    .where(and(eq(penalties.playerId, playerId), eq(penalties.status, 'pending')));
  return rows.length > 0;
}
```

- [ ] **Step 2: Compilar**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/betting/settle.ts
git commit -m "feat(betting): orquestador de liquidación, devoluciones, reversión y bancarrota"
```

---

### Task 9: API de apuestas

**Files:**
- Create: `src/app/api/bets/route.ts`

Semántica del POST: si ya existe una apuesta abierta del jugador en ese mercado, se sustituye (devolución + alta con cuota recalculada) — así "editar" es el mismo endpoint. DELETE cancela.

- [ ] **Step 1: Crear `src/app/api/bets/route.ts`**

```ts
// src/app/api/bets/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bets, matches, players } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/guard';
import { BETTING } from '@/lib/betting/config';
import { isBettingOpen } from '@/lib/betting/close-time';
import { currentMatchOdds } from '@/lib/betting/match-odds';
import { applyTokenMovement } from '@/lib/betting/bank';
import { hasPendingPenalty } from '@/lib/betting/settle';

// GET /api/bets?matchId=… → apuestas (públicas) de un partido, con nombre del apostante
// GET /api/bets?mine=1   → mis apuestas (requiere sesión)
export async function GET(request: NextRequest) {
  try {
    const matchId = request.nextUrl.searchParams.get('matchId');
    const mine = request.nextUrl.searchParams.get('mine');

    if (matchId) {
      const rows = await db
        .select({
          id: bets.id, matchId: bets.matchId, playerId: bets.playerId,
          market: bets.market, predictedTeam: bets.predictedTeam,
          predictedScore: bets.predictedScore, amount: bets.amount,
          odds: bets.odds, status: bets.status, payout: bets.payout,
          createdAt: bets.createdAt,
          playerName: players.name, playerNickname: players.nickname,
          playerAvatarUrl: players.avatarUrl,
        })
        .from(bets)
        .innerJoin(players, eq(players.id, bets.playerId))
        .where(eq(bets.matchId, matchId))
        .orderBy(desc(bets.createdAt));
      return NextResponse.json(rows);
    }

    if (mine) {
      const auth = await requireSession();
      if ('response' in auth) return auth.response;
      if (!auth.session.player) return NextResponse.json([]);
      const rows = await db.select().from(bets)
        .where(eq(bets.playerId, auth.session.player.id))
        .orderBy(desc(bets.createdAt));
      return NextResponse.json(rows);
    }

    return NextResponse.json({ error: 'Falta matchId o mine' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Error al obtener apuestas' }, { status: 500 });
  }
}

// POST /api/bets
// Body: { matchId, market: 'winner'|'exact_score', predictedTeam: 1|2,
//         predictedScore?: '2-0'|'2-1', amount: number }
// Si ya hay apuesta abierta en ese mercado, se sustituye.
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  const player = auth.session.player;
  if (!player) {
    return NextResponse.json({ error: 'Tu cuenta no está vinculada a un jugador' }, { status: 403 });
  }
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
    const inMatch = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id]
      .includes(player.id);
    if (inMatch) {
      return NextResponse.json({ error: 'No puedes apostar en un partido que juegas' }, { status: 403 });
    }
    if (await hasPendingPenalty(player.id)) {
      return NextResponse.json(
        { error: 'Estás en bancarrota: cumple tu penalización para volver a apostar' },
        { status: 403 },
      );
    }

    // Cuota recalculada en servidor (la del cliente es informativa)
    const odds = await currentMatchOdds(match);
    const teamOdds = predictedTeam === 1 ? odds.team1 : odds.team2;
    const frozenOdds = market === 'winner' ? teamOdds.winner : teamOdds.exactScore;

    // Sustituir apuesta previa abierta en este mercado, si la hay
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

    const [bet] = await db.insert(bets).values({
      matchId,
      playerId: player.id,
      market,
      predictedTeam,
      predictedScore: market === 'exact_score' ? predictedScore : null,
      amount,
      odds: frozenOdds,
    }).returning();

    return NextResponse.json({ bet, balance: newBalance }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al apostar' }, { status: 500 });
  }
}

// DELETE /api/bets?matchId=…&market=… — cancela mi apuesta abierta
export async function DELETE(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  const player = auth.session.player;
  if (!player) return NextResponse.json({ error: 'Sin jugador vinculado' }, { status: 403 });
  try {
    const matchId = request.nextUrl.searchParams.get('matchId');
    const market = request.nextUrl.searchParams.get('market');
    if (!matchId || !market) {
      return NextResponse.json({ error: 'Faltan matchId y market' }, { status: 400 });
    }

    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (!isBettingOpen(match)) {
      return NextResponse.json({ error: 'Las apuestas ya están cerradas' }, { status: 400 });
    }

    const [bet] = await db.select().from(bets).where(and(
      eq(bets.matchId, matchId), eq(bets.playerId, player.id), eq(bets.market, market),
    ));
    if (!bet || bet.status !== 'open') {
      return NextResponse.json({ error: 'No tienes apuesta abierta en ese mercado' }, { status: 404 });
    }

    await applyTokenMovement(player.id, bet.amount, 'bet_cancelled', bet.id);
    await db.delete(bets).where(eq(bets.id, bet.id));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error al cancelar la apuesta' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Compilar**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/bets/route.ts
git commit -m "feat(betting): API de apuestas (consultar, apostar/sustituir, cancelar)"
```

---

### Task 10: Hora del partido (admin + API)

**Files:**
- Modify: `src/components/admin/match-form.tsx`
- Modify: `src/app/api/matches/route.ts`

- [ ] **Step 1: Añadir `time` al POST de `src/app/api/matches/route.ts`**

En el destructuring del body (línea ~32) añade `time,` después de `date,`. En el `db.insert(matches).values({...})` (línea ~78) añade tras `date,`:

```ts
        time: typeof time === 'string' && /^\d{2}:\d{2}$/.test(time) ? time : null,
```

- [ ] **Step 2: Añadir el campo hora a `src/components/admin/match-form.tsx`**

Junto al estado `date` (línea ~27):

```ts
  const [time, setTime] = useState('');
```

En el body del fetch POST (línea ~98, junto a `date,`):

```ts
      time: time || null,
```

En el JSX, junto al input de fecha (línea ~228-231), envuelve fecha y hora en una fila de dos columnas siguiendo el estilo del formulario:

```tsx
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date">Fecha *</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="time">Hora</Label>
              <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              <p className="muted text-xs mt-1">Las apuestas cierran a esta hora</p>
            </div>
          </div>
```

(Lee el archivo antes: si fecha ya está dentro de un grid, añade solo la celda de hora.)

- [ ] **Step 3: Compilar y commit**

Run: `npx tsc --noEmit` — sin errores.

```bash
git add src/components/admin/match-form.tsx src/app/api/matches/route.ts
git commit -m "feat(betting): hora del partido en formulario admin y API (cierre de apuestas)"
```

---

### Task 11: Enganchar la liquidación a los flujos de partido

**Files:**
- Modify: `src/app/api/matches/[id]/route.ts` (PUT y DELETE)
- Modify: `src/app/api/matches/[id]/abandon/route.ts`

- [ ] **Step 1: PUT — liquidar (o devolver si cambió el cartel)**

En `src/app/api/matches/[id]/route.ts`, añade imports:

```ts
import { settleMatchBets, refundOpenBets, reverseSettlement } from '@/lib/betting/settle';
import { notifyBetSettlements } from '@/lib/push/bet-events';
```

Dentro del PUT, después de validar `pairingProvided` (línea ~92) y **antes** de calcular el ganador, detecta si la composición de equipos cambió respecto a lo programado (si cambió, las apuestas se devuelven porque se hicieron sobre otro cartel):

```ts
    // ¿Cambió la composición de los equipos respecto a lo programado?
    const sameTeam = (a: [string, string], b: [string, string]) =>
      [...a].sort().join() === [...b].sort().join();
    const pairingChanged = pairingProvided && !(
      sameTeam([match.team1Player1Id, match.team1Player2Id], [team1Player1Id, team1Player2Id]) &&
      sameTeam([match.team2Player1Id, match.team2Player2Id], [team2Player1Id, team2Player2Id])
    );
```

Después del bloque que ya existe de `processMatchRatings` + `notifyMatchResult` (líneas ~134-137), añade:

```ts
    // «La Timba»: liquidar apuestas (o devolverlas si el cartel cambió)
    const betOutcomes = pairingChanged
      ? await refundOpenBets(id)
      : await settleMatchBets(id, winnerTeam, sets);
    await notifyBetSettlements(id, betOutcomes);
```

- [ ] **Step 2: DELETE — devolver o revertir antes de borrar**

En el DELETE del mismo archivo, antes del `db.delete(matches)` (línea ~36):

```ts
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    if (match) {
      if (match.status === 'completed') {
        // Deshacer la liquidación: los ganadores devuelven el premio,
        // los perdedores recuperan lo apostado.
        await reverseSettlement(id);
      }
      // Devolver las apuestas que queden abiertas y avisar
      const refunded = await refundOpenBets(id);
      await notifyBetSettlements(id, refunded);
    }
```

(El borrado del partido elimina las filas de `bets` en cascada; el ledger conserva los asientos.)

- [ ] **Step 3: Abandon — devolver apuestas**

En `src/app/api/matches/[id]/abandon/route.ts`, añade imports:

```ts
import { refundOpenBets } from '@/lib/betting/settle';
import { notifyBetSettlements } from '@/lib/push/bet-events';
```

Tras el `db.update(matches).set({ status: 'injury_aborted', … })` (línea ~50):

```ts
    // «La Timba»: partido anulado → devolución íntegra
    const refunded = await refundOpenBets(id);
    await notifyBetSettlements(id, refunded);
```

- [ ] **Step 4: Compilar y commit**

Run: `npx tsc --noEmit` — sin errores.

```bash
git add "src/app/api/matches/[id]/route.ts" "src/app/api/matches/[id]/abandon/route.ts"
git commit -m "feat(betting): liquidación enganchada a resultado, lesión y borrado de partido"
```

---

### Task 12: APIs de premios, canjes y penalizaciones

**Files:**
- Create: `src/app/api/rewards/route.ts`
- Create: `src/app/api/rewards/[id]/route.ts`
- Create: `src/app/api/redemptions/route.ts`
- Create: `src/app/api/redemptions/[id]/route.ts`
- Create: `src/app/api/penalties/route.ts`
- Create: `src/app/api/penalties/[id]/route.ts`

- [ ] **Step 1: `src/app/api/rewards/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rewards } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';

// GET /api/rewards — catálogo completo (la UI pública filtra por active)
export async function GET() {
  try {
    const all = await db.select().from(rewards).orderBy(rewards.cost, desc(rewards.createdAt));
    return NextResponse.json(all);
  } catch {
    return NextResponse.json({ error: 'Error al obtener premios' }, { status: 500 });
  }
}

// POST /api/rewards — crear premio (admin)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { title, description, cost } = await request.json();
    if (!title?.trim()) return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 });
    if (!Number.isInteger(cost) || cost <= 0) {
      return NextResponse.json({ error: 'El coste debe ser un entero positivo' }, { status: 400 });
    }
    const [reward] = await db.insert(rewards).values({
      title: title.trim(),
      description: description?.trim() || null,
      cost,
    }).returning();
    return NextResponse.json(reward, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Error al crear premio' }, { status: 500 });
  }
}
```

- [ ] **Step 2: `src/app/api/rewards/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rewards } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';

// PUT /api/rewards/[id] — editar premio (admin). Body: { title?, description?, cost?, active? }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const fields: Record<string, unknown> = {};
    if (typeof body.title === 'string' && body.title.trim()) fields.title = body.title.trim();
    if (body.description !== undefined) fields.description = body.description?.trim() || null;
    if (Number.isInteger(body.cost) && body.cost > 0) fields.cost = body.cost;
    if (typeof body.active === 'boolean') fields.active = body.active;
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }
    const [updated] = await db.update(rewards).set(fields).where(eq(rewards.id, id)).returning();
    if (!updated) return NextResponse.json({ error: 'Premio no encontrado' }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Error al actualizar premio' }, { status: 500 });
  }
}

// DELETE /api/rewards/[id] — desactivar (soft delete; los canjes lo referencian)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const [updated] = await db.update(rewards).set({ active: false }).where(eq(rewards.id, id)).returning();
    if (!updated) return NextResponse.json({ error: 'Premio no encontrado' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error al desactivar premio' }, { status: 500 });
  }
}
```

- [ ] **Step 3: `src/app/api/redemptions/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redemptions, rewards, players } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { requireSession, requireAdmin } from '@/lib/auth/guard';
import { applyTokenMovement } from '@/lib/betting/bank';
import { hasPendingPenalty, detectBankruptcies } from '@/lib/betting/settle';

// GET /api/redemptions?all=1 (admin) | sin params → los míos
export async function GET(request: NextRequest) {
  const all = request.nextUrl.searchParams.get('all');
  if (all) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;
    const rows = await db
      .select({
        id: redemptions.id, playerId: redemptions.playerId, cost: redemptions.cost,
        status: redemptions.status, requestedAt: redemptions.requestedAt,
        rewardTitle: rewards.title, playerName: players.name, playerNickname: players.nickname,
      })
      .from(redemptions)
      .innerJoin(rewards, eq(rewards.id, redemptions.rewardId))
      .innerJoin(players, eq(players.id, redemptions.playerId))
      .orderBy(desc(redemptions.requestedAt));
    return NextResponse.json(rows);
  }

  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  if (!auth.session.player) return NextResponse.json([]);
  const rows = await db
    .select({
      id: redemptions.id, cost: redemptions.cost, status: redemptions.status,
      requestedAt: redemptions.requestedAt, rewardTitle: rewards.title,
    })
    .from(redemptions)
    .innerJoin(rewards, eq(rewards.id, redemptions.rewardId))
    .where(eq(redemptions.playerId, auth.session.player.id))
    .orderBy(desc(redemptions.requestedAt));
  return NextResponse.json(rows);
}

// POST /api/redemptions — canjear. Body: { rewardId }
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  const player = auth.session.player;
  if (!player) return NextResponse.json({ error: 'Sin jugador vinculado' }, { status: 403 });
  try {
    const { rewardId } = await request.json();
    const [reward] = await db.select().from(rewards).where(eq(rewards.id, rewardId));
    if (!reward || !reward.active) {
      return NextResponse.json({ error: 'Premio no disponible' }, { status: 404 });
    }
    if (await hasPendingPenalty(player.id)) {
      return NextResponse.json({ error: 'Estás en bancarrota: cumple tu penalización antes' }, { status: 403 });
    }

    const [redemption] = await db.insert(redemptions).values({
      playerId: player.id,
      rewardId: reward.id,
      cost: reward.cost,
    }).returning();

    try {
      await applyTokenMovement(player.id, -reward.cost, 'redemption', redemption.id);
    } catch {
      await db.delete(redemptions).where(eq(redemptions.id, redemption.id));
      return NextResponse.json({ error: 'No tienes saldo suficiente' }, { status: 400 });
    }

    await detectBankruptcies([player.id]);
    return NextResponse.json(redemption, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Error al canjear' }, { status: 500 });
  }
}
```

- [ ] **Step 4: `src/app/api/redemptions/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redemptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { applyTokenMovement } from '@/lib/betting/bank';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// PUT /api/redemptions/[id] — admin. Body: { status: 'fulfilled' | 'cancelled' }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const { status } = await request.json();
    if (status !== 'fulfilled' && status !== 'cancelled') {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    }
    const [redemption] = await db.select().from(redemptions).where(eq(redemptions.id, id));
    if (!redemption) return NextResponse.json({ error: 'Canje no encontrado' }, { status: 404 });
    if (redemption.status !== 'pending') {
      return NextResponse.json({ error: 'Este canje ya está resuelto' }, { status: 400 });
    }

    if (status === 'cancelled') {
      await applyTokenMovement(redemption.playerId, redemption.cost, 'redemption_refunded', redemption.id);
    }
    const [updated] = await db.update(redemptions)
      .set({ status, resolvedAt: now() })
      .where(eq(redemptions.id, id))
      .returning();
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Error al resolver canje' }, { status: 500 });
  }
}
```

- [ ] **Step 5: `src/app/api/penalties/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { penalties, players } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';

// GET /api/penalties — todas, con nombre del jugador (admin)
export async function GET() {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const rows = await db
      .select({
        id: penalties.id, playerId: penalties.playerId, description: penalties.description,
        status: penalties.status, rechargeAmount: penalties.rechargeAmount,
        createdAt: penalties.createdAt, fulfilledAt: penalties.fulfilledAt,
        playerName: players.name, playerNickname: players.nickname,
      })
      .from(penalties)
      .innerJoin(players, eq(players.id, penalties.playerId))
      .orderBy(desc(penalties.createdAt));
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Error al obtener penalizaciones' }, { status: 500 });
  }
}
```

- [ ] **Step 6: `src/app/api/penalties/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { penalties } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { applyTokenMovement } from '@/lib/betting/bank';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// PUT /api/penalties/[id] — admin.
// Body: { description } para asignar la penalización, o { status: 'fulfilled' }
// para marcarla cumplida (dispara la recarga).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json();

    const [penalty] = await db.select().from(penalties).where(eq(penalties.id, id));
    if (!penalty) return NextResponse.json({ error: 'Penalización no encontrada' }, { status: 404 });
    if (penalty.status === 'fulfilled') {
      return NextResponse.json({ error: 'Ya está cumplida' }, { status: 400 });
    }

    if (typeof body.description === 'string') {
      const [updated] = await db.update(penalties)
        .set({ description: body.description.trim() || null })
        .where(eq(penalties.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    if (body.status === 'fulfilled') {
      await applyTokenMovement(penalty.playerId, penalty.rechargeAmount, 'recharge', penalty.id);
      const [updated] = await db.update(penalties)
        .set({ status: 'fulfilled', fulfilledAt: now() })
        .where(eq(penalties.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Error al actualizar penalización' }, { status: 500 });
  }
}
```

- [ ] **Step 7: Compilar y commit**

Run: `npx tsc --noEmit` — sin errores.

```bash
git add src/app/api/rewards src/app/api/redemptions src/app/api/penalties
git commit -m "feat(betting): APIs de premios, canjes y penalizaciones"
```

---

### Task 13: UI — card de apuestas en el detalle de partido

**Files:**
- Create: `src/components/betting/betting-card.tsx`
- Create: `src/components/betting/bets-summary.tsx`
- Modify: `src/app/(public)/matches/[id]/page.tsx`

**Antes de tocar nada**: lee entero `src/app/(public)/matches/[id]/page.tsx` (442 líneas) y un par de componentes (`src/components/shared/match-card.tsx`, `src/components/lpt/ui.tsx`) para replicar el estilo «Pista Central» (clases `lpt-card`, `section`, `muted`, `SectionHead`, `LptAvatar`, helper `displayName`).

- [ ] **Step 1: Crear `src/components/betting/betting-card.tsx` (client)**

```tsx
'use client';

// Card de apuestas para partidos programados con apuestas abiertas.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LptAvatar, type LptPlayer } from '@/components/lpt/ui';
import type { MatchOdds } from '@/lib/betting/odds';

export interface PublicBet {
  id: string;
  playerId: string;
  playerName: string;
  playerNickname: string | null;
  playerAvatarUrl: string | null;
  market: 'winner' | 'exact_score';
  predictedTeam: number;
  predictedScore: string | null;
  amount: number;
  odds: number;
}

interface BettingCardProps {
  matchId: string;
  team1: LptPlayer[];
  team2: LptPlayer[];
  team1Label: string;
  team2Label: string;
  odds: MatchOdds;
  closesAtIso: string;
  balance: number | null;       // null = sin jugador vinculado (solo lectura)
  bankrupt: boolean;
  canBet: boolean;              // false si el usuario juega este partido
  myBets: { market: string; predictedTeam: number; predictedScore: string | null; amount: number; odds: number }[];
  allBets: PublicBet[];
  minBet: number;
  maxBet: number;
}

export function BettingCard(props: BettingCardProps) {
  const router = useRouter();
  const [market, setMarket] = useState<'winner' | 'exact_score'>('winner');
  const [team, setTeam] = useState<1 | 2>(1);
  const [score, setScore] = useState<'2-0' | '2-1'>('2-0');
  const [amount, setAmount] = useState(props.minBet);
  const [loading, setLoading] = useState(false);

  const myWinner = props.myBets.find((b) => b.market === 'winner');
  const myExact = props.myBets.find((b) => b.market === 'exact_score');
  const teamOdds = team === 1 ? props.odds.team1 : props.odds.team2;
  const currentOdds = market === 'winner' ? teamOdds.winner : teamOdds.exactScore;
  const closesAt = new Date(props.closesAtIso);

  async function placeBet() {
    setLoading(true);
    try {
      const res = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: props.matchId,
          market,
          predictedTeam: team,
          predictedScore: market === 'exact_score' ? score : undefined,
          amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al apostar');
      toast.success(`Apuesta hecha: ${amount} tokens a cuota x${data.bet.odds}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al apostar');
    } finally {
      setLoading(false);
    }
  }

  async function cancelBet(m: 'winner' | 'exact_score') {
    setLoading(true);
    try {
      const res = await fetch(`/api/bets?matchId=${props.matchId}&market=${m}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cancelar');
      toast.success('Apuesta cancelada y tokens devueltos');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cancelar');
    } finally {
      setLoading(false);
    }
  }

  const myBetLine = (label: string, b: NonNullable<typeof myWinner>, m: 'winner' | 'exact_score') => (
    <div className="flex items-center justify-between text-sm py-1">
      <span>
        {label}: <strong>Equipo {b.predictedTeam}</strong>
        {b.predictedScore ? ` (${b.predictedScore})` : ''} · {b.amount} tokens · x{b.odds}
      </span>
      <Button variant="ghost" size="sm" disabled={loading} onClick={() => cancelBet(m)}>
        Cancelar
      </Button>
    </div>
  );

  return (
    <section className="section">
      <div className="lpt-card" style={{ padding: 16 }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="sec-title" style={{ fontSize: 18 }}>🎰 La Timba</h3>
          <span className="muted text-xs">
            Cierra: {closesAt.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Cuotas por equipo */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[1, 2].map((t) => {
            const o = t === 1 ? props.odds.team1 : props.odds.team2;
            const label = t === 1 ? props.team1Label : props.team2Label;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTeam(t as 1 | 2)}
                className="lpt-card"
                style={{
                  padding: 10, textAlign: 'center', cursor: 'pointer',
                  outline: team === t ? '2px solid var(--acc)' : 'none',
                }}
              >
                <div className="text-sm font-semibold">{label}</div>
                <div className="muted text-xs mt-1">
                  Ganador <strong>x{o.winner}</strong> · Exacto <strong>x{o.exactScore}</strong>
                </div>
              </button>
            );
          })}
        </div>

        {props.balance === null ? (
          <p className="muted text-sm">Inicia sesión con tu cuenta de jugador para apostar.</p>
        ) : !props.canBet ? (
          <p className="muted text-sm">Juegas este partido: no puedes apostar en él. 😏</p>
        ) : props.bankrupt ? (
          <p className="text-sm">💀 Estás en bancarrota. Cumple tu penalización para volver a apostar.</p>
        ) : (
          <>
            <div className="flex gap-2 mb-2">
              <Button size="sm" variant={market === 'winner' ? 'default' : 'outline'} onClick={() => setMarket('winner')}>
                Ganador
              </Button>
              <Button size="sm" variant={market === 'exact_score' ? 'default' : 'outline'} onClick={() => setMarket('exact_score')}>
                Marcador exacto
              </Button>
              {market === 'exact_score' && (
                <>
                  <Button size="sm" variant={score === '2-0' ? 'default' : 'outline'} onClick={() => setScore('2-0')}>2-0</Button>
                  <Button size="sm" variant={score === '2-1' ? 'default' : 'outline'} onClick={() => setScore('2-1')}>2-1</Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={props.minBet}
                max={props.maxBet}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                style={{ width: 90 }}
              />
              <span className="muted text-xs">tokens (mín {props.minBet}, máx {props.maxBet}) · cuota x{currentOdds}</span>
              <Button size="sm" disabled={loading || amount < props.minBet || amount > props.maxBet || amount > props.balance} onClick={placeBet}>
                {(market === 'winner' ? myWinner : myExact) ? 'Sustituir' : 'Apostar'}
              </Button>
            </div>
            <p className="muted text-xs mt-1">
              Saldo: {props.balance} tokens · si aciertas cobras {Math.round(amount * currentOdds)}
            </p>
            {myWinner && myBetLine('Ganador', myWinner, 'winner')}
            {myExact && myBetLine('Exacto', myExact, 'exact_score')}
          </>
        )}

        {/* Apuestas públicas */}
        {props.allBets.length > 0 && (
          <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="muted text-xs mb-2">Apuestas de la peña</div>
            {props.allBets.map((b) => (
              <div key={b.id} className="flex items-center gap-2 text-sm py-1">
                <LptAvatar player={{ name: b.playerName, nickname: b.playerNickname, avatarUrl: b.playerAvatarUrl }} size={22} />
                <span>{b.playerNickname || b.playerName}</span>
                <span className="muted">
                  → Equipo {b.predictedTeam}
                  {b.market === 'exact_score' ? ` (${b.predictedScore})` : ''} · {b.amount} tk · x{b.odds}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
```

(Ajusta props de `LptAvatar`/clases al uso real que veas en `ui.tsx` — `LptPlayer` puede requerir más campos.)

- [ ] **Step 2: Crear `src/components/betting/bets-summary.tsx` (server)**

```tsx
// Resumen de liquidación para partidos ya jugados (server component).
import { db } from '@/lib/db';
import { bets, players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { LptAvatar } from '@/components/lpt/ui';

export async function BetsSummary({ matchId }: { matchId: string }) {
  const rows = await db
    .select({
      id: bets.id, market: bets.market, predictedTeam: bets.predictedTeam,
      predictedScore: bets.predictedScore, amount: bets.amount, odds: bets.odds,
      status: bets.status, payout: bets.payout,
      playerName: players.name, playerNickname: players.nickname, playerAvatarUrl: players.avatarUrl,
    })
    .from(bets)
    .innerJoin(players, eq(players.id, bets.playerId))
    .where(eq(bets.matchId, matchId));

  if (rows.length === 0) return null;

  return (
    <section className="section">
      <div className="lpt-card" style={{ padding: 16 }}>
        <h3 className="sec-title" style={{ fontSize: 18, marginBottom: 10 }}>🎰 La Timba — resultado</h3>
        {rows.map((b) => {
          const delta = b.status === 'won' ? `+${b.payout}` : b.status === 'lost' ? `-${b.amount}` : '±0';
          const icon = b.status === 'won' ? '🎉' : b.status === 'lost' ? '💸' : '↩️';
          return (
            <div key={b.id} className="flex items-center gap-2 text-sm py-1">
              <LptAvatar player={{ name: b.playerName, nickname: b.playerNickname, avatarUrl: b.playerAvatarUrl }} size={22} />
              <span>{b.playerNickname || b.playerName}</span>
              <span className="muted">
                Equipo {b.predictedTeam}{b.market === 'exact_score' ? ` (${b.predictedScore})` : ''} · x{b.odds}
              </span>
              <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{icon} {delta} tk</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Integrar en `src/app/(public)/matches/[id]/page.tsx`**

El page es un server component que ya carga `match` y los 4 jugadores. Añade al final del JSX (tras la última sección existente):

- Si `match.status === 'scheduled'` y `isBettingOpen(match)`: carga datos y renderiza `<BettingCard …/>`.
- Si `match.status` es `completed`/`injury_aborted` (o cerró la apuesta): `<BetsSummary matchId={match.id} />`.

Datos a cargar en el page (imports: `getSession`, `currentMatchOdds`, `bettingClosesAt`, `isBettingOpen`, `hasPendingPenalty`, `BETTING`, tabla `bets`, y `BettingCard`, `BetsSummary` y el tipo `PublicBet` desde `@/components/betting/…`):

```tsx
  // «La Timba»
  const session = await getSession();
  const bettingOpen = isBettingOpen(match);
  let timba: React.ReactNode = null;
  if (bettingOpen) {
    const odds = await currentMatchOdds(match);
    const allBets = await db
      .select({
        id: bets.id, playerId: bets.playerId, market: bets.market,
        predictedTeam: bets.predictedTeam, predictedScore: bets.predictedScore,
        amount: bets.amount, odds: bets.odds,
        playerName: players.name, playerNickname: players.nickname,
        playerAvatarUrl: players.avatarUrl,
      })
      .from(bets)
      .innerJoin(players, eq(players.id, bets.playerId))
      .where(eq(bets.matchId, match.id));

    const me = session?.player ?? null;
    const matchPlayerIds = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id];
    const myBets = me ? allBets.filter((b) => b.playerId === me.id) : [];
    timba = (
      <BettingCard
        matchId={match.id}
        team1={[t1p1, t1p2]}
        team2={[t2p1, t2p2]}
        team1Label={`${displayName(t1p1)}/${displayName(t1p2)}`}
        team2Label={`${displayName(t2p1)}/${displayName(t2p2)}`}
        odds={odds}
        closesAtIso={bettingClosesAt(match.date, match.time).toISOString()}
        balance={me ? me.tokenBalance : null}
        bankrupt={me ? await hasPendingPenalty(me.id) : false}
        canBet={!!me && !matchPlayerIds.includes(me.id)}
        myBets={myBets}
        allBets={allBets as PublicBet[]}
        minBet={BETTING.minBet}
        maxBet={BETTING.maxBet}
      />
    );
  } else {
    timba = <BetsSummary matchId={match.id} />;
  }
```

…y renderiza `{timba}` en el JSX. Adapta los nombres de variables de jugadores (`t1p1`…) a los reales del page; usa `force-dynamic` si el page no lo tiene ya.

- [ ] **Step 4: Probar a mano (si hay dev server) y compilar**

Run: `npx tsc --noEmit` — sin errores.
Con dev server: crear partido programado con hora futura, apostar desde otra cuenta, comprobar que aparece en "Apuestas de la peña" y que el saldo baja.

- [ ] **Step 5: Commit**

```bash
git add src/components/betting "src/app/(public)/matches/[id]/page.tsx"
git commit -m "feat(betting): card de apuestas y resumen de liquidación en el detalle de partido"
```

---

### Task 14: UI — mi cartera (`/me/tokens`)

**Files:**
- Create: `src/app/me/tokens/page.tsx`
- Create: `src/components/betting/redeem-button.tsx`
- Modify: `src/app/me/page.tsx`

- [ ] **Step 1: Crear `src/components/betting/redeem-button.tsx` (client)**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function RedeemButton({ rewardId, cost, disabled }: { rewardId: string; cost: number; disabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function redeem() {
    if (!confirm(`¿Canjear este premio por ${cost} tokens?`)) return;
    setLoading(true);
    try {
      const res = await fetch('/api/redemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al canjear');
      toast.success('Canje solicitado: pendiente de que el admin lo valide');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al canjear');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" disabled={disabled || loading} onClick={redeem}>
      Canjear · {cost} tk
    </Button>
  );
}
```

- [ ] **Step 2: Crear `src/app/me/tokens/page.tsx` (server)**

```tsx
import { redirect } from 'next/navigation';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bets, tokenLedger, rewards, redemptions, penalties } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';
import { RedeemButton } from '@/components/betting/redeem-button';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<string, string> = {
  initial: 'Bote inicial',
  bet_placed: 'Apuesta',
  bet_cancelled: 'Apuesta cancelada',
  bet_won: 'Apuesta ganada',
  bet_refunded: 'Apuesta devuelta',
  recharge: 'Recarga (penalización cumplida)',
  redemption: 'Canje de premio',
  redemption_refunded: 'Canje cancelado',
  settlement_reversal: 'Corrección de resultado',
  adjustment: 'Ajuste',
};

export default async function TokensPage() {
  const session = await getSession();
  if (!session) redirect('/login?from=/me/tokens');
  const player = session.player;
  if (!player) redirect('/me');

  const [openBets, ledger, catalog, myRedemptions, myPenalties] = await Promise.all([
    db.select().from(bets)
      .where(and(eq(bets.playerId, player.id), eq(bets.status, 'open')))
      .orderBy(desc(bets.createdAt)),
    db.select().from(tokenLedger)
      .where(eq(tokenLedger.playerId, player.id))
      .orderBy(desc(tokenLedger.createdAt))
      .limit(50),
    db.select().from(rewards).where(eq(rewards.active, true)).orderBy(rewards.cost),
    db.select({
      id: redemptions.id, cost: redemptions.cost, status: redemptions.status,
      requestedAt: redemptions.requestedAt, rewardTitle: rewards.title,
    }).from(redemptions)
      .innerJoin(rewards, eq(rewards.id, redemptions.rewardId))
      .where(eq(redemptions.playerId, player.id))
      .orderBy(desc(redemptions.requestedAt)),
    db.select().from(penalties)
      .where(and(eq(penalties.playerId, player.id), eq(penalties.status, 'pending'))),
  ]);

  const pendingPenalty = myPenalties[0] ?? null;

  return (
    <div className="space-y-6">
      <section className="section">
        <h1 className="sec-title">🪙 Mi cartera</h1>
        <div className="lpt-card mt-3" style={{ padding: 16, textAlign: 'center' }}>
          <div className="display" style={{ fontSize: 40 }}>{player.tokenBalance}</div>
          <div className="muted text-sm">tokens</div>
        </div>
        {pendingPenalty && (
          <div className="lpt-card mt-3" style={{ padding: 14 }}>
            💀 <strong>Estás en bancarrota.</strong>{' '}
            {pendingPenalty.description
              ? <>Tu penalización: «{pendingPenalty.description}». Cúmplela y el admin te recargará {pendingPenalty.rechargeAmount} tokens.</>
              : <>El admin te asignará una penalización; al cumplirla recibirás {pendingPenalty.rechargeAmount} tokens.</>}
          </div>
        )}
      </section>

      {openBets.length > 0 && (
        <section className="section">
          <h2 className="sec-title" style={{ fontSize: 18 }}>Apuestas abiertas</h2>
          <div className="lpt-card mt-2" style={{ padding: 12 }}>
            {openBets.map((b) => (
              <Link key={b.id} href={`/matches/${b.matchId}`} className="flex justify-between text-sm py-1">
                <span>Equipo {b.predictedTeam}{b.predictedScore ? ` (${b.predictedScore})` : ''} · x{b.odds}</span>
                <span>{b.amount} tk → {Math.round(b.amount * b.odds)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="sec-title" style={{ fontSize: 18 }}>🎁 Premios</h2>
        <div className="lpt-card mt-2" style={{ padding: 12 }}>
          {catalog.length === 0 && <p className="muted text-sm">El admin aún no ha creado premios.</p>}
          {catalog.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2 gap-3">
              <div>
                <div className="text-sm font-semibold">{r.title}</div>
                {r.description && <div className="muted text-xs">{r.description}</div>}
              </div>
              <RedeemButton rewardId={r.id} cost={r.cost} disabled={!!pendingPenalty || player.tokenBalance < r.cost} />
            </div>
          ))}
        </div>
        {myRedemptions.length > 0 && (
          <div className="lpt-card mt-2" style={{ padding: 12 }}>
            <div className="muted text-xs mb-1">Mis canjes</div>
            {myRedemptions.map((r) => (
              <div key={r.id} className="flex justify-between text-sm py-1">
                <span>{r.rewardTitle}</span>
                <span className="muted">
                  {r.status === 'pending' ? '⏳ pendiente' : r.status === 'fulfilled' ? '✅ entregado' : '❌ cancelado'} · {r.cost} tk
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="sec-title" style={{ fontSize: 18 }}>Movimientos</h2>
        <div className="lpt-card mt-2" style={{ padding: 12 }}>
          {ledger.map((l) => (
            <div key={l.id} className="flex justify-between text-sm py-1">
              <span className="muted">{REASON_LABEL[l.reason] ?? l.reason}</span>
              <span style={{ fontWeight: 600, color: l.amount >= 0 ? 'var(--win, inherit)' : 'var(--loss, inherit)' }}>
                {l.amount >= 0 ? '+' : ''}{l.amount} → {l.balanceAfter}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

(Nota: el import de `matches` solo si acabas enlazando nombres de partido; si no lo usas, elimínalo.)

- [ ] **Step 3: Enlace desde `/me`**

En `src/app/me/page.tsx`, dentro del return final (caso con jugador), añade entre `<PlayerProfileView …/>` y `<PushNotificationsToggle />`:

```tsx
      <Link href="/me/tokens" className="lpt-card flex items-center justify-between" style={{ padding: 14 }}>
        <span>🪙 Mi cartera de La Timba</span>
        <span className="font-semibold">{session.player.tokenBalance} tk →</span>
      </Link>
```

(`Link` ya está importado en ese archivo.)

- [ ] **Step 4: Compilar y commit**

Run: `npx tsc --noEmit` — sin errores.

```bash
git add src/app/me src/components/betting/redeem-button.tsx
git commit -m "feat(betting): página de cartera con saldo, apuestas, canjes y movimientos"
```

---

### Task 15: UI — clasificación de tokens

**Files:**
- Create: `src/app/(public)/rankings/tokens/page.tsx`
- Modify: `src/app/(public)/rankings/page.tsx` (enlace)

- [ ] **Step 1: Crear `src/app/(public)/rankings/tokens/page.tsx`**

Sigue el patrón de `src/app/(public)/rankings/pairs/page.tsx` (léelo primero):

```tsx
import { db } from '@/lib/db';
import { players, penalties } from '@/lib/db/schema';
import { desc, eq, and } from 'drizzle-orm';
import { Coins } from 'lucide-react';
import { SectionHead, LptAvatar, displayName } from '@/components/lpt/ui';

export const dynamic = 'force-dynamic';

export default async function TokensRankingPage() {
  const [ranked, pendingPenalties] = await Promise.all([
    db.select().from(players).orderBy(desc(players.tokenBalance), players.name),
    db.select().from(penalties).where(eq(penalties.status, 'pending')),
  ]);
  const bankruptIds = new Set(pendingPenalties.map((p) => p.playerId));

  return (
    <section className="section">
      <SectionHead icon={Coins} title="La Timba — clasificación" />
      <div className="lpt-card" style={{ overflow: 'hidden' }}>
        {ranked.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: i ? '1px solid var(--line)' : 'none' }}>
            <span className="muted" style={{ width: 22, textAlign: 'right' }}>{i + 1}</span>
            <LptAvatar player={p} size={30} />
            <span className="text-sm font-semibold">
              {displayName(p)} {bankruptIds.has(p.id) && '💀'}
            </span>
            <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{p.tokenBalance} tk</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Enlace en la página de rankings**

Lee `src/app/(public)/rankings/page.tsx` y localiza cómo se enlaza a `/rankings/pairs` (probablemente un `sec-link` o tab). Añade un enlace equivalente a `/rankings/tokens` con texto `🪙 La Timba`.

- [ ] **Step 3: Compilar y commit**

Run: `npx tsc --noEmit` — sin errores.

```bash
git add "src/app/(public)/rankings"
git commit -m "feat(betting): clasificación pública de tokens con marca de bancarrota"
```

---

### Task 16: UI — admin (premios, canjes, penalizaciones)

**Files:**
- Create: `src/app/admin/rewards/page.tsx` + `src/components/admin/rewards-manager.tsx`
- Create: `src/app/admin/redemptions/page.tsx` + `src/components/admin/redemptions-manager.tsx`
- Create: `src/app/admin/penalties/page.tsx` + `src/components/admin/penalties-manager.tsx`
- Modify: `src/components/admin/admin-sidebar.tsx`

Los tres managers son client components con el mismo esqueleto: cargan datos por props (server page), mutan con `fetch` + `router.refresh()` + `toast`, estilo de `broadcast-form.tsx`/`player-form.tsx` (léelos primero). Las pages de admin siguen el patrón de `src/app/admin/players/page.tsx`: server component con `dynamic = 'force-dynamic'` que consulta la DB y pasa props. La protección admin del layout `/admin` ya existe — replica lo que hagan las pages actuales.

- [ ] **Step 1: `src/components/admin/rewards-manager.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Reward } from '@/lib/db/schema';

export function RewardsManager({ rewards }: { rewards: Reward[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState(100);
  const [loading, setLoading] = useState(false);

  async function call(path: string, init: RequestInit, ok: string) {
    setLoading(true);
    try {
      const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="lpt-card" style={{ padding: 14 }}>
        <h2 className="text-sm font-semibold mb-2">Nuevo premio</h2>
        <div className="space-y-2">
          <div>
            <Label htmlFor="title">Título *</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Los demás te pagan la pista" />
          </div>
          <div>
            <Label htmlFor="description">Descripción</Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cost">Coste en tokens *</Label>
            <Input id="cost" type="number" min={1} value={cost} onChange={(e) => setCost(Number(e.target.value))} />
          </div>
          <Button
            disabled={loading || !title.trim() || cost <= 0}
            onClick={() => call('/api/rewards', { method: 'POST', body: JSON.stringify({ title, description, cost }) }, 'Premio creado')}
          >
            Crear premio
          </Button>
        </div>
      </div>

      <div className="lpt-card" style={{ padding: 14 }}>
        <h2 className="text-sm font-semibold mb-2">Catálogo</h2>
        {rewards.length === 0 && <p className="muted text-sm">Sin premios todavía.</p>}
        {rewards.map((r) => (
          <div key={r.id} className="flex items-center justify-between py-2 gap-2">
            <div>
              <span className="text-sm font-semibold">{r.title}</span>{' '}
              <span className="muted text-xs">{r.cost} tk {r.active ? '' : '· (inactivo)'}</span>
            </div>
            <Button
              size="sm" variant="outline" disabled={loading}
              onClick={() => call(`/api/rewards/${r.id}`, { method: 'PUT', body: JSON.stringify({ active: !r.active }) }, r.active ? 'Premio desactivado' : 'Premio activado')}
            >
              {r.active ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Y la page `src/app/admin/rewards/page.tsx`:

```tsx
import { db } from '@/lib/db';
import { rewards } from '@/lib/db/schema';
import { RewardsManager } from '@/components/admin/rewards-manager';

export const dynamic = 'force-dynamic';

export default async function AdminRewardsPage() {
  const all = await db.select().from(rewards).orderBy(rewards.cost);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">🎁 Premios de La Timba</h1>
        <p className="muted text-sm mt-1.5">Catálogo de premios canjeables por tokens</p>
      </div>
      <RewardsManager rewards={all} />
    </div>
  );
}
```

- [ ] **Step 2: `src/components/admin/redemptions-manager.tsx` + page**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export interface RedemptionRow {
  id: string;
  status: string;
  cost: number;
  requestedAt: string;
  rewardTitle: string;
  playerName: string;
  playerNickname: string | null;
}

export function RedemptionsManager({ redemptions }: { redemptions: RedemptionRow[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function resolve(id: string, status: 'fulfilled' | 'cancelled') {
    setLoading(true);
    try {
      const res = await fetch(`/api/redemptions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success(status === 'fulfilled' ? 'Canje marcado como entregado' : 'Canje cancelado y tokens devueltos');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  const pending = redemptions.filter((r) => r.status === 'pending');
  const resolved = redemptions.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-4">
      <div className="lpt-card" style={{ padding: 14 }}>
        <h2 className="text-sm font-semibold mb-2">Pendientes ({pending.length})</h2>
        {pending.length === 0 && <p className="muted text-sm">Nada pendiente. 🎉</p>}
        {pending.map((r) => (
          <div key={r.id} className="flex items-center justify-between py-2 gap-2">
            <div className="text-sm">
              <strong>{r.playerNickname || r.playerName}</strong> → {r.rewardTitle}{' '}
              <span className="muted text-xs">({r.cost} tk)</span>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" disabled={loading} onClick={() => resolve(r.id, 'fulfilled')}>Entregado</Button>
              <Button size="sm" variant="outline" disabled={loading} onClick={() => resolve(r.id, 'cancelled')}>Cancelar</Button>
            </div>
          </div>
        ))}
      </div>
      {resolved.length > 0 && (
        <div className="lpt-card" style={{ padding: 14 }}>
          <h2 className="text-sm font-semibold mb-2">Histórico</h2>
          {resolved.map((r) => (
            <div key={r.id} className="text-sm py-1 muted">
              {r.playerNickname || r.playerName} → {r.rewardTitle} · {r.status === 'fulfilled' ? '✅' : '❌'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Page `src/app/admin/redemptions/page.tsx`:

```tsx
import { db } from '@/lib/db';
import { redemptions, rewards, players } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { RedemptionsManager } from '@/components/admin/redemptions-manager';

export const dynamic = 'force-dynamic';

export default async function AdminRedemptionsPage() {
  const rows = await db
    .select({
      id: redemptions.id, status: redemptions.status, cost: redemptions.cost,
      requestedAt: redemptions.requestedAt, rewardTitle: rewards.title,
      playerName: players.name, playerNickname: players.nickname,
    })
    .from(redemptions)
    .innerJoin(rewards, eq(rewards.id, redemptions.rewardId))
    .innerJoin(players, eq(players.id, redemptions.playerId))
    .orderBy(desc(redemptions.requestedAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">🎟️ Canjes</h1>
        <p className="muted text-sm mt-1.5">Valida o cancela los canjes de premios</p>
      </div>
      <RedemptionsManager redemptions={rows} />
    </div>
  );
}
```

- [ ] **Step 3: `src/components/admin/penalties-manager.tsx` + page**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface PenaltyRow {
  id: string;
  description: string | null;
  status: string;
  rechargeAmount: number;
  createdAt: string;
  playerName: string;
  playerNickname: string | null;
}

export function PenaltiesManager({ penalties }: { penalties: PenaltyRow[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function update(id: string, body: object, ok: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/penalties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  const pending = penalties.filter((p) => p.status === 'pending');
  const fulfilled = penalties.filter((p) => p.status === 'fulfilled');

  return (
    <div className="space-y-4">
      <div className="lpt-card" style={{ padding: 14 }}>
        <h2 className="text-sm font-semibold mb-2">💀 Bancarrotas pendientes ({pending.length})</h2>
        {pending.length === 0 && <p className="muted text-sm">Nadie en bancarrota.</p>}
        {pending.map((p) => (
          <div key={p.id} className="py-2 space-y-1.5">
            <div className="text-sm">
              <strong>{p.playerNickname || p.playerName}</strong>
              {p.description && <span className="muted"> — «{p.description}»</span>}
            </div>
            <div className="flex gap-1.5">
              <Input
                placeholder="Penalización (ej: trae las bolas el viernes)"
                value={drafts[p.id] ?? p.description ?? ''}
                onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })}
              />
              <Button
                size="sm" variant="outline" disabled={loading || !(drafts[p.id] ?? '').trim()}
                onClick={() => update(p.id, { description: drafts[p.id] }, 'Penalización asignada')}
              >
                Asignar
              </Button>
              <Button
                size="sm" disabled={loading || !p.description}
                onClick={() => update(p.id, { status: 'fulfilled' }, `Cumplida: +${p.rechargeAmount} tokens`)}
              >
                Cumplida
              </Button>
            </div>
          </div>
        ))}
      </div>
      {fulfilled.length > 0 && (
        <div className="lpt-card" style={{ padding: 14 }}>
          <h2 className="text-sm font-semibold mb-2">Histórico</h2>
          {fulfilled.map((p) => (
            <div key={p.id} className="text-sm py-1 muted">
              {p.playerNickname || p.playerName} — «{p.description}» ✅ +{p.rechargeAmount} tk
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Page `src/app/admin/penalties/page.tsx`:

```tsx
import { db } from '@/lib/db';
import { penalties, players } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { PenaltiesManager } from '@/components/admin/penalties-manager';

export const dynamic = 'force-dynamic';

export default async function AdminPenaltiesPage() {
  const rows = await db
    .select({
      id: penalties.id, description: penalties.description, status: penalties.status,
      rechargeAmount: penalties.rechargeAmount, createdAt: penalties.createdAt,
      playerName: players.name, playerNickname: players.nickname,
    })
    .from(penalties)
    .innerJoin(players, eq(players.id, penalties.playerId))
    .orderBy(desc(penalties.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">💀 Penalizaciones</h1>
        <p className="muted text-sm mt-1.5">Asigna penalizaciones a los arruinados y márcalas cumplidas para recargarles</p>
      </div>
      <PenaltiesManager penalties={rows} />
    </div>
  );
}
```

- [ ] **Step 4: Enlaces en el sidebar admin**

En `src/components/admin/admin-sidebar.tsx` (línea ~8), añade a `adminLinks` (importando los iconos de `lucide-react`):

```ts
  { href: '/admin/rewards', label: 'Premios', icon: Gift },
  { href: '/admin/redemptions', label: 'Canjes', icon: Ticket },
  { href: '/admin/penalties', label: 'Sanciones', icon: Skull },
```

- [ ] **Step 5: Compilar y commit**

Run: `npx tsc --noEmit` — sin errores.

```bash
git add src/app/admin/rewards src/app/admin/redemptions src/app/admin/penalties src/components/admin
git commit -m "feat(betting): zona admin de premios, canjes y penalizaciones"
```

---

### Task 17: Verificación final, deploy y migración en producción

- [ ] **Step 1: Suite completa y build**

Run: `npx vitest run`
Expected: PASS todos (los existentes + odds, close-time, settle-logic, notifications).

Run: `npm run build`
Expected: build sin errores (necesita las TURSO env vars; si no están en local, `npx tsc --noEmit` + lint es el mínimo).

- [ ] **Step 2: Prueba manual del flujo completo (si hay entorno local)**

1. `POST /api/migrate-betting` → `success: true`.
2. Crear partido programado con hora futura → la card de apuestas aparece con cuotas.
3. Apostar con una cuenta no participante → saldo baja, apuesta visible públicamente.
4. Registrar el resultado → apuesta liquidada, saldo actualizado, resumen visible en el partido.
5. Forzar bancarrota (apostar casi todo y perder) → penalización aparece en `/admin/penalties`; asignar texto y marcar cumplida → +250.
6. Crear premio, canjearlo, validarlo en `/admin/redemptions`.

- [ ] **Step 3: Merge a main, push y migración en producción**

```bash
git push origin HEAD:main
```

Vercel auto-despliega. Cuando el deploy esté listo:

```bash
curl -s -X POST https://<dominio-produccion>/api/migrate-betting
```

Expected: `{"success":true,"backfilled":N}` con N = nº de jugadores existentes.

- [ ] **Step 4: Verificación en producción**

Abrir un partido programado y comprobar que la card «La Timba» se renderiza con cuotas; comprobar `/me/tokens` y `/rankings/tokens`.

---

## Notas para quien ejecute

- **Reversión de resultados**: la API actual no permite editar el resultado de un partido `completed` (el PUT lo rechaza). `reverseSettlement` solo se usa al **borrar** un partido completado. Si algún día se añade edición de resultados, reutilízala: revierte y vuelve a liquidar.
- **Partido creado ya completado** (`POST /api/matches` con sets): no puede tener apuestas (no existía antes), así que no hay nada que liquidar ahí.
- **Carreras de saldo**: no hay transacciones multi-statement en el codebase; la guarda es el UPDATE condicional de `bank.ts`. Si el asiento del ledger fallara tras el UPDATE quedaría un movimiento sin asiento — riesgo aceptado en v1 (mismo nivel de rigor que el resto del repo).
- **Estilo**: antes de escribir cualquier componente, lee 1-2 componentes vecinos. Las clases (`lpt-card`, `section`, `sec-title`, `muted`, `display`) y las variables CSS (`--acc`, `--line`) vienen del design system «Pista Central»; no inventes estilos nuevos.
