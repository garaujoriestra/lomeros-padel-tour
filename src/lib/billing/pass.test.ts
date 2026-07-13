import { describe, it, expect } from 'vitest';
import { extendedPaidUntil } from './pass';

const NOW = new Date('2026-07-12T10:00:00.000Z');

describe('extendedPaidUntil', () => {
  it('sin pase previo (o caducado) → un año desde hoy', () => {
    expect(extendedPaidUntil(null, NOW)).toBe('2027-07-12T10:00:00.000Z');
    expect(extendedPaidUntil('2026-01-01T00:00:00.000Z', NOW)).toBe('2027-07-12T10:00:00.000Z');
  });
  it('pase vigente → EXTIENDE un año desde su fin (renovar antes no penaliza)', () => {
    expect(extendedPaidUntil('2026-12-31T00:00:00.000Z', NOW)).toBe('2027-12-31T00:00:00.000Z');
  });
});
