import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));

import { buildSwitcherGroups } from './group-switcher';

const LOM = { id: 'lomeros', slug: 'lomeros', name: 'Lomeros Padel Tour' };
const GT = { id: 'gt', slug: 'grupo-test', name: 'Grupo Test' };
const ZZ = { id: 'zz', slug: 'zeta', name: 'Zeta Padel' };

describe('buildSwitcherGroups', () => {
  it('con menos de 2 grupos → null (el conmutador no se muestra)', () => {
    expect(buildSwitcherGroups({ groups: [LOM], defaultGroupId: 'lomeros', currentGroupId: 'lomeros' })).toBeNull();
    expect(buildSwitcherGroups({ groups: [], defaultGroupId: 'lomeros', currentGroupId: 'lomeros' })).toBeNull();
  });

  it('href: raíz para el grupo por defecto, /g/<slug> para el resto', () => {
    const items = buildSwitcherGroups({ groups: [LOM, GT], defaultGroupId: 'lomeros', currentGroupId: 'lomeros' })!;
    expect(items.find((g) => g.slug === 'lomeros')?.href).toBe('/');
    expect(items.find((g) => g.slug === 'grupo-test')?.href).toBe('/g/grupo-test');
  });

  it('marca current en el grupo actual y solo en él', () => {
    const items = buildSwitcherGroups({ groups: [LOM, GT], defaultGroupId: 'lomeros', currentGroupId: 'gt' })!;
    expect(items.filter((g) => g.current).map((g) => g.slug)).toEqual(['grupo-test']);
  });

  it('ordena: grupo por defecto primero, resto alfabético por nombre', () => {
    const items = buildSwitcherGroups({ groups: [ZZ, GT, LOM], defaultGroupId: 'lomeros', currentGroupId: 'zz' })!;
    expect(items.map((g) => g.slug)).toEqual(['lomeros', 'grupo-test', 'zeta']);
  });

  it('deduplica por id (membership + listado global del súper-admin no duplican)', () => {
    const items = buildSwitcherGroups({ groups: [LOM, GT, LOM], defaultGroupId: 'lomeros', currentGroupId: 'lomeros' })!;
    expect(items).toHaveLength(2);
  });
});
