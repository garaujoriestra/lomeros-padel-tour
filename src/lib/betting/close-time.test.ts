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
