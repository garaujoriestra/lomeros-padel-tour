import type { CSSProperties } from 'react';
import { loadFont as loadArchivo } from '@remotion/google-fonts/Archivo';
import { loadFont as loadBarlow } from '@remotion/google-fonts/BarlowCondensed';

// Mismas fuentes que la app (src/app/layout.tsx): Archivo para texto,
// Barlow Condensed itálica 800 para display (.display/.sec-title).
const barlow = loadBarlow('italic', { weights: ['800'], subsets: ['latin'] });
const archivo = loadArchivo('normal', {
  weights: ['400', '600', '700'],
  subsets: ['latin'],
});

export const F = {
  display: barlow.fontFamily,
  sans: archivo.fontFamily,
};

// Tokens del tema oscuro de la app (src/app/globals.css .dark).
export const C = {
  bg: 'oklch(0.16 0.022 188)',
  surface: 'oklch(0.205 0.024 186)',
  surface2: 'oklch(0.245 0.026 184)',
  line: 'oklch(0.3 0.028 184)',
  lineStrong: 'oklch(0.38 0.03 182)',
  ink: 'oklch(0.965 0.008 120)',
  ink2: 'oklch(0.82 0.02 150)',
  ink3: 'oklch(0.62 0.025 170)',
  acc: '#c8f03c',
  accInk: 'oklch(0.18 0.025 188)',
  win: 'oklch(0.62 0.16 150)',
  loss: 'oklch(0.66 0.17 25)',
  heroBg:
    'linear-gradient(160deg, oklch(0.225 0.03 190) 0%, oklch(0.17 0.025 186) 60%)',
};

// Estilos compartidos.
export const kickerStyle: CSSProperties = {
  fontFamily: F.display,
  fontStyle: 'italic',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: 34,
  color: C.ink3,
};

export const displayStyle: CSSProperties = {
  fontFamily: F.display,
  fontStyle: 'italic',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.015em',
  lineHeight: 0.95,
  color: C.ink,
  margin: 0,
};

// Separador de miles siempre (Intl es-ES no agrupa números de 4 cifras,
// pero la app enseña «1.584»).
export const fmt = (n: number) =>
  n >= 1000
    ? `${Math.floor(n / 1000)}.${String(n % 1000).padStart(3, '0')}`
    : String(n);
