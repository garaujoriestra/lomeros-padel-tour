import { describe, it, expect } from 'vitest';
import { findRootTableAccess } from '../../../scripts/check-direct-db-access.mjs';

describe('guard multi-tenant: sin acceso directo a tablas raíz en src/app', () => {
  it('no encuentra ningún acceso directo (salvo allowlist de migraciones)', () => {
    const offenders = findRootTableAccess('src/app');
    expect(offenders).toEqual([]);
  });
});
