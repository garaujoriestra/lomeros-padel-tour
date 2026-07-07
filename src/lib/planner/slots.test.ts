import { describe, it, expect } from 'vitest';
import { allSlotStarts, formatMin, isValidSlotList, slotsToRanges } from './slots';

describe('isValidSlotList', () => {
  it('acepta lista vacía (sin disponibilidad) y bloques de ≥3 slots', () => {
    expect(isValidSlotList([])).toBe(true);
    expect(isValidSlotList([1200, 1230, 1260])).toBe(true);         // 20:00–21:30
    expect(isValidSlotList([1200, 1230, 1260, 1290])).toBe(true);   // 20:00–22:00
    expect(isValidSlotList([480, 510, 540, 1200, 1230, 1260])).toBe(true); // dos bloques
  });
  it('rechaza bloques de menos de 3 slots (partido = 1,5h)', () => {
    expect(isValidSlotList([1200])).toBe(false);
    expect(isValidSlotList([1200, 1230])).toBe(false);
    expect(isValidSlotList([480, 510, 540, 1200, 1230])).toBe(false); // cola huérfana de 2
  });
  it('rechaza fuera de rango, no múltiplos de 30, desorden y duplicados', () => {
    expect(isValidSlotList([450, 480, 510])).toBe(false);   // antes de 08:00
    expect(isValidSlotList([1380, 1410, 1440])).toBe(false); // 24:00 no es slot
    expect(isValidSlotList([1350, 1380, 1410])).toBe(true);  // 22:30–24:00 sí
    expect(isValidSlotList([485, 515, 545])).toBe(false);    // no múltiplos
    expect(isValidSlotList([1260, 1230, 1200])).toBe(false); // desorden
    expect(isValidSlotList([1200, 1200, 1230, 1260])).toBe(false); // duplicado
  });
});

describe('formatMin', () => {
  it('formatea minutos como HH:MM', () => {
    expect(formatMin(480)).toBe('08:00');
    expect(formatMin(1410)).toBe('23:30');
    expect(formatMin(1440)).toBe('24:00');
  });
});

describe('slotsToRanges', () => {
  it('agrupa slots consecutivos en rangos [inicio, fin)', () => {
    expect(slotsToRanges([1200, 1230, 1260, 1290])).toEqual([{ startMin: 1200, endMin: 1320 }]);
    expect(slotsToRanges([480, 510, 540, 1200, 1230, 1260])).toEqual([
      { startMin: 480, endMin: 570 },
      { startMin: 1200, endMin: 1290 },
    ]);
    expect(slotsToRanges([])).toEqual([]);
  });
});

describe('allSlotStarts', () => {
  it('32 celdas de 08:00 a 23:30', () => {
    const starts = allSlotStarts();
    expect(starts).toHaveLength(32);
    expect(starts[0]).toBe(480);
    expect(starts[31]).toBe(1410);
  });
});
