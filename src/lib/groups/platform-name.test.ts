import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PLATFORM_NAME } from './constants';

// Ruta al raíz del repo desde src/lib/groups/
const repoFile = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), 'utf8');

// Ficheros de PLATAFORMA que un grupo ajeno ve y que NO deben mencionar «Lomeros»
// (mayúscula). La raíz insignia — src/app/(public)/** y constants.ts — queda fuera:
// ahí «Lomeros» es correcto.
// NOTA: src/app/manifest.ts NO está aquí a propósito — desde Fase 4 · Pieza 2 el
// manifest es la identidad del grupo (raíz = Lomeros insignia), no «Padelo».
const PLATFORM_FILES = [
  'src/app/login/page.tsx',
  'src/app/layout.tsx',
  'src/components/shared/crest.tsx',
  'src/app/g/[slug]/layout.tsx',
  'src/components/players/player-profile-view.tsx',
];

describe('marca de plataforma neutralizada', () => {
  it('PLATFORM_NAME es «Padelo»', () => {
    expect(PLATFORM_NAME).toBe('Padelo');
  });

  it.each(PLATFORM_FILES)('%s no contiene el literal «Lomeros»', (file) => {
    // Case-sensitive: los comentarios con «/g/lomeros» (minúscula) son legítimos.
    expect(repoFile(file)).not.toMatch(/Lomeros/);
  });
});
