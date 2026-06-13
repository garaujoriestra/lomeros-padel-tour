import { describe, it, expect } from 'vitest';
import { provisionalMultiplier, eloFavorite } from './provisional-odds';

describe('provisionalMultiplier', () => {
  it('= pool total / pool de la selección, a 1 decimal', () => {
    expect(provisionalMultiplier(100, 40)).toBe(2.5);
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
