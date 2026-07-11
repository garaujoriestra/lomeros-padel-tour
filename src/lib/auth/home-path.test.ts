import { describe, it, expect, vi } from 'vitest';

// El módulo importa @/lib/db para el wrapper homePathForUser; aquí solo se testea el
// resolutor puro, así que basta un stub.
vi.mock('@/lib/db', () => ({ db: {} }));

import { resolveHomePath, type HomeMembership } from './home-path';

const LOMEROS = 'lomeros';

function mb(groupId: string, slug: string, createdAt: string): HomeMembership {
  return { groupId, slug, createdAt };
}

describe('resolveHomePath', () => {
  it('sin memberships → /me (bienvenida)', () => {
    expect(resolveHomePath([], LOMEROS)).toBe('/me');
  });

  it('miembro del grupo por defecto → /me (aunque tenga otros grupos)', () => {
    expect(resolveHomePath([mb(LOMEROS, 'lomeros', '2026-01-01')], LOMEROS)).toBe('/me');
    expect(
      resolveHomePath(
        [mb('otro', 'otro', '2026-06-01'), mb(LOMEROS, 'lomeros', '2026-01-01')],
        LOMEROS,
      ),
    ).toBe('/me');
  });

  it('exactamente una membership no-default → /g/<slug>/me', () => {
    expect(resolveHomePath([mb('gt', 'grupo-test', '2026-01-01')], LOMEROS)).toBe(
      '/g/grupo-test/me',
    );
  });

  it('varias no-default → la más reciente', () => {
    expect(
      resolveHomePath(
        [mb('a', 'grupo-a', '2026-01-01'), mb('b', 'grupo-b', '2026-05-01')],
        LOMEROS,
      ),
    ).toBe('/g/grupo-b/me');
  });
});
