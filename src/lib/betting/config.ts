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
