import { describe, it, expect, afterEach, vi } from 'vitest';

// group-context.ts importa @/lib/db al nivel de módulo (para las funciones async).
// Mockeamos el cliente antes de importar para no necesitar env vars de DB en tests unit.
vi.mock('@/lib/db', () => ({ db: {} }));

import { resolveGroupContext, isSuperAdminEmail, type MembershipRow } from './group-context';

const lomerosMember: MembershipRow = { id: 'm1', groupId: 'lomeros', role: 'admin', playerId: 'p1' };

describe('resolveGroupContext', () => {
  it('usa la única membership cuando no se pide un grupo concreto', () => {
    const ctx = resolveGroupContext({ memberships: [lomerosMember], isSuperAdmin: false, targetGroupId: null });
    expect(ctx).toEqual({ groupId: 'lomeros', role: 'admin', membershipId: 'm1', playerId: 'p1', isSuperAdmin: false });
  });

  it('usa la membership del grupo objetivo si existe', () => {
    const other: MembershipRow = { id: 'm2', groupId: 'g2', role: 'player', playerId: 'p9' };
    const ctx = resolveGroupContext({ memberships: [lomerosMember, other], isSuperAdmin: false, targetGroupId: 'g2' });
    expect(ctx).toEqual({ groupId: 'g2', role: 'player', membershipId: 'm2', playerId: 'p9', isSuperAdmin: false });
  });

  it('en su propio grupo, un super-admin es miembro normal (la membership manda)', () => {
    const ctx = resolveGroupContext({ memberships: [lomerosMember], isSuperAdmin: true, targetGroupId: 'lomeros' });
    expect(ctx?.role).toBe('admin');
    expect(ctx?.isSuperAdmin).toBe(true);
    expect(ctx?.playerId).toBe('p1');
  });

  it('da contexto super_admin solo-lectura en un grupo donde NO es miembro', () => {
    const ctx = resolveGroupContext({ memberships: [lomerosMember], isSuperAdmin: true, targetGroupId: 'g2' });
    expect(ctx).toEqual({ groupId: 'g2', role: 'super_admin', membershipId: null, playerId: null, isSuperAdmin: true });
  });

  it('devuelve null si no hay membership y no es super-admin', () => {
    expect(resolveGroupContext({ memberships: [], isSuperAdmin: false, targetGroupId: 'g2' })).toBeNull();
  });

  it('devuelve null si hay varias memberships y no se especifica grupo objetivo', () => {
    const other: MembershipRow = { id: 'm2', groupId: 'g2', role: 'player', playerId: null };
    expect(resolveGroupContext({ memberships: [lomerosMember, other], isSuperAdmin: false, targetGroupId: null })).toBeNull();
  });

  it('niega un grupo ajeno: miembro de varios grupos, no super-admin, pide uno donde no está', () => {
    const other: MembershipRow = { id: 'm2', groupId: 'g2', role: 'player', playerId: null };
    expect(resolveGroupContext({ memberships: [lomerosMember, other], isSuperAdmin: false, targetGroupId: 'g3' })).toBeNull();
  });
});

describe('isSuperAdminEmail', () => {
  const original = process.env.SUPER_ADMIN_EMAILS;
  afterEach(() => { process.env.SUPER_ADMIN_EMAILS = original; });

  it('reconoce un email del allowlist (case-insensitive, con espacios)', () => {
    process.env.SUPER_ADMIN_EMAILS = 'Owner@Example.com , otro@x.com';
    expect(isSuperAdminEmail('owner@example.com')).toBe(true);
    expect(isSuperAdminEmail(' OTRO@x.com ')).toBe(true);
  });

  it('rechaza emails fuera del allowlist y con el env vacío', () => {
    process.env.SUPER_ADMIN_EMAILS = 'owner@example.com';
    expect(isSuperAdminEmail('intruso@x.com')).toBe(false);
    process.env.SUPER_ADMIN_EMAILS = '';
    expect(isSuperAdminEmail('owner@example.com')).toBe(false);
  });
});
