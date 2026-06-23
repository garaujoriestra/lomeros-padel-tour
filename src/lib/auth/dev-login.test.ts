import { afterEach, describe, expect, it } from 'vitest';
import { isDevToolingEnabled } from './dev-login';

describe('isDevToolingEnabled', () => {
  const original = process.env.VERCEL_ENV;
  afterEach(() => {
    if (original === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original;
  });

  it('habilitado en local (VERCEL_ENV indefinido)', () => {
    delete process.env.VERCEL_ENV;
    expect(isDevToolingEnabled()).toBe(true);
  });

  it('habilitado en preview', () => {
    process.env.VERCEL_ENV = 'preview';
    expect(isDevToolingEnabled()).toBe(true);
  });

  it('bloqueado en produccion', () => {
    process.env.VERCEL_ENV = 'production';
    expect(isDevToolingEnabled()).toBe(false);
  });
});
