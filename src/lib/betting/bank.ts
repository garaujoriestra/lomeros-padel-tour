// src/lib/betting/bank.ts
// Movimientos de tokens: actualiza el saldo cacheado y deja asiento en el ledger.
import { db } from '@/lib/db';
import { players, tokenLedger } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

export type LedgerReason =
  | 'initial' | 'bet_placed' | 'bet_cancelled' | 'bet_won' | 'bet_refunded'
  | 'recharge' | 'redemption' | 'redemption_refunded' | 'settlement_reversal' | 'adjustment';

// Aplica un movimiento. El UPDATE condicional evita que dos peticiones
// concurrentes dejen el saldo en negativo (la condición en el WHERE hace de
// guarda atómica). El UPDATE y el INSERT en tokenLedger van en una transacción
// para que nunca quede un movimiento sin asiento contable: si el proceso muere
// entre ambas sentencias, el rollback deshace el cambio de saldo.
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

  return db.transaction(async (tx) => {
    const updated = await tx
      .update(players)
      .set({ tokenBalance: sql`${players.tokenBalance} + ${amount}` })
      .where(guard)
      .returning({ balance: players.tokenBalance });

    if (!updated[0]) throw new Error('SALDO_INSUFICIENTE');

    await tx.insert(tokenLedger).values({
      playerId,
      amount,
      reason,
      refId: refId ?? null,
      balanceAfter: updated[0].balance,
    });
    return updated[0].balance;
  });
}
