'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

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

/** Efectos por sección: cada handler es la coreografía propia de un data-fx. */
function sectionFx() {
  // 1 · Hero: el marcador está VIVO — los Elo cuentan y los ▲/▼ aparecen.
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

  // Contadores sueltos (fichas de La Timba, Elo de la mejor pareja).
  for (const el of gsap.utils.toArray<HTMLElement>('[data-fx="countup"]')) {
    onceInView(el, () => countUp(el));
  }

  // 3 · Capa social: la ficha gira como una moneda y la pareja se junta.
  const social = document.querySelector<HTMLElement>('[data-fx="social"]');
  if (social) {
    onceInView(social, () => {
      gsap.from(social.querySelector('.mkt-ficha'), {
        rotationY: -540,
        transformPerspective: 600,
        duration: 1.2,
        ease: 'power3.out',
        clearProps: 'transform',
      });
      gsap.from(social.querySelectorAll('.mkt-duo .mkt-ava'), {
        x: (i) => (i === 0 ? -12 : 12),
        opacity: 0,
        duration: 0.5,
        delay: 0.35,
        ease: 'power3.out',
        clearProps: 'all',
      });
      gsap.from(social.querySelector('.lpt-badge.win'), {
        scale: 0.5,
        opacity: 0,
        duration: 0.45,
        delay: 0.55,
        ease: 'expo.out',
        clearProps: 'all',
      });
    });
  }

  // 4 · Motor competitivo: los sets voltean uno a uno (flip broadcast, como
  // el marcador real de la app) y el delta del ganador remata.
  const match = document.querySelector<HTMLElement>('[data-fx="sets-flip"]');
  if (match) {
    onceInView(match, () => {
      gsap.from(match.querySelectorAll('.mkt-set'), {
        rotationX: -85,
        opacity: 0,
        transformPerspective: 600,
        transformOrigin: '50% 100%',
        duration: 0.5,
        stagger: 0.12,
        ease: 'power3.out',
        clearProps: 'all',
      });
      gsap.from(match.querySelectorAll('.mkt-team__meta .mkt-delta'), {
        scale: 0.55,
        opacity: 0,
        duration: 0.4,
        delay: 0.9,
        stagger: 0.15,
        ease: 'expo.out',
        clearProps: 'all',
      });
    });
  }

  // 5 · Planificador: la semana se llena sola — oleada de disponibilidad por
  // columnas y ping sonar en el jueves (eco del "en juego" del hero).
  const week = document.querySelector<HTMLElement>('[data-fx="wave"]');
  if (week) {
    onceInView(week, () => {
      week.querySelectorAll('.mkt-daycol').forEach((col, c) => {
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
      const hot = week.querySelector('.mkt-daycol--hot');
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
    });
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
