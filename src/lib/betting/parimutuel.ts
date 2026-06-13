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
  const leftover = pool - assigned;
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
