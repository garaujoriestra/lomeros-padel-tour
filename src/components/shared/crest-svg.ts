/**
 * Fuente única del escudo de marca LPT (sin JSX, para poder testearlo y
 * reutilizarlo como string en el splash inline de layout.tsx y en los iconos
 * PWA). El componente React vive en crest.tsx y reutiliza estos generadores.
 *
 * Escudo macizo lima con palas de pádel cruzadas en negativo + "LPT" debajo.
 * viewBox: 0 0 128 138 (relación de aspecto 128:138).
 */

export const LIME = '#c8f03c';
export const DARK = '#0c1715';

export const VIEWBOX_W = 128;
export const VIEWBOX_H = 138;

export const SHIELD_PATH =
  'M64 4 L118 25 V66 C118 104 93 124 64 134 C35 124 10 104 10 66 V25 Z';

// Una pala de pádel como silueta en negativo (oscura) con agujeros en lima.
// Centro (cx,cy) y escala parametrizables para reubicarla según la variante.
function racket(rotateDeg: number, cx = 64, cy = 52, scale = 1): string {
  return `<g transform="translate(${cx},${cy}) rotate(${rotateDeg}) scale(${scale})">
    <ellipse cx="0" cy="-13" rx="14" ry="18" fill="${DARK}"/>
    <g fill="${LIME}">
      <circle cx="-5" cy="-19" r="2"/><circle cx="3" cy="-21" r="2"/><circle cx="9" cy="-16" r="2"/>
      <circle cx="-7" cy="-11" r="2"/><circle cx="1" cy="-13" r="2"/><circle cx="8" cy="-9" r="2"/>
      <circle cx="-4" cy="-4" r="2"/><circle cx="4" cy="-6" r="2"/>
    </g>
    <rect x="-3" y="3" width="6" height="24" rx="3" fill="${DARK}"/>
  </g>`;
}

// Las dos palas cruzadas (sin texto), reubicables.
export function crestRacketsMarkup(cy = 52, scale = 1): string {
  return `${racket(38, 64, cy, scale)}${racket(-38, 64, cy, scale)}`;
}

// "Tinta" del escudo: lo que va en negativo sobre el relleno lima
// (palas cruzadas + wordmark). Sin el path del escudo.
export function crestInkMarkup(): string {
  return `${crestRacketsMarkup()}<text x="64" y="120" text-anchor="middle" font-family="Barlow, system-ui, sans-serif" font-size="20" font-weight="800" fill="${DARK}">LPT</text>`;
}

// Contenido completo del escudo (relleno lima + tinta), sin el wrapper <svg>.
export function crestInnerMarkup(): string {
  return `<path d="${SHIELD_PATH}" fill="${LIME}"/>${crestInkMarkup()}`;
}

// Variante sin wordmark: escudo + solo las palas, centradas y algo más grandes
// (a tamaños pequeños, p. ej. la cabecera, el texto "LPT" no se aprecia).
export function crestInnerMarkupNoWordmark(): string {
  return `<path d="${SHIELD_PATH}" fill="${LIME}"/>${crestRacketsMarkup(64, 1.25)}`;
}

// SVG completo como string a un ancho dado (alto proporcional).
export function crestSvgMarkup(size = VIEWBOX_W): string {
  const height = Math.round((size * VIEWBOX_H) / VIEWBOX_W);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 ${VIEWBOX_W} ${VIEWBOX_H}">${crestInnerMarkup()}</svg>`;
}

// data-URI para usar en <img> dentro de next/og ImageResponse.
export function crestDataUri(size = VIEWBOX_W): string {
  return `data:image/svg+xml,${encodeURIComponent(crestSvgMarkup(size))}`;
}
