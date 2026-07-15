'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Parallax de scroll de la landing (GSAP + ScrollTrigger), declarado por atributo:
 *
 * - `data-parallax="expand"`: el bloque visual se expande suavemente (0.9 → 1)
 *   ligado a la posición de scroll (scrub), mientras entra en el viewport.
 * - `data-parallax="drift"`: deriva vertical a distinta velocidad que el scroll
 *   (parallax clásico de profundidad); `data-parallax-speed` ajusta los px.
 *
 * Solo transforma (scale/translate/opacity): sin reflow ni CLS. Con
 * prefers-reduced-motion no se crea ningún tween (gsap.matchMedia) y los
 * bloques quedan estáticos, como hasta ahora.
 */
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
