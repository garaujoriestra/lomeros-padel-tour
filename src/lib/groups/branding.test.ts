import { describe, it, expect } from 'vitest';
import { isDarkColor, isValidAccentColor } from './branding';
import { buildLogoKey } from '@/lib/upload/blob-path';

describe('isValidAccentColor', () => {
  it('acepta hex #rrggbb', () => {
    expect(isValidAccentColor('#c8f03c')).toBe(true);
    expect(isValidAccentColor('#FF5500')).toBe(true);
  });
  it('rechaza formatos raros (inyección CSS incluida)', () => {
    expect(isValidAccentColor('#fff')).toBe(false);
    expect(isValidAccentColor('red')).toBe(false);
    expect(isValidAccentColor('#c8f03c; background:url(x)')).toBe(false);
    expect(isValidAccentColor(null)).toBe(false);
    expect(isValidAccentColor(123)).toBe(false);
  });
});

describe('isDarkColor', () => {
  it('acentos oscuros → true (texto blanco encima)', () => {
    expect(isDarkColor('#000080')).toBe(true); // azul marino
    expect(isDarkColor('#111111')).toBe(true); // casi negro
    expect(isDarkColor('#000000')).toBe(true);
  });
  it('acentos claros → false (se conserva el texto casi negro por defecto)', () => {
    expect(isDarkColor('#c8f03c')).toBe(false); // verde lima por defecto
    expect(isDarkColor('#ffffff')).toBe(false);
  });
});

describe('buildLogoKey', () => {
  it('namespacea por grupo y normaliza extensión', () => {
    expect(buildLogoKey('g1', 'uuid1', '.PNG')).toBe('logos/g1/uuid1.png');
    expect(buildLogoKey('g1', 'uuid1', '')).toBe('logos/g1/uuid1.jpg');
  });
});
