import { describe, it, expect, vi } from 'vitest';

// resolve-slug.ts importa @/lib/db al nivel de módulo (para getGroupBySlug).
// Lo mockeamos para no necesitar env vars de DB en este unit de la parte pura.
vi.mock('@/lib/db', () => ({ db: {} }));

import { isValidGroupSlug, RESERVED_SLUGS } from './resolve-slug';

describe('isValidGroupSlug', () => {
  it('acepta slugs en minúsculas con dígitos y guiones internos', () => {
    expect(isValidGroupSlug('grupo-test')).toBe(true);
    expect(isValidGroupSlug('lomeros')).toBe(true);
    expect(isValidGroupSlug('padel2026')).toBe(true);
  });

  it('rechaza mayúsculas, espacios, vacío y guiones en los extremos', () => {
    expect(isValidGroupSlug('Grupo')).toBe(false);
    expect(isValidGroupSlug('con espacio')).toBe(false);
    expect(isValidGroupSlug('-leading')).toBe(false);
    expect(isValidGroupSlug('trailing-')).toBe(false);
    expect(isValidGroupSlug('')).toBe(false);
  });

  it('rechaza segmentos reservados que colisionan con rutas reales', () => {
    for (const r of ['g', 'api', 'admin', 'me', 'login']) {
      expect(RESERVED_SLUGS.has(r)).toBe(true);
      expect(isValidGroupSlug(r)).toBe(false);
    }
  });
});
