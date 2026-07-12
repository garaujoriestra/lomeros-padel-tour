import { describe, it, expect } from 'vitest';
import { isNavActive } from './nav-links';

describe('isNavActive (basePath-aware)', () => {
  it('raíz: comportamiento intacto', () => {
    expect(isNavActive('/', '/')).toBe(true);
    expect(isNavActive('/', '/rankings')).toBe(false);
    expect(isNavActive('/rankings', '/players/pl1')).toBe(true);
    expect(isNavActive('/matches', '/matches/abc')).toBe(true);
    expect(isNavActive('/eventos', '/pozos/xyz')).toBe(true);
    expect(isNavActive('/rankings/pairs', '/rankings/pairs')).toBe(true);
  });
  it('grupo: mismos patrones con prefijo /g/<slug>', () => {
    expect(isNavActive('/g/gt', '/g/gt')).toBe(true);
    expect(isNavActive('/g/gt', '/g/gt/rankings')).toBe(false);
    expect(isNavActive('/g/gt/rankings', '/g/gt/players/pl1')).toBe(true);
    expect(isNavActive('/g/gt/matches', '/g/gt/matches/abc')).toBe(true);
    expect(isNavActive('/g/gt/eventos', '/g/gt/pozos/xyz')).toBe(true);
  });
});
