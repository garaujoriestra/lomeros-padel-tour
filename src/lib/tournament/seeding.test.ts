import { describe, it, expect } from 'vitest';
import { shuffleDeterministic } from './seeding';

describe('shuffleDeterministic', () => {
  it('es reproducible con la misma semilla', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(shuffleDeterministic(items, 42)).toEqual(shuffleDeterministic(items, 42));
  });

  it('da un orden distinto con otra semilla (en general)', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(shuffleDeterministic(items, 1)).not.toEqual(shuffleDeterministic(items, 2));
  });

  it('es una permutación (mismos elementos, sin perder ni duplicar)', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const out = shuffleDeterministic(items, 7);
    expect([...out].sort()).toEqual([...items].sort());
    expect(out.length).toBe(items.length);
  });

  it('no muta el array de entrada', () => {
    const items = ['a', 'b', 'c'];
    const copy = [...items];
    shuffleDeterministic(items, 3);
    expect(items).toEqual(copy);
  });
});
