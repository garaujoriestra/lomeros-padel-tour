import { describe, it, expect } from 'vitest';
import { isMarketingHost } from './host';

describe('isMarketingHost', () => {
  it('sin MARKETING_HOST configurado → nunca (rewrite inerte)', () => {
    expect(isMarketingHost('bandejazo.app', undefined)).toBe(false);
    expect(isMarketingHost('bandejazo.app', '')).toBe(false);
    expect(isMarketingHost('bandejazo.app', '  ')).toBe(false);
  });

  it('coincide exacto, sin distinguir mayúsculas ni espacios', () => {
    expect(isMarketingHost('bandejazo.app', 'bandejazo.app')).toBe(true);
    expect(isMarketingHost('BANDEJAZO.APP', ' bandejazo.app ')).toBe(true);
  });

  it('no coincide → false (el dominio de la app sigue sirviendo Lomeros)', () => {
    expect(isMarketingHost('lomeros-padel-tour.vercel.app', 'bandejazo.app')).toBe(false);
    expect(isMarketingHost(null, 'bandejazo.app')).toBe(false);
    expect(isMarketingHost('sub.bandejazo.app', 'bandejazo.app')).toBe(false);
  });
});
