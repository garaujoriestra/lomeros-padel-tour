// Puro y client-safe (sin DB): validación del color de acento del branding.
// Solo #rrggbb estricto: el valor acaba en un style inline → nada de formatos libres.
export function isValidAccentColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

// Luminancia relativa (sRGB) de un color #rrggbb — para decidir el texto sobre el acento.
export function isDarkColor(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const l = 0.2126 * toLin((n >> 16) & 255) + 0.7152 * toLin((n >> 8) & 255) + 0.0722 * toLin(n & 255);
  return l < 0.4;
}
