import { describe, it, expect, vi } from 'vitest';

// Mock DB and web-push to prevent module-level initialization errors
// (no Turso env vars in local test environment)
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));

import { shouldDeleteSubscription } from './send';

describe('shouldDeleteSubscription', () => {
  it('borra en 404 y 410 (suscripción muerta)', () => {
    expect(shouldDeleteSubscription(404)).toBe(true);
    expect(shouldDeleteSubscription(410)).toBe(true);
  });

  it('no borra en otros códigos', () => {
    expect(shouldDeleteSubscription(500)).toBe(false);
    expect(shouldDeleteSubscription(201)).toBe(false);
    expect(shouldDeleteSubscription(0)).toBe(false);
  });
});
