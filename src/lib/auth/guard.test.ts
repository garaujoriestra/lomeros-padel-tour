import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
const getGroupContext = vi.fn();
vi.mock('@/lib/auth/session', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/auth/group-context', () => ({ getGroupContext: (o: unknown) => getGroupContext(o) }));

import { requireGroupAdmin } from './guard';

beforeEach(() => { getSession.mockReset(); getGroupContext.mockReset(); });

function status(r: Awaited<ReturnType<typeof requireGroupAdmin>>) {
  return 'response' in r ? r.response.status : null;
}

describe('requireGroupAdmin', () => {
  it('401 sin sesión', async () => {
    getSession.mockResolvedValue(null);
    expect(status(await requireGroupAdmin('g1'))).toBe(401);
  });
  it('403 si no hay contexto en el grupo objetivo', async () => {
    getSession.mockResolvedValue({ userId: 'u', email: 'e' });
    getGroupContext.mockResolvedValue(null);
    expect(status(await requireGroupAdmin('g1'))).toBe(403);
  });
  it('403 si el rol no es admin (player/super_admin)', async () => {
    getSession.mockResolvedValue({ userId: 'u', email: 'e' });
    getGroupContext.mockResolvedValue({ groupId: 'g1', role: 'player', isSuperAdmin: false });
    expect(status(await requireGroupAdmin('g1'))).toBe(403);
    getGroupContext.mockResolvedValue({ groupId: 'g1', role: 'super_admin', isSuperAdmin: true });
    expect(status(await requireGroupAdmin('g1'))).toBe(403);
  });
  it('devuelve ctx si es admin del grupo objetivo', async () => {
    getSession.mockResolvedValue({ userId: 'u', email: 'e' });
    const ctx = { groupId: 'g1', role: 'admin', membershipId: 'm', playerId: null, isSuperAdmin: false };
    getGroupContext.mockResolvedValue(ctx);
    const r = await requireGroupAdmin('g1');
    expect('ctx' in r && r.ctx).toEqual(ctx);
  });
});
