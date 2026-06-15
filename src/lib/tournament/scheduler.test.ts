import { describe, it, expect } from 'vitest';
import { estimatedMatchMinutes, scheduleMatches } from './scheduler';
import type { MatchFormat } from './types';
import type { CourtWindow, ScheduleItem } from './scheduler';

describe('estimatedMatchMinutes', () => {
  it('usa los minutos exactos en formato cronometrado', () => {
    const f: MatchFormat = { kind: 'timed', minutes: 25, tieRule: 'golden_point' };
    expect(estimatedMatchMinutes(f)).toBe(25);
  });

  it('estima ~20 min para "hasta un set"', () => {
    expect(estimatedMatchMinutes({ kind: 'first_to_set' })).toBe(20);
  });

  it('estima por nº de juegos objetivo (~3.5 min/juego, mínimo 15)', () => {
    expect(estimatedMatchMinutes({ kind: 'games', target: 6 })).toBe(21);
    expect(estimatedMatchMinutes({ kind: 'games', target: 3 })).toBe(15);
  });

  it('estima ~40 min al mejor de 3', () => {
    expect(estimatedMatchMinutes({ kind: 'best_of_3' })).toBe(40);
  });
});

describe('scheduleMatches', () => {
  const courts: CourtWindow[] = [
    { courtId: 'c1', order: 1, fromMin: 17 * 60, toMin: 18 * 60 + 30 }, // 17:00-18:30
    { courtId: 'c2', order: 2, fromMin: 17 * 60, toMin: 20 * 60 },      // 17:00-20:00 (más larga)
  ];

  it('coloca cada partido en el primer hueco libre sin solapar participantes', () => {
    // 30 min por hueco. Partidos con participantes disjuntos pueden ir en paralelo.
    const items: ScheduleItem[] = [
      { matchId: 'm1', players: ['p1', 'p2', 'p3', 'p4'] },
      { matchId: 'm2', players: ['p5', 'p6', 'p7', 'p8'] },
    ];
    const res = scheduleMatches(items, courts, 30);
    expect(res.unscheduled).toEqual([]);
    // m1 → c1 17:00, m2 → c2 17:00 (en paralelo, distintos participantes)
    const m1 = res.scheduled.find((s) => s.matchId === 'm1')!;
    const m2 = res.scheduled.find((s) => s.matchId === 'm2')!;
    expect(m1.startMin).toBe(17 * 60);
    expect(m2.startMin).toBe(17 * 60);
    expect(m1.courtId).not.toBe(m2.courtId);
  });

  it('no solapa a un jugador que repite en dos partidos: el segundo va más tarde', () => {
    const items: ScheduleItem[] = [
      { matchId: 'm1', players: ['p1', 'p2', 'p3', 'p4'] },
      { matchId: 'm2', players: ['p1', 'p5', 'p6', 'p7'] }, // p1 repite
    ];
    const res = scheduleMatches(items, courts, 30);
    expect(res.unscheduled).toEqual([]);
    const m1 = res.scheduled.find((s) => s.matchId === 'm1')!;
    const m2 = res.scheduled.find((s) => s.matchId === 'm2')!;
    expect(m2.startMin).toBeGreaterThanOrEqual(m1.endMin);
  });

  it('respeta la ventana corta: lo que no cabe queda sin planificar', () => {
    // Solo una pista corta de 17:00-17:45 → 1 hueco de 30 min (17:00-17:30). Dos partidos con p1 común.
    const shortCourt: CourtWindow[] = [{ courtId: 'c1', order: 1, fromMin: 17 * 60, toMin: 17 * 60 + 45 }];
    const items: ScheduleItem[] = [
      { matchId: 'm1', players: ['p1', 'p2', 'p3', 'p4'] },
      { matchId: 'm2', players: ['p1', 'p5', 'p6', 'p7'] },
    ];
    const res = scheduleMatches(items, shortCourt, 30);
    expect(res.scheduled.map((s) => s.matchId)).toEqual(['m1']);
    expect(res.unscheduled).toEqual(['m2']);
  });

  it('prefiere la pista que abre antes cuando los inicios están escalonados', () => {
    const staggered: CourtWindow[] = [
      { courtId: 'late', order: 1, fromMin: 18 * 60, toMin: 20 * 60 },  // abre a las 18:00 (mejor order)
      { courtId: 'early', order: 2, fromMin: 17 * 60, toMin: 20 * 60 }, // abre a las 17:00
    ];
    const items: ScheduleItem[] = [{ matchId: 'm1', players: ['p1', 'p2', 'p3', 'p4'] }];
    const res = scheduleMatches(items, staggered, 30);
    const m1 = res.scheduled.find((s) => s.matchId === 'm1')!;
    expect(m1.courtId).toBe('early'); // 17:00 es antes que 18:00, gana el inicio más temprano aunque su order sea peor
    expect(m1.startMin).toBe(17 * 60);
  });
});
