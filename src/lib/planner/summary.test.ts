import { describe, it, expect } from 'vitest';
import { summarizeDay } from './summary';

const S = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i * 30);
const p = (name: string, slots: number[]) => ({ id: name, name, slots });

describe('summarizeDay', () => {
  it('sin disponibilidad → []', () => {
    expect(summarizeDay([])).toEqual([]);
    expect(summarizeDay([p('a', [])])).toEqual([]);
  });

  it('un jugador 20:00–22:00 → un segmento con su nombre', () => {
    expect(summarizeDay([p('a', S(1200, 4))])).toEqual([
      { startMin: 1200, endMin: 1320, names: ['a'] },
    ]);
  });

  it('solape parcial → el tramo se parte donde cambia la composición', () => {
    // a 20:00–22:00, b 20:30–22:30 → [20:00–20:30 a] [20:30–22:00 a,b] [22:00–22:30 b]
    const out = summarizeDay([p('a', S(1200, 4)), p('b', S(1230, 4))]);
    expect(out).toEqual([
      { startMin: 1200, endMin: 1230, names: ['a'] },
      { startMin: 1230, endMin: 1320, names: ['a', 'b'] },
      { startMin: 1320, endMin: 1350, names: ['b'] },
    ]);
  });

  it('huecos → segmentos separados aunque la composición sea la misma', () => {
    const out = summarizeDay([p('a', [...S(480, 3), ...S(1200, 3)])]);
    expect(out).toEqual([
      { startMin: 480, endMin: 570, names: ['a'] },
      { startMin: 1200, endMin: 1290, names: ['a'] },
    ]);
  });
});
