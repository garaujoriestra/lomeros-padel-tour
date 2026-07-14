import { describe, it, expect, afterEach, vi } from 'vitest';
import { isPublicSignupEnabled, MAX_GROUPS_PER_ADMIN } from './public-signup';

afterEach(() => vi.unstubAllEnvs());

describe('isPublicSignupEnabled (alta abierta; ON por defecto)', () => {
  it('sin variable → true (abierto)', () => {
    vi.stubEnv('PUBLIC_SIGNUP_ENABLED', '');
    expect(isPublicSignupEnabled()).toBe(true);
  });
  it("valor 'false' → false (cerrado, solo invitación)", () => {
    vi.stubEnv('PUBLIC_SIGNUP_ENABLED', 'false');
    expect(isPublicSignupEnabled()).toBe(false);
  });
  it("cualquier otro valor → true", () => {
    vi.stubEnv('PUBLIC_SIGNUP_ENABLED', 'true');
    expect(isPublicSignupEnabled()).toBe(true);
  });
  it('el cap por cuenta es un entero positivo', () => {
    expect(Number.isInteger(MAX_GROUPS_PER_ADMIN)).toBe(true);
    expect(MAX_GROUPS_PER_ADMIN).toBeGreaterThan(0);
  });
});
