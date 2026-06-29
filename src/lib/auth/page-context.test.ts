import { describe, it, expect, vi, beforeEach } from 'vitest';

const getGroupBySlug = vi.fn();
const getDefaultGroupId = vi.fn();
const getGroupContext = vi.fn();
const getGroupById = vi.fn();
const getPlayerInGroup = vi.fn();
const notFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); });

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/groups/resolve-slug', () => ({ getGroupBySlug: (s: string) => getGroupBySlug(s) }));
vi.mock('@/lib/groups/queries', () => ({ getGroupById: (id: string) => getGroupById(id) }));
vi.mock('@/lib/auth/group-context', () => ({
  getDefaultGroupId: () => getDefaultGroupId(),
  getGroupContext: (o: unknown) => getGroupContext(o),
}));
vi.mock('@/lib/players/queries', () => ({ getPlayerInGroup: (g: string, p: string) => getPlayerInGroup(g, p) }));
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));

import { resolvePageContext } from './page-context';

beforeEach(() => { [getGroupBySlug, getDefaultGroupId, getGroupContext, getGroupById, getPlayerInGroup, notFound].forEach((f) => f.mockReset()); });

const GT = { id: 'gt', slug: 'grupo-test', name: 'Grupo Test' };
const LOM = { id: 'lomeros', slug: 'lomeros', name: 'Lomeros Padel Tour' };

describe('resolvePageContext', () => {
  it('sin slug → grupo por defecto, basePath vacío', async () => {
    getDefaultGroupId.mockResolvedValue('lomeros');
    getGroupById.mockResolvedValue(LOM);
    getGroupContext.mockResolvedValue({ groupId: 'lomeros', role: 'admin', playerId: null, isSuperAdmin: false });
    const ctx = await resolvePageContext();
    expect(ctx.groupId).toBe('lomeros');
    expect(ctx.basePath).toBe('');
    expect(ctx.role).toBe('admin');
  });

  it('con slug → grupo del slug, basePath /g/<slug>', async () => {
    getGroupBySlug.mockResolvedValue(GT);
    getDefaultGroupId.mockResolvedValue('lomeros');
    getGroupContext.mockResolvedValue({ groupId: 'gt', role: 'player', playerId: 'gt-pl1', isSuperAdmin: false });
    getPlayerInGroup.mockResolvedValue({ id: 'gt-pl1', name: 'Jugador GT' });
    const ctx = await resolvePageContext('grupo-test');
    expect(ctx.groupId).toBe('gt');
    expect(ctx.basePath).toBe('/g/grupo-test');
    expect(ctx.role).toBe('player');
    expect(ctx.player?.id).toBe('gt-pl1');
  });

  it('slug inexistente → notFound()', async () => {
    getGroupBySlug.mockResolvedValue(null);
    await expect(resolvePageContext('nope')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('visitante sin membership en el grupo → role/player null (público)', async () => {
    getGroupBySlug.mockResolvedValue(GT);
    getDefaultGroupId.mockResolvedValue('lomeros');
    getGroupContext.mockResolvedValue(null);
    const ctx = await resolvePageContext('grupo-test');
    expect(ctx.groupId).toBe('gt');
    expect(ctx.role).toBeNull();
    expect(ctx.player).toBeNull();
  });
});
