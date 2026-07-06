import { describe, it, expect } from 'vitest';
import { writePayloadError } from './validate';

const TODAY = '2026-07-09'; // jueves → semana editable 2026-07-06 y 2026-07-13

describe('writePayloadError', () => {
  it('acepta un payload válido (null = sin error)', () => {
    expect(writePayloadError('2026-07-06', 2, [1200, 1230, 1260], TODAY)).toBeNull();
    expect(writePayloadError('2026-07-13', 0, [], TODAY)).toBeNull(); // borrar el día
  });
  it('rechaza semanas mal formadas o que no son lunes', () => {
    expect(writePayloadError('2026-7-6', 0, [], TODAY)).toMatch(/semana/i);
    expect(writePayloadError('2026-07-08', 0, [], TODAY)).toMatch(/semana/i); // miércoles
    expect(writePayloadError(42, 0, [], TODAY)).toMatch(/semana/i);
  });
  it('rechaza semanas no editables (pasada / +2)', () => {
    expect(writePayloadError('2026-06-29', 0, [], TODAY)).toMatch(/actual o la siguiente/i);
    expect(writePayloadError('2026-07-20', 0, [], TODAY)).toMatch(/actual o la siguiente/i);
  });
  it('rechaza día fuera de 0–6 o no entero', () => {
    expect(writePayloadError('2026-07-06', 7, [], TODAY)).toMatch(/día/i);
    expect(writePayloadError('2026-07-06', -1, [], TODAY)).toMatch(/día/i);
    expect(writePayloadError('2026-07-06', 1.5, [], TODAY)).toMatch(/día/i);
  });
  it('rechaza listas de slots inválidas (bloques <3, no-array, basura)', () => {
    expect(writePayloadError('2026-07-06', 0, [1200, 1230], TODAY)).toMatch(/tramos/i);
    expect(writePayloadError('2026-07-06', 0, 'nope', TODAY)).toMatch(/tramos/i);
    expect(writePayloadError('2026-07-06', 0, [485, 515, 545], TODAY)).toMatch(/tramos/i);
  });
});
