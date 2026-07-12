import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';
import { signSignupIntent, verifySignupIntent, shouldCreateUser } from './signup-intent';

beforeAll(() => { process.env.AUTH_SECRET = 'test-secret-onboarding'; });
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);

describe('signup-intent', () => {
  it('firma y verifica', async () => {
    expect(await verifySignupIntent(await signSignupIntent())).toBe(true);
  });
  it('rechaza ausente/basura/caducada/otro purpose', async () => {
    expect(await verifySignupIntent(undefined)).toBe(false);
    expect(await verifySignupIntent('x')).toBe(false);
    const expired = await new SignJWT({ purpose: 'signup' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('-1m').sign(key());
    expect(await verifySignupIntent(expired)).toBe(false);
    const wrong = await new SignJWT({ purpose: 'create-group' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30m').sign(key());
    expect(await verifySignupIntent(wrong)).toBe(false);
  });
});

// Decisión pura del callback OAuth: solo se crea cuenta para un email desconocido
// si trae una intención de registro válida (el intercambio con Google no es e2e-able,
// así que esta tabla de verdad es el test de la rama nueva).
describe('shouldCreateUser', () => {
  it('user existente → nunca crear (da igual la cookie)', () => {
    expect(shouldCreateUser({ userExists: true, intentValid: true })).toBe(false);
    expect(shouldCreateUser({ userExists: true, intentValid: false })).toBe(false);
  });
  it('user desconocido → crear SOLO con intención válida', () => {
    expect(shouldCreateUser({ userExists: false, intentValid: true })).toBe(true);
    expect(shouldCreateUser({ userExists: false, intentValid: false })).toBe(false);
  });
});
