import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array } from './client';

describe('urlBase64ToUint8Array', () => {
  it('convierte base64url a Uint8Array de la longitud correcta', () => {
    // "AQID" en base64 = bytes [1,2,3]
    const out = urlBase64ToUint8Array('AQID');
    expect(out).toBeInstanceOf(Uint8Array);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('maneja caracteres url-safe (- y _)', () => {
    // base64url "-_8" → base64 "+/8" → bytes [251, 255]
    const out = urlBase64ToUint8Array('-_8');
    expect(Array.from(out)).toEqual([251, 255]);
  });
});
