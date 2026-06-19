import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';
import { signSession, verifySession } from './jwt';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-para-jwt';
});

describe('signSession / verifySession', () => {
  it('firma y verifica un payload con solo userId', async () => {
    const token = await signSession({ userId: 'u1' });
    const payload = await verifySession(token);
    expect(payload).toEqual({ userId: 'u1' });
  });

  it('devuelve null si no hay token', async () => {
    expect(await verifySession(undefined)).toBeNull();
  });

  it('devuelve null si la firma no es válida', async () => {
    expect(await verifySession('no-es-un-jwt')).toBeNull();
  });

  it('acepta cookies viejas que aún llevan role e ignora el campo', async () => {
    // Compat hacia atrás: en prod hay cookies firmadas antes de 1C con { userId, role }.
    const old = await new SignJWT({ userId: 'u2', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    const payload = await verifySession(old);
    expect(payload).toEqual({ userId: 'u2' });
  });
});
