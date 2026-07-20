import gsap from 'gsap';

/**
 * La escala de motion de DESIGN.md §5, del lado de GSAP.
 *
 * El emparejamiento con las custom properties de `globals.css` es por NOMBRE,
 * no por réplica exacta del cubic-bezier: `expo.out` y
 * `cubic-bezier(0.22, 1, 0.36, 1)` son primas, no gemelas. Se eligió así a
 * propósito — clavarlas exigiría CustomEase (~3 KB gzip) para una diferencia
 * que nadie distingue. Si algún día hace falta exactitud, ese es el cambio.
 *
 * Duraciones en SEGUNDOS (GSAP) frente a milisegundos (CSS).
 */
export const EASE = {
  out: 'expo.out', //      ↔ --ease-out      entra y se posa
  inOut: 'power2.inOut', // ↔ --ease-in-out   de A a B
  in: 'power2.in', //      ↔ --ease-in       sale
  linear: 'none', //       ↔ --ease-linear   barridos y scrub
} as const;

export const DUR = {
  d1: 0.1, //  ↔ --dur-1  100ms
  d2: 0.15, // ↔ --dur-2  150ms
  d3: 0.26, // ↔ --dur-3  260ms
  d4: 0.42, // ↔ --dur-4  420ms
  d5: 0.7, //  ↔ --dur-5  700ms
} as const;

let aplicado = false;

/**
 * Fija los defaults de GSAP a la escala. Idempotente y llamado por TODOS los
 * módulos de la landing que animan: `gsap.defaults()` es global al runtime, así
 * que dejarlo en manos de quien monte primero (el 3D llega por dynamic import)
 * haría que el resultado dependiera del orden de carga.
 *
 * Solo afecta a tweens que NO declaren `ease`/`duration` propios; en la landing
 * casi todos los declaran, así que esto es la red de seguridad, no el volante.
 */
export function applyMotionDefaults() {
  if (aplicado) return;
  aplicado = true;
  gsap.defaults({ ease: EASE.out, duration: DUR.d4 });
}
