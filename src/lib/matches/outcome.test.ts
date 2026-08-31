import { describe, it, expect } from 'vitest';
import { resolveSetsOutcome, isPlayed } from './outcome';

const set = (team1Games: number, team2Games: number) => ({ team1Games, team2Games });

describe('resolveSetsOutcome', () => {
  it('2-0 del equipo 1', () => {
    const out = resolveSetsOutcome([set(6, 3), set(6, 4)]);
    expect(out).toMatchObject({ ok: true, status: 'completed', winnerTeam: 1 });
  });

  it('2-0 del equipo 2', () => {
    const out = resolveSetsOutcome([set(3, 6), set(4, 6)]);
    expect(out).toMatchObject({ ok: true, status: 'completed', winnerTeam: 2 });
  });

  it('2-1 del equipo 1', () => {
    const out = resolveSetsOutcome([set(6, 3), set(4, 6), set(7, 5)]);
    expect(out).toMatchObject({ ok: true, status: 'completed', winnerTeam: 1 });
  });

  it('2-1 del equipo 2', () => {
    const out = resolveSetsOutcome([set(6, 3), set(4, 6), set(5, 7)]);
    expect(out).toMatchObject({ ok: true, status: 'completed', winnerTeam: 2 });
  });

  // El caso que motivó todo: no dio tiempo al tercer set.
  it('1-1 con 2 sets es empate, sin ganador', () => {
    const out = resolveSetsOutcome([set(6, 4), set(3, 6)]);
    expect(out).toEqual({
      ok: true,
      status: 'draw',
      winnerTeam: null,
      sets: [
        { setNumber: 1, team1Games: 6, team2Games: 4 },
        { setNumber: 2, team1Games: 3, team2Games: 6 },
      ],
    });
  });

  it('1-1 no adjudica la victoria al equipo 2 (regresión del conteo antiguo)', () => {
    const out = resolveSetsOutcome([set(6, 4), set(3, 6)]);
    expect(out.ok && out.winnerTeam).toBeNull();
  });

  it('el empate es simétrico: da igual quién ganó el primer set', () => {
    expect(resolveSetsOutcome([set(3, 6), set(6, 4)])).toMatchObject({ status: 'draw' });
  });

  it('numera los sets en orden', () => {
    const out = resolveSetsOutcome([set(6, 3), set(4, 6), set(7, 5)]);
    expect(out.ok && out.sets.map((s) => s.setNumber)).toEqual([1, 2, 3]);
  });

  it('rechaza un set empatado a juegos', () => {
    expect(resolveSetsOutcome([set(6, 6), set(6, 4)])).toEqual({
      ok: false,
      error: 'Un set no puede terminar empatado',
    });
  });

  it('rechaza menos de 2 sets', () => {
    expect(resolveSetsOutcome([set(6, 4)])).toMatchObject({ ok: false });
  });

  it('rechaza más de 3 sets', () => {
    expect(resolveSetsOutcome([set(6, 4), set(4, 6), set(6, 4), set(4, 6)])).toMatchObject({ ok: false });
  });

  it('rechaza juegos no enteros o negativos', () => {
    expect(resolveSetsOutcome([set(6, -1), set(6, 4)])).toMatchObject({ ok: false });
    expect(resolveSetsOutcome([{ team1Games: 6.5, team2Games: 4 }, set(6, 4)])).toMatchObject({ ok: false });
    expect(resolveSetsOutcome([{ team1Games: 'seis', team2Games: 4 }, set(6, 4)])).toMatchObject({ ok: false });
  });

  it('rechaza lo que no es un array', () => {
    expect(resolveSetsOutcome(null)).toMatchObject({ ok: false });
    expect(resolveSetsOutcome(undefined)).toMatchObject({ ok: false });
    expect(resolveSetsOutcome('6-4')).toMatchObject({ ok: false });
  });

  it('rechaza un 3-0 a sets: al ganar 2 se deja de jugar', () => {
    expect(resolveSetsOutcome([set(6, 4), set(6, 3), set(6, 2)])).toMatchObject({ ok: false });
  });
});

describe('isPlayed', () => {
  it('completados y empates cuentan como jugados', () => {
    expect(isPlayed({ status: 'completed' })).toBe(true);
    expect(isPlayed({ status: 'draw' })).toBe(true);
  });

  it('programados y lesiones no', () => {
    expect(isPlayed({ status: 'scheduled' })).toBe(false);
    expect(isPlayed({ status: 'injury_aborted' })).toBe(false);
  });
});
