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
