import { describe, it, expect } from 'vitest';
import { decideAccess } from './authorize';

describe('decideAccess', () => {
  it('permite rutas públicas sin sesión', () => {
    expect(decideAccess('/', null)).toBe('allow');
    expect(decideAccess('/rankings', null)).toBe('allow');
  });

  it('redirige a login si /admin sin sesión', () => {
    expect(decideAccess('/admin', null)).toBe('redirect-login');
    expect(decideAccess('/admin/players', null)).toBe('redirect-login');
  });

  it('redirige a home si /admin con sesión de jugador', () => {
    expect(decideAccess('/admin', { userId: 'u', role: 'player' })).toBe('redirect-home');
  });

  it('permite /admin a un admin', () => {
    expect(decideAccess('/admin/matches', { userId: 'u', role: 'admin' })).toBe('allow');
  });

  it('exige sesión para /me', () => {
    expect(decideAccess('/me', null)).toBe('redirect-login');
    expect(decideAccess('/me/edit', { userId: 'u', role: 'player' })).toBe('allow');
    expect(decideAccess('/me', { userId: 'u', role: 'admin' })).toBe('allow');
  });
});
