import { describe, it, expect } from 'vitest';
import { decideAccess } from './authorize';

describe('decideAccess', () => {
  it('permite rutas públicas sin sesión', () => {
    expect(decideAccess('/', null)).toBe('allow');
    expect(decideAccess('/rankings', null)).toBe('allow');
  });

  it('manda a login si /admin sin sesión', () => {
    expect(decideAccess('/admin', null)).toBe('redirect-login');
    expect(decideAccess('/admin/players', null)).toBe('redirect-login');
  });

  it('deja pasar /admin a cualquier sesión (el rol lo exige el layout server-side)', () => {
    expect(decideAccess('/admin', { userId: 'u' })).toBe('allow');
    expect(decideAccess('/admin/matches', { userId: 'u' })).toBe('allow');
  });

  it('gatea /me solo por sesión', () => {
    expect(decideAccess('/me', null)).toBe('redirect-login');
    expect(decideAccess('/me/edit', { userId: 'u' })).toBe('allow');
  });

  it('gatea /g/<slug>/me solo por sesión (igual que /me en raíz)', () => {
    expect(decideAccess('/g/grupo-test/me', null)).toBe('redirect-login');
    expect(decideAccess('/g/grupo-test/me', { userId: 'u' })).toBe('allow');
    expect(decideAccess('/g/grupo-test/me/edit', null)).toBe('redirect-login');
  });

  it('no gatea la landing pública del grupo /g/<slug>', () => {
    expect(decideAccess('/g/grupo-test', null)).toBe('allow');
  });
});
