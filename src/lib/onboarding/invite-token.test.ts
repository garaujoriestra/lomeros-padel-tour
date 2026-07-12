import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';
import { signInviteToken, verifyInviteToken } from './invite-token';

beforeAll(() => { process.env.AUTH_SECRET = 'test-secret-onboarding'; });
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);

describe('invite-token', () => {
  it('firma y verifica un token válido', async () => {
    const t = await signInviteToken();
    expect(await verifyInviteToken(t)).toBe(true);
  });

  it('rechaza token ausente, vacío o basura', async () => {
    expect(await verifyInviteToken(undefined)).toBe(false);
    expect(await verifyInviteToken('')).toBe(false);
    expect(await verifyInviteToken('garbage')).toBe(false);
  });

  it('rechaza un token caducado', async () => {
    const expired = await new SignJWT({ purpose: 'create-group' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('-1h').sign(key());
    expect(await verifyInviteToken(expired)).toBe(false);
  });

  it('rechaza un token con otro purpose (p.ej. una cookie de sesión)', async () => {
    const wrong = await new SignJWT({ userId: 'u1' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(key());
    expect(await verifyInviteToken(wrong)).toBe(false);
  });
});
