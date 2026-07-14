import { describe, it, expect, afterEach, vi } from 'vitest';
import { siteUrl } from './site-url';

afterEach(() => vi.unstubAllEnvs());

describe('siteUrl', () => {
  it('sin env → localhost (dev/e2e)', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    expect(siteUrl().toString()).toBe('http://localhost:3000/');
  });

  it('con dominio de producción de Vercel → https', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'lomeros-padel-tour.vercel.app');
    expect(siteUrl().toString()).toBe('https://lomeros-padel-tour.vercel.app/');
  });

  it('NEXT_PUBLIC_SITE_URL explícita gana a Vercel (dominio propio)', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://padelo.example');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'lomeros-padel-tour.vercel.app');
    expect(siteUrl().toString()).toBe('https://padelo.example/');
  });
});
