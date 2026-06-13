import { describe, it, expect } from 'vitest';
import {
  SHIELD_PATH,
  LIME,
  crestInnerMarkup,
  crestInnerMarkupNoWordmark,
  crestInkMarkup,
  crestSvgMarkup,
  crestDataUri,
} from './crest-svg';

describe('crest-svg', () => {
  it('crestInkMarkup contiene las palas y el wordmark LPT', () => {
    const ink = crestInkMarkup();
    expect(ink).toContain('LPT');
    expect(ink).toContain('<ellipse'); // cabeza de la pala
    expect(ink).toContain('<rect'); // mango de la pala
  });

  it('crestInnerMarkup incluye el path del escudo relleno de lima + la tinta', () => {
    const inner = crestInnerMarkup();
    expect(inner).toContain(SHIELD_PATH);
    expect(inner).toContain(LIME);
    expect(inner).toContain('LPT');
  });

  it('crestInnerMarkupNoWordmark incluye el escudo y las palas pero NO el wordmark', () => {
    const inner = crestInnerMarkupNoWordmark();
    expect(inner).toContain(SHIELD_PATH);
    expect(inner).toContain('<ellipse'); // cabeza de la pala
    expect(inner).not.toContain('LPT');
  });

  it('crestSvgMarkup envuelve en <svg> con viewBox y tamaño', () => {
    const svg = crestSvgMarkup(128);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 128 138"');
    expect(svg).toContain('width="128"');
    expect(svg).toContain(SHIELD_PATH);
  });

  it('crestDataUri produce un data-URI de svg decodificable', () => {
    const uri = crestDataUri(140);
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    const decoded = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
    expect(decoded).toContain('<svg');
    expect(decoded).toContain('LPT');
  });
});
