import { describe, it, expect } from 'vitest';
import { buildGroupManifest } from './manifest';

const PLATFORM_BG = '#0c1715';
const lomeros = { name: 'Lomeros Padel Tour', slug: 'lomeros', logoUrl: null, accentColor: null };

describe('buildGroupManifest', () => {
  it('grupo por defecto (basePath \'\'): start_url / e identidad Lomeros, iconos de plataforma', () => {
    const m = buildGroupManifest({ brand: lomeros, basePath: '', paid: true });
    expect(m.name).toBe('Lomeros Padel Tour');
    expect(m.start_url).toBe('/');
    expect(m.id).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.theme_color).toBe(PLATFORM_BG);
    expect(m.icons?.map((i) => i.src)).toEqual(['/icon', '/icon-512', '/icon-maskable']);
  });

  it('grupo de pago con acento: start_url /g/<slug>, theme = acento, iconos del grupo', () => {
    const m = buildGroupManifest({
      brand: { name: 'Los Cracks', slug: 'cracks', logoUrl: null, accentColor: '#ff3366' },
      basePath: '/g/cracks',
      paid: true,
    });
    expect(m.name).toBe('Los Cracks');
    expect(m.start_url).toBe('/g/cracks');
    expect(m.scope).toBe('/');
    expect(m.theme_color).toBe('#ff3366');
    expect(m.icons?.map((i) => i.src)).toEqual(['/g/cracks/icon', '/g/cracks/icon-512', '/g/cracks/icon-maskable']);
    expect(m.icons?.find((i) => i.purpose === 'maskable')?.src).toBe('/g/cracks/icon-maskable');
  });

  it('grupo NO de pago: nombre del grupo pero color e iconos de plataforma', () => {
    const m = buildGroupManifest({
      brand: { name: 'Los Cracks', slug: 'cracks', logoUrl: 'https://x/logo.png', accentColor: '#ff3366' },
      basePath: '/g/cracks',
      paid: false,
    });
    expect(m.name).toBe('Los Cracks');
    expect(m.theme_color).toBe(PLATFORM_BG);
    expect(m.icons?.map((i) => i.src)).toEqual(['/icon', '/icon-512', '/icon-maskable']);
  });

  it('grupo de pago con logo pero sin acento válido: iconos del grupo, theme de plataforma', () => {
    const m = buildGroupManifest({
      brand: { name: 'G', slug: 'g', logoUrl: 'https://x/l.png', accentColor: 'no-color' },
      basePath: '/g/g',
      paid: true,
    });
    expect(m.theme_color).toBe(PLATFORM_BG);
    expect(m.icons?.[0].src).toBe('/g/g/icon');
  });
});
