// src/lib/betting/settle.ts
// Orquestación de liquidación/devolución/reversión de apuestas (con DB).
// La decisión por apuesta es pura y vive en settle-logic.ts.
import { db } from '@/lib/db';
import { bets, players, penalties } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { matchSetsScore, settleBet, isBankrupt } from './settle-logic';
import { applyTokenMovement, hasLedgerEntry } from './bank';
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
    // Dinero antes de marcar: si el proceso muere a medias, la apuesta sigue
    // 'open' y la reliquidación retoma donde se quedó. El asiento (reason,
    // refId) hace de guarda para no pagar dos veces.
    if (o.status === 'won' && !(await hasLedgerEntry('bet_won', bet.id))) {
      await applyTokenMovement(bet.playerId, o.payout, 'bet_won', bet.id);
    }
    // Las perdidas no mueven dinero: marcarlas es seguro sin guarda.
    await db.update(bets)
      .set({ status: o.status, payout: o.payout, settledAt: now() })
      .where(eq(bets.id, bet.id));
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
    // Dinero antes de marcar (misma estrategia que settleMatchBets).
    if (!(await hasLedgerEntry('bet_refunded', bet.id))) {
      await applyTokenMovement(bet.playerId, bet.amount, 'bet_refunded', bet.id);
    }
    await db.update(bets)
      .set({ status: 'refunded', settledAt: now() })
      .where(eq(bets.id, bet.id));
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
    // Dinero antes de resetear, con guarda de idempotencia. Nota: la guarda
    // asume una única reversión por apuesta (hoy solo se revierte justo antes
    // de borrar el partido, así que se cumple).
    if (!(await hasLedgerEntry('settlement_reversal', bet.id))) {
      if (bet.status === 'won') {
        await applyTokenMovement(bet.playerId, -bet.payout, 'settlement_reversal', bet.id, { allowNegative: true });
      } else {
        await applyTokenMovement(bet.playerId, bet.amount, 'settlement_reversal', bet.id);
      }
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
