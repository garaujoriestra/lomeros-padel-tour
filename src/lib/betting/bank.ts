// src/lib/betting/bank.ts
// Movimientos de tokens: actualiza el saldo cacheado y deja asiento en el ledger.
import { db } from '@/lib/db';
import { players, tokenLedger } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

export type LedgerReason =
  | 'buyin' | 'rebuy' | 'bet_placed' | 'bet_cancelled' | 'bet_won' | 'bet_refunded'
  | 'redemption' | 'redemption_refunded' | 'settlement_reversal' | 'adjustment';

// Tipo de la transacción que entrega db.transaction(cb). Permite encadenar un
// movimiento de tokens dentro de una transacción mayor (p. ej. cobrar y crear
// la apuesta de forma atómica): si cualquier paso posterior falla, el rollback
// deshace también el cobro y no se pierden fichas.
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Aplica un movimiento dentro de una transacción YA abierta. El UPDATE
// condicional evita que dos peticiones concurrentes dejen el saldo en negativo
// (la condición en el WHERE hace de guarda atómica). Lanza 'SALDO_INSUFICIENTE'
// si la guarda impide aplicar el cargo. `allowNegative` solo lo usa la
// reversión de liquidaciones.
export async function applyTokenMovementTx(
  tx: DbTx,
  playerId: string,
  amount: number,
  reason: LedgerReason,
  refId?: string | null,
  opts?: { allowNegative?: boolean },
): Promise<number> {
  const guard = amount < 0 && !opts?.allowNegative
    ? and(eq(players.id, playerId), sql`${players.tokenBalance} + ${amount} >= 0`)
    : eq(players.id, playerId);

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
}

// Aplica un movimiento suelto (su propia transacción). El UPDATE y el INSERT en
// tokenLedger van juntos para que nunca quede un movimiento sin asiento
// contable: si el proceso muere entre ambas sentencias, el rollback deshace el
// cambio de saldo. `allowNegative` solo lo usa la reversión de liquidaciones.
export async function applyTokenMovement(
  playerId: string,
  amount: number,
  reason: LedgerReason,
  refId?: string | null,
  opts?: { allowNegative?: boolean },
): Promise<number> {
  return db.transaction((tx) => applyTokenMovementTx(tx, playerId, amount, reason, refId, opts));
}

// ¿Existe ya un asiento (reason, refId)? Guarda de idempotencia para poder
// reanudar liquidaciones interrumpidas sin duplicar movimientos.
export async function hasLedgerEntry(reason: LedgerReason, refId: string): Promise<boolean> {
  const rows = await db
    .select({ id: tokenLedger.id })
    .from(tokenLedger)
    .where(and(eq(tokenLedger.reason, reason), eq(tokenLedger.refId, refId)))
    .limit(1);
  return rows.length > 0;
}
