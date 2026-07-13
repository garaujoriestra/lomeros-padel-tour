import { describe, it, expect, afterEach, vi } from 'vitest';
import { hasSeasonPass, isPaidGroup } from './paid';

const NOW = new Date('2026-07-12T00:00:00.000Z');
const paid = { paidUntil: '2027-07-12T00:00:00.000Z' };
const expired = { paidUntil: '2026-01-01T00:00:00.000Z' };
const never = { paidUntil: null };

afterEach(() => vi.unstubAllEnvs());

describe('hasSeasonPass (⭐: pase REAL, ignora el flag)', () => {
  it('vigente → true; caducado o nunca → false', () => {
    expect(hasSeasonPass(paid, NOW)).toBe(true);
    expect(hasSeasonPass(expired, NOW)).toBe(false);
    expect(hasSeasonPass(never, NOW)).toBe(false);
  });

  it('con el billing apagado NO regala la estrella', () => {
    vi.stubEnv('BILLING_ENABLED', '');
    expect(hasSeasonPass(never, NOW)).toBe(false);
  });
});

describe('isPaidGroup (branding/atribución: flag-aware)', () => {
  it('flag apagado (o ausente) → todos de pago (beta)', () => {
    vi.stubEnv('BILLING_ENABLED', '');
    expect(isPaidGroup(never, NOW)).toBe(true);
    vi.stubEnv('BILLING_ENABLED', 'false');
    expect(isPaidGroup(never, NOW)).toBe(true);
  });

  it('flag encendido → manda el pase real', () => {
    vi.stubEnv('BILLING_ENABLED', 'true');
    expect(isPaidGroup(paid, NOW)).toBe(true);
    expect(isPaidGroup(expired, NOW)).toBe(false);
    expect(isPaidGroup(never, NOW)).toBe(false);
  });
});
