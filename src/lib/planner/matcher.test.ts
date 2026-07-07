import { describe, it, expect } from 'vitest';
import { findDayCoincidences } from './matcher';

const S = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i * 30);
// S(1200, 4) = [1200,1230,1260,1290] = 20:00–22:00

const p = (id: string, slots: number[]) => ({ id, name: id, slots });
const court = (id: string, ownerId: string, slots: number[]) => ({ id, name: id, ownerId, slots });

describe('findDayCoincidences', () => {
  it('4 jugadores + pista efectiva 20:00–22:00 → un tramo 20:00–22:00', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => p(id, S(1200, 4)));
    const out = findDayCoincidences(players, [court('pista', 'a', S(1200, 4))]);
    expect(out).toEqual([{
      startMin: 1200, endMin: 1320,
      courtNames: ['pista'], playerNames: ['a', 'b', 'c', 'd'],
    }]);
  });

  it('solo 3 jugadores → sin coincidencias', () => {
    const players = ['a', 'b', 'c'].map((id) => p(id, S(1200, 4)));
    expect(findDayCoincidences(players, [court('pista', 'a', S(1200, 4))])).toEqual([]);
  });

  it('4 jugadores sin pista → sin coincidencias', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => p(id, S(1200, 4)));
    expect(findDayCoincidences(players, [])).toEqual([]);
  });

  it('la pista NO cuenta si su dueño no está disponible (pista ∩ dueño)', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => p(id, S(1200, 4)));
    // Dueño 'z' sin disponibilidad → pista efectiva vacía.
    expect(findDayCoincidences(players, [court('pista', 'z', S(1200, 4))])).toEqual([]);
  });

  it('la pista solo cuenta donde su dueño llega: recorta el tramo', () => {
    // 4 jugadores 20:00–22:00, pero el dueño (uno de ellos) solo 20:00–21:30.
    const players = [p('a', S(1200, 3)), p('b', S(1200, 4)), p('c', S(1200, 4)), p('d', S(1200, 4))];
    const out = findDayCoincidences(players, [court('pista', 'a', S(1200, 4))]);
    // Única ventana posible: 20:00–21:30 (la de 20:30 requiere al dueño hasta 22:00).
    expect(out).toEqual([{
      startMin: 1200, endMin: 1290,
      courtNames: ['pista'], playerNames: ['a', 'b', 'c', 'd'],
    }]);
  });

  it('fusiona ventanas contiguas y une nombres (5º jugador solo al final)', () => {
    const players = [
      ...['a', 'b', 'c', 'd'].map((id) => p(id, S(1200, 5))), // 20:00–22:30
      p('e', S(1260, 3)), // solo 21:00–22:30 (entra en la última ventana activa)
    ];
    const out = findDayCoincidences(players, [court('pista', 'a', S(1200, 5))]);
    expect(out).toHaveLength(1);
    expect(out[0].startMin).toBe(1200);
    expect(out[0].endMin).toBe(1350); // 22:30
    expect(out[0].playerNames).toContain('e');
  });

  it('ventanas activas NO contiguas → tramos separados', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) =>
      p(id, [...S(480, 3), ...S(1200, 3)])); // 08:00–09:30 y 20:00–21:30
    const out = findDayCoincidences(players, [court('pista', 'a', [...S(480, 3), ...S(1200, 3)])]);
    expect(out).toEqual([
      { startMin: 480, endMin: 570, courtNames: ['pista'], playerNames: ['a', 'b', 'c', 'd'] },
      { startMin: 1200, endMin: 1290, courtNames: ['pista'], playerNames: ['a', 'b', 'c', 'd'] },
    ]);
  });

  it('dos pistas de dueños distintos se unen en el tramo fusionado', () => {
    // Pista X efectiva 20:00–21:30 (dueño a); pista Y efectiva 20:30–22:00 (dueño b).
    const players = [
      p('a', S(1200, 3)), p('b', S(1230, 3)),
      p('c', S(1200, 4)), p('d', S(1200, 4)), p('e', S(1200, 4)),
    ];
    const out = findDayCoincidences(players, [
      court('X', 'a', S(1200, 4)),
      court('Y', 'b', S(1200, 4)),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].startMin).toBe(1200);
    expect(out[0].endMin).toBe(1320);
    expect(out[0].courtNames).toEqual(['X', 'Y']);
  });

  it('hueco inactivo entre ventanas activas → dos tramos aunque se solapen en horario', () => {
    // W(20:00) activa con a,b,c,d; W(20:30) inactiva (solo 3); W(21:00) activa con a,b,c,e.
    const players = [
      p('a', S(1200, 5)), p('b', S(1200, 5)), p('c', S(1200, 5)),
      p('d', S(1200, 3)),  // solo hasta 21:30 → cubre W(20:00), no W(20:30) ni W(21:00)
      p('e', S(1260, 3)),  // desde 21:00 → cubre W(21:00), no antes
    ];
    const out = findDayCoincidences(players, [court('pista', 'a', S(1200, 5))]);
    expect(out).toEqual([
      { startMin: 1200, endMin: 1290, courtNames: ['pista'], playerNames: ['a', 'b', 'c', 'd'] },
      { startMin: 1260, endMin: 1350, courtNames: ['pista'], playerNames: ['a', 'b', 'c', 'e'] },
    ]);
  });

  it('detecta la última ventana del día (22:30–24:00)', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => p(id, S(1350, 3)));
    const out = findDayCoincidences(players, [court('pista', 'a', S(1350, 3))]);
    expect(out).toEqual([{
      startMin: 1350, endMin: 1440,
      courtNames: ['pista'], playerNames: ['a', 'b', 'c', 'd'],
    }]);
  });
});
