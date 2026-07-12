// Puro y client-safe (sin DB): validación del color de acento del branding.
// Solo #rrggbb estricto: el valor acaba en un style inline → nada de formatos libres.
export function isValidAccentColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}
