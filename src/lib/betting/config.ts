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
