import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PLATFORM_NAME } from './constants';

// Ruta al raíz del repo desde src/lib/groups/
const repoFile = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), 'utf8');

// Ficheros de PLATAFORMA que un grupo ajeno ve y que NO deben mencionar «Lomeros»
// (mayúscula). La raíz insignia — src/app/(public)/** y constants.ts — queda fuera:
// ahí «Lomeros» es correcto.
// NOTA: src/app/manifest.ts NO está aquí a propósito — desde Fase 4 · Pieza 2 el
// manifest es la identidad del grupo (raíz = Lomeros insignia), no «Bandejazo».
const PLATFORM_FILES = [
  'src/app/login/page.tsx',
  'src/app/layout.tsx',
  'src/components/shared/crest.tsx',
  'src/app/g/[slug]/layout.tsx',
  'src/components/players/player-profile-view.tsx',
];

describe('marca de plataforma neutralizada', () => {
  it('PLATFORM_NAME es «Bandejazo»', () => {
    expect(PLATFORM_NAME).toBe('Bandejazo');
  });

  it.each(PLATFORM_FILES)('%s no contiene literales «Lomeros» ni «Padelo»', (file) => {
    // Case-sensitive: los comentarios con «/g/lomeros» (minúscula) son legítimos.
    // «Padelo» (marca de trabajo previa, renombrada a Bandejazo) tampoco debe volver.
    expect(repoFile(file)).not.toMatch(/Lomeros|Padelo/);
  });
});

// Directorios de PLATAFORMA creados en la landing: NINGÚN .tsx debe mencionar «Lomeros».
const PLATFORM_DIRS = ['src/app/bandejazo', 'src/app/legal', 'src/components/marketing'];

function walkTsx(relDir: string): string[] {
  const abs = fileURLToPath(new URL(`../../../${relDir}`, import.meta.url));
  const out: string[] = [];
  for (const entry of readdirSync(abs)) {
    const rel = `${relDir}/${entry}`;
    const absEntry = fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
    if (statSync(absEntry).isDirectory()) out.push(...walkTsx(rel));
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(rel);
  }
  return out;
}

describe('superficies de la landing sin literales «Lomeros» ni «Padelo»', () => {
  const files = PLATFORM_DIRS.flatMap(walkTsx);
  it('hay ficheros que comprobar', () => expect(files.length).toBeGreaterThan(0));
  it.each(files)('%s no contiene literales «Lomeros» ni «Padelo»', (file) => {
    expect(repoFile(file)).not.toMatch(/Lomeros|Padelo/);
  });
});
