/**
 * Canal mutable compartido de la landing entre la capa DOM (scroll-fx: pin de
 * la pista, golpes, saque) y la capa canvas (pelota/pista 3D). Singleton de
 * módulo sin dependencias (ni three ni gsap): scroll-fx puede importarlo sin
 * arrastrar el bundle 3D, que carga perezoso.
 */
export const LANDING_BUS = {
  /** Progreso global de scroll de la página (0..1). */
  progress: 0,
  /** La Pista: sección pineada de funcionalidades golpe a golpe. */
  pista: { active: false, t: 0, beats: 4 },
  /** Saque inicial (cold-open): offsets que anima el timeline del saque. */
  intro: { y: 0, xOff: 0, squash: 1, done: false },
  /** Golpe del usuario (peloteo): impulsos que decaen. */
  hit: { x: 0, y: 0, spin: 0, squash: 1 },
  /** Proyección de la pelota a pantalla (hit-test, cursor, chip). */
  screen: { x: -9999, y: -9999, r: 0 },
  /** Posición mundo de la pelota (para el confeti). */
  world: { x: 0, y: 0 },
  chipEl: null as HTMLSpanElement | null,
  chipOn: false,
};

export function resetLandingBus() {
  LANDING_BUS.progress = 0;
  LANDING_BUS.pista = { active: false, t: 0, beats: 4 };
  LANDING_BUS.intro = { y: 0, xOff: 0, squash: 1, done: false };
  LANDING_BUS.hit = { x: 0, y: 0, spin: 0, squash: 1 };
  LANDING_BUS.screen = { x: -9999, y: -9999, r: 0 };
  LANDING_BUS.world = { x: 0, y: 0 };
  LANDING_BUS.chipEl = null;
  LANDING_BUS.chipOn = false;
}
