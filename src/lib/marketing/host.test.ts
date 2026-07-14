import { describe, it, expect } from 'vitest';
import { isMarketingHost } from './host';

describe('isMarketingHost', () => {
  it('sin MARKETING_HOST configurado → nunca (rewrite inerte)', () => {
    expect(isMarketingHost('padelo.app', undefined)).toBe(false);
    expect(isMarketingHost('padelo.app', '')).toBe(false);
    expect(isMarketingHost('padelo.app', '  ')).toBe(false);
  });

  it('coincide exacto, sin distinguir mayúsculas ni espacios', () => {
    expect(isMarketingHost('padelo.app', 'padelo.app')).toBe(true);
    expect(isMarketingHost('PADELO.APP', ' padelo.app ')).toBe(true);
  });

  it('no coincide → false (el dominio de la app sigue sirviendo Lomeros)', () => {
    expect(isMarketingHost('lomeros-padel-tour.vercel.app', 'padelo.app')).toBe(false);
    expect(isMarketingHost(null, 'padelo.app')).toBe(false);
    expect(isMarketingHost('sub.padelo.app', 'padelo.app')).toBe(false);
  });
});
