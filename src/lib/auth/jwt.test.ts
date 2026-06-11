import { describe, it, expect, beforeAll } from 'vitest';
import { signSession, verifySession } from './jwt';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123';
});

describe('jwt session', () => {
  it('round-trips a payload', async () => {
    const token = await signSession({ userId: 'u1', role: 'admin' });
    const payload = await verifySession(token);
    expect(payload?.userId).toBe('u1');
    expect(payload?.role).toBe('admin');
  });

  it('returns null for a tampered token', async () => {
    const token = await signSession({ userId: 'u1', role: 'player' });
    const bad = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    expect(await verifySession(bad)).toBeNull();
  });

  it('returns null for undefined', async () => {
    expect(await verifySession(undefined)).toBeNull();
  });
});
