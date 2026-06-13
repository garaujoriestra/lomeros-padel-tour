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
    results.push({ playerId: bet.playerId, status: 'refunded', amount: bet.amount, payout: bet.amount });
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
        const paid = bet.status === 'won' ? bet.payout : bet.amount;
        await applyTokenMovement(bet.playerId, -paid, 'settlement_reversal', bet.id, { allowNegative: true });
      }
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
