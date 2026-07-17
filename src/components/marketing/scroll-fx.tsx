'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { LANDING_BUS } from './landing-bus';

/**
 * Motion de la landing (GSAP + ScrollTrigger), declarado por atributo:
 *
 * - `data-parallax="expand"`: el bloque visual se expande suavemente (0.9 → 1)
 *   ligado a la posición de scroll (scrub), mientras entra en el viewport.
 * - `data-parallax="drift"`: deriva vertical a distinta velocidad que el scroll.
 * - `data-tilt`: tilt 3D al puntero (solo hover + pointer fine).
 * - `data-fx="…"`: el efecto PROPIO de cada sección — cada uno demuestra el
 *   contenido que revela (los Elo cuentan, la ficha gira, los sets voltean,
 *   la semana se enciende, el rail se dibuja, «Gratis» se estampa). Son
 *   entradas únicas (`once`) con gsap.from + clearProps: el estado por defecto
 *   del DOM es SIEMPRE el final — sin JS la landing queda íntegra y visible.
 *
 * Con prefers-reduced-motion no se crea ningún tween (gsap.matchMedia) y la
 * landing queda estática, como hasta ahora.
 */

/** Cuenta un número renderizado hasta su valor real desde ~88%, conservando
 *  el formato es-ES original (1.240 con punto de millar, 1584 sin él).
 *  El millar se formatea a mano: toLocaleString('es-ES') no es fiable en
 *  navegadores con ICU reducido (devolvería «1240» y rompería el formato). */
const milesEs = (v: number) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function countUp(el: Element, delay = 0) {
  const raw = el.textContent ?? '';
  const target = parseInt(raw.replace(/\./g, ''), 10);
  if (!Number.isFinite(target)) return;
  const o = { v: Math.round(target * 0.88) };
  gsap.to(o, {
    v: target,
    delay,
    duration: 1.1,
    ease: 'expo.out',
    snap: { v: 1 },
    onUpdate() {
      el.textContent = raw.includes('.') ? milesEs(o.v) : String(o.v);
    },
  });
}

/** Dispara `fn` una única vez cuando `trigger` entra en el viewport. */
function onceInView(trigger: Element, fn: () => void, start = 'top 78%') {
  ScrollTrigger.create({ trigger, start, once: true, onEnter: fn });
}

/* ── Coreografías de los golpes de La Pista (también secciones sueltas en
      móvil/reduced): cada una demuestra el contenido que revela. ── */

/** La capa social: la ficha gira como una moneda, los contadores cuentan y la pareja se junta. */
function fxSocial(root: HTMLElement) {
  gsap.from(root.querySelector('.mkt-ficha'), {
    rotationY: -540,
    transformPerspective: 600,
    duration: 1.2,
    ease: 'power3.out',
    clearProps: 'transform',
  });
  root.querySelectorAll('[data-fx="countup"]').forEach((el, i) => countUp(el, 0.15 + i * 0.1));
  gsap.from(root.querySelectorAll('.mkt-duo .mkt-ava'), {
    x: (i) => (i === 0 ? -12 : 12),
    opacity: 0,
    duration: 0.5,
    delay: 0.35,
    ease: 'power3.out',
    clearProps: 'all',
  });
  gsap.from(root.querySelector('.lpt-badge.win'), {
    scale: 0.5,
    opacity: 0,
    duration: 0.45,
    delay: 0.55,
    ease: 'expo.out',
    clearProps: 'all',
  });
}

/** Motor competitivo: los sets voltean uno a uno (flip broadcast, como el
 *  marcador real de la app) y el delta del ganador remata. */
function fxSetsFlip(root: HTMLElement) {
  gsap.from(root.querySelectorAll('.mkt-set'), {
    rotationX: -85,
    opacity: 0,
    transformPerspective: 600,
    transformOrigin: '50% 100%',
    duration: 0.5,
    stagger: 0.12,
    ease: 'power3.out',
    clearProps: 'all',
  });
  gsap.from(root.querySelectorAll('.mkt-team__meta .mkt-delta'), {
    scale: 0.55,
    opacity: 0,
    duration: 0.4,
    delay: 0.9,
    stagger: 0.15,
    ease: 'expo.out',
    clearProps: 'all',
  });
}

/** Planificador: la semana se llena sola — oleada por columnas y ping sonar
 *  en el jueves (eco del "en juego" del hero). */
function fxWave(root: HTMLElement) {
  root.querySelectorAll('.mkt-daycol').forEach((col, c) => {
    gsap.from(col.querySelectorAll('.mkt-cell--on'), {
      opacity: 0,
      scale: 0.4,
      duration: 0.35,
      delay: c * 0.09,
      stagger: 0.05,
      ease: 'power3.out',
      clearProps: 'all',
    });
  });
  const hot = root.querySelector('.mkt-daycol--hot');
  if (hot) {
    gsap.fromTo(
      hot,
      { boxShadow: '0 0 0 0px color-mix(in oklab, var(--acc) 45%, transparent)' },
      {
        boxShadow: '0 0 0 16px color-mix(in oklab, var(--acc) 0%, transparent)',
        duration: 0.9,
        delay: 1.0,
        ease: 'power2.out',
        clearProps: 'boxShadow',
      },
    );
  }
}

/** Lanza la coreografía que corresponda al contenido de un golpe. */
function beatFx(beat: HTMLElement) {
  const social = beat.querySelector<HTMLElement>('[data-fx="social"]');
  if (social) fxSocial(social);
  const match = beat.querySelector<HTMLElement>('[data-fx="sets-flip"]');
  if (match) fxSetsFlip(match);
  const week = beat.querySelector<HTMLElement>('[data-fx="wave"]');
  if (week) fxWave(week);
}

/** LA PISTA (con motion, cualquier ancho): pinea la sección y conmuta los
 *  golpes con un timeline scrubbed; la pelota y la pista de cristal 3D leen
 *  su progreso del bus. El impacto contra el cristal (t = i/beats + 0.08)
 *  coincide con la entrada de cada golpe. En móvil el CSS compacta los golpes
 *  para que quepan en la pantalla anclada. */
/* Ventanas de cada golpe dentro de su tramo del pin (unidad = 1 golpe).
   La tarjeta entra CON el impacto (HIT_K de la pelota = 0.08) y no se va hasta
   el 0.94: meseta legible del 68% del tramo. La saliente y la entrante se
   cruzan en fundido — nunca hay pantalla sin texto (antes había ~0.5 de tramo
   en blanco entre golpe y golpe, la queja real de scroll «vacío»). */
const BEAT_IN_AT = 0.08;
const BEAT_IN_DUR = 0.18;
const BEAT_OUT_AT = 0.94;
const BEAT_OUT_DUR = 0.18;
// Centro de la meseta: el punto de reposo del snap tipo «slide».
const BEAT_REST = 0.6;

function pistaSetup() {
  const pista = document.querySelector<HTMLElement>('[data-pista]');
  if (!pista) return;
  const beats = gsap.utils.toArray<HTMLElement>('.mkt-beat', pista);
  const B = beats.length;
  LANDING_BUS.pista.beats = B;
  pista.classList.add('mkt-pista--live');
  pista.setAttribute('data-pista-beat', '0');

  const fired = new Set<number>();
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: pista,
      start: 'top top',
      end: `+=${B * 88}%`,
      pin: true,
      scrub: 0.4,
      anticipatePin: 1,
      // «Slides»: al dejar de scrollear, el pin se asienta en el golpe completo
      // más cercano (como pasar diapositivas). 0 y 1 son puntos de reposo para
      // entrar y salir del pin sin tirones hacia atrás.
      snap: {
        snapTo: [0, ...beats.map((_, i) => (i + BEAT_REST) / B), 1],
        // Al golpe más CERCANO, sin proyectar la velocidad (inertia) ni forzar
        // la dirección: es el asentamiento de un pase de diapositivas, no un
        // lanzamiento — y con scrolls programáticos (tests) no se pasa de largo.
        duration: { min: 0.2, max: 0.5 },
        delay: 0.06,
        ease: 'power1.inOut',
        inertia: false,
        directional: false,
      },
      onUpdate(self) {
        LANDING_BUS.pista.t = self.progress;
        pista.setAttribute('data-pista-beat', String(Math.min(B - 1, Math.floor(self.progress * B))));
      },
      onToggle(self) {
        LANDING_BUS.pista.active = self.isActive;
      },
    },
  });
  beats.forEach((b, i) => {
    const side = i % 2 === 0 ? 1 : -1; // la pelota golpea ese lado: la tarjeta entra desde el impacto
    tl.fromTo(
      b,
      { opacity: 0, x: side * 46, scale: 0.97 },
      {
        opacity: 1,
        x: 0,
        scale: 1,
        duration: BEAT_IN_DUR,
        ease: 'power2.out',
        onStart: () => {
          if (!fired.has(i)) {
            fired.add(i);
            beatFx(beats[i]);
          }
        },
      },
      i + BEAT_IN_AT,
    );
    // La salida invade el tramo siguiente (i+0.94 → i+1.12) y se cruza con la
    // entrada del golpe i+1 (i+1.08): fundido cruzado, sin hueco en blanco.
    if (i < B - 1) tl.to(b, { opacity: 0, x: -side * 40, duration: BEAT_OUT_DUR, ease: 'power2.in' }, i + BEAT_OUT_AT);
  });
  // relleno hasta B: el último golpe se queda en pantalla el resto del pin
  tl.to({}, { duration: 0.04 }, B - 0.04);

  // El pin cambia todas las posiciones de la página: recalcular el resto de triggers.
  ScrollTrigger.refresh();

  return () => {
    pista.classList.remove('mkt-pista--live');
    pista.removeAttribute('data-pista-beat');
    LANDING_BUS.pista.active = false;
  };
}

/** Efectos de las secciones de scroll vertical (fuera de La Pista). */
function sectionFx() {
  // Hero: el marcador está VIVO — los Elo cuentan y los ▲/▼ aparecen.
  const board = document.querySelector<HTMLElement>('[data-fx="board-live"]');
  if (board) {
    // Espera al saque de la pelota si la página se abre desde arriba.
    const delay = window.scrollY < window.innerHeight * 0.4 ? 2.4 : 0.4;
    onceInView(
      board,
      () => {
        board.querySelectorAll('.mkt-elo').forEach((el, i) => countUp(el, delay + i * 0.09));
        gsap.from(board.querySelectorAll('.mkt-delta'), {
          opacity: 0,
          y: 5,
          duration: 0.4,
          delay: delay + 0.55,
          stagger: 0.08,
          ease: 'power3.out',
          clearProps: 'all',
        });
      },
      'top 96%',
    );
  }

  // 6 · Cómo funciona: el rail se dibuja y los números 01→02→03 suben en
  // secuencia (es una secuencia real: el orden ES la información).
  const steps = document.querySelector<HTMLElement>('[data-fx="steps"]');
  if (steps) {
    onceInView(steps, () => {
      gsap.from(steps.querySelectorAll('.mkt-step__bar'), {
        scaleX: 0,
        transformOrigin: '0 50%',
        duration: 0.7,
        stagger: 0.18,
        ease: 'expo.out',
        clearProps: 'all',
      });
      gsap.from(steps.querySelectorAll('.mkt-step__n'), {
        y: 26,
        opacity: 0,
        duration: 0.55,
        stagger: 0.18,
        ease: 'power3.out',
        clearProps: 'all',
      });
    });
  }

  // 7 · Precio: «Gratis» se estampa con autoridad; el plan Pase recibe un
  // único barrido de brillo (es la línea premium).
  const stamp = document.querySelector<HTMLElement>('[data-fx="stamp"]');
  if (stamp) {
    onceInView(stamp, () =>
      gsap.from(stamp, {
        scale: 1.55,
        opacity: 0,
        rotation: -4,
        duration: 0.5,
        ease: 'expo.out',
        clearProps: 'all',
      }),
    );
  }
  const shine = document.querySelector<HTMLElement>('.mkt-shine');
  if (shine) {
    onceInView(shine.parentElement ?? shine, () =>
      gsap.fromTo(shine, { xPercent: -260 }, { xPercent: 260, duration: 1.1, delay: 0.5, ease: 'power2.inOut' }),
    );
  }
}

export function MarketingScrollFx() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      for (const el of gsap.utils.toArray<HTMLElement>('[data-parallax="expand"]')) {
        gsap.fromTo(
          el,
          { scale: 0.9, y: 30, opacity: 0.55 },
          {
            scale: 1,
            y: 0,
            opacity: 1,
            ease: 'none',
            // clamp(): los bloques pegados al final de la página (podio) también
            // completan su expansión dentro del scroll alcanzable.
            scrollTrigger: { trigger: el, start: 'clamp(top 94%)', end: 'clamp(top 48%)', scrub: 0.6 },
          },
        );
      }

      for (const el of gsap.utils.toArray<HTMLElement>('[data-parallax="drift"]')) {
        const hero = el.closest<HTMLElement>('.mkt-hero');
        gsap.to(el, {
          y: Number(el.dataset.parallaxSpeed ?? -40),
          ease: 'none',
          scrollTrigger: { trigger: hero ?? el, start: 'top top', end: 'bottom top', scrub: true },
        });
      }

      sectionFx();
    });

    // La Pista, en cualquier ancho (con reduced-motion no hay pin y los
    // golpes quedan como secciones apiladas normales).
    mm.add('(prefers-reduced-motion: no-preference)', () => pistaSetup());

    // Tilt 3D al puntero en las tarjetas clave: solo con puntero fino y hover
    // real (en táctil no existe el gesto) y sin reduced-motion.
    mm.add('(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)', () => {
      const cleanups: (() => void)[] = [];
      for (const el of gsap.utils.toArray<HTMLElement>('[data-tilt]')) {
        gsap.set(el, { transformPerspective: 900 });
        const rotX = gsap.quickTo(el, 'rotationX', { duration: 0.4, ease: 'power2.out' });
        const rotY = gsap.quickTo(el, 'rotationY', { duration: 0.4, ease: 'power2.out' });
        const onMove = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          rotY(((e.clientX - r.left) / r.width - 0.5) * 10);
          rotX(((e.clientY - r.top) / r.height - 0.5) * -8);
        };
        const onLeave = () => {
          rotX(0);
          rotY(0);
        };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerleave', onLeave);
        cleanups.push(() => {
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerleave', onLeave);
        });
      }
      return () => cleanups.forEach((fn) => fn());
    });

    return () => mm.revert();
  }, []);

  return null;
}
