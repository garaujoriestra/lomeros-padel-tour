'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Pelota de pádel 3D que recorre la landing girando a medida que se hace
 * scroll (Three.js vía react-three-fiber + ScrollTrigger). El canvas es una
 * capa fija entre el fondo de las secciones y el contenido (`z-index` en
 * globals.css): la pelota pasa POR DETRÁS de las tarjetas —profundidad— y
 * nunca tapa texto.
 *
 * Tres momentos con propósito:
 * - **Saque (cold-open)**: al cargar, la pelota cae desde fuera de pantalla,
 *   bota con squash & stretch en el hueco del hero y rueda a su sitio tras
 *   el marcador.
 * - **Rally**: la sección Antes/Después se pinea un tramo de scroll y la
 *   pelota pelotea entre los dos paneles (3 botes) hasta quedarse en
 *   «Después» — el scroll cuenta la historia.
 * - **Peloteo**: la pelota es golpeable (click/tap, hit-test por distancia en
 *   pantalla): impulso, giro y contador de toques encadenados como easter egg.
 *
 * La pelota es procedural (sin assets): esfera de fieltro lima —el acento de
 * la marca— con ruido de lienzo como bump, y la costura blanca característica
 * construida con la curva paramétrica clásica de la pelota de tenis.
 *
 * Salvaguardas: con prefers-reduced-motion no se monta nada (tampoco el pin
 * del rally); sin WebGL el canvas no se renderiza (la landing 2D queda
 * intacta). El rally solo se activa en ≥760px (en móvil los paneles apilan).
 * `data-progress`/`data-intro`/`data-ball-x/y` en el wrapper para los e2e.
 */

/** Recorrido por la página: keyframes en fracciones del viewport (x: -0.5..0.5, y: -0.5..0.5, s: escala).
 *  Regla: la pelota se aparca DETRÁS de la maqueta opaca de cada sección (profundidad)
 *  o recortada contra el borde — nunca parada bajo una columna de texto (contraste).
 *  Cada parada es una MESETA (par de keyframes iguales) centrada en el progreso real
 *  medido de su sección a 1280×800 (incluye el tramo del pin del rally): la pelota
 *  está quieta mientras la sección se lee y transita solo entre secciones. */
const PATH: { p: number; x: number; y: number; s: number }[] = [
  { p: 0.0, x: 0.2, y: -0.04, s: 1.85 }, // hero: grande, asomando tras el marcador
  { p: 0.05, x: 0.2, y: -0.04, s: 1.85 },
  { p: 0.12, x: -0.26, y: -0.12, s: 1.05 }, // bajando al rally (el rally toma el control)
  { p: 0.33, x: 0.26, y: -0.16, s: 1.05 }, // salida del rally: donde quedó, en «Después»
  { p: 0.36, x: 0.26, y: -0.16, s: 1.05 },
  { p: 0.43, x: -0.3, y: 0.0, s: 1.25 }, // tras las fichas de la capa social (centro ~0.454)
  { p: 0.48, x: -0.3, y: 0.0, s: 1.25 },
  { p: 0.52, x: 0.3, y: 0.0, s: 1.25 }, // tras el marcador de partido (centro ~0.547)
  { p: 0.57, x: 0.3, y: 0.0, s: 1.25 },
  { p: 0.605, x: -0.29, y: 0.0, s: 1.1 }, // tras la rejilla del planificador (centro ~0.631)
  { p: 0.655, x: -0.29, y: 0.0, s: 1.1 },
  { p: 0.71, x: 0.47, y: 0.04, s: 0.85 }, // pasos: recortada al borde derecho (centro ~0.735)
  { p: 0.76, x: 0.47, y: 0.04, s: 0.85 },
  { p: 0.84, x: 0.27, y: 0.0, s: 1.15 }, // tras el plan Pase de Temporada (centro ~0.866)
  { p: 0.89, x: 0.27, y: 0.0, s: 1.15 },
  { p: 0.965, x: 0.0, y: -0.075, s: 0.72 }, // cierre: posada sobre el oro del podio
  { p: 1.0, x: 0.0, y: -0.075, s: 0.72 },
];

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

/** Posición/escala interpoladas del recorrido para un progreso 0..1. */
function samplePath(p: number) {
  if (p <= PATH[0].p) return PATH[0];
  for (let i = 1; i < PATH.length; i++) {
    if (p <= PATH[i].p) {
      const a = PATH[i - 1];
      const b = PATH[i];
      const t = smoothstep((p - a.p) / (b.p - a.p));
      return { p, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: a.s + (b.s - a.s) * t };
    }
  }
  return PATH[PATH.length - 1];
}

/** Rally Antes/Después: botes de panel a panel mientras la sección está pineada.
 *  `t` es el progreso 0..1 del pin; termina posada en «Después» (derecha). */
const RALLY_FLOOR = -0.19; // altura (fracción de vh) a la que "botan" sobre los paneles
const RALLY_HITS = [
  { t: 0.1, x: -0.26 }, // primer bote: panel «Antes»
  { t: 0.4, x: 0.26 }, // «Después»
  { t: 0.7, x: -0.26 }, // «Antes»
  { t: 0.96, x: 0.26 }, // remate: se queda en «Después»
];
// Arcos bajos: los botes van a ras de los paneles (zona de la flecha), sin
// pararse nunca delante del titular ni del párrafo de la sección.
const RALLY_ARCS = [0.11, 0.085, 0.065];

function rallyPose(t: number) {
  const H = RALLY_HITS;
  let x: number;
  let y: number;
  if (t <= H[0].t) {
    const k = smoothstep(t / H[0].t);
    x = THREE.MathUtils.lerp(0.05, H[0].x, k);
    y = RALLY_FLOOR + (1 - k) * 0.2;
  } else {
    x = H[H.length - 1].x;
    y = RALLY_FLOOR;
    for (let i = 0; i < H.length - 1; i++) {
      if (t <= H[i + 1].t) {
        const k = (t - H[i].t) / (H[i + 1].t - H[i].t);
        x = THREE.MathUtils.lerp(H[i].x, H[i + 1].x, k);
        y = RALLY_FLOOR + Math.sin(Math.PI * k) * (RALLY_ARCS[i] ?? 0.14);
        break;
      }
    }
  }
  // Squash al pasar por cada impacto (campana estrecha alrededor del bote).
  let squash = 1;
  for (const h of RALLY_HITS) {
    const d = (t - h.t) / 0.022;
    squash -= 0.3 * Math.exp(-d * d);
  }
  return { x, y, squash: Math.max(0.6, squash) };
}

/** Curva clásica de la costura de la pelota de tenis, proyectada a la esfera de radio R. */
function seamCurve(R: number) {
  const a = 0.72;
  const b = 0.28;
  const c = 2 * Math.sqrt(a * b);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 220; i++) {
    const t = (i / 220) * Math.PI * 2;
    pts.push(
      new THREE.Vector3(
        a * Math.cos(t) + b * Math.cos(3 * t),
        a * Math.sin(t) - b * Math.sin(3 * t),
        c * Math.sin(2 * t),
      )
        .normalize()
        .multiplyScalar(R),
    );
  }
  return new THREE.CatmullRomCurve3(pts, true);
}

/** Ruido de lienzo: bump sutil que hace que la esfera lea como fieltro, no como plástico. */
function makeFeltBump() {
  const size = 256;
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 165 + Math.random() * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  return tex;
}

/** Canal mutable compartido entre la capa DOM (golpes, rally, intro) y el frame loop.
 *  Singleton de módulo (la landing solo monta una pelota): así ni se mutan props ni
 *  se tocan refs en render. `resetBus()` lo deja limpio en cada montaje. */
const BUS = {
  progress: 0,
  rally: { active: false, t: 0 },
  intro: { y: 0, xOff: 0, squash: 1, done: false },
  hit: { x: 0, y: 0, spin: 0, squash: 1 },
  screen: { x: -9999, y: -9999, r: 0 },
  world: { x: 0, y: 0 },
  chipEl: null as HTMLSpanElement | null,
  chipOn: false,
};

function resetBus() {
  BUS.progress = 0;
  BUS.rally = { active: false, t: 0 };
  BUS.intro = { y: 0, xOff: 0, squash: 1, done: false };
  BUS.hit = { x: 0, y: 0, spin: 0, squash: 1 };
  BUS.screen = { x: -9999, y: -9999, r: 0 };
  BUS.world = { x: 0, y: 0 };
  BUS.chipEl = null;
  BUS.chipOn = false;
}

function Ball({ wrap }: { wrap: React.RefObject<HTMLDivElement | null> }) {
  const bus = BUS;
  const group = useRef<THREE.Group>(null);
  const { viewport, size } = useThree();
  const bump = useMemo(() => makeFeltBump(), []);
  const curve = useMemo(() => seamCurve(1.0), []);
  const init = useRef(false);
  const spinAccum = useRef(0);
  const smoothS = useRef(0);
  const hover = useRef(false);
  const throttle = useRef(0);
  const rallyIdx = useRef(0);
  const rallyPanels = useRef<{ before: HTMLElement | null; after: HTMLElement | null } | null>(null);
  const v3 = useMemo(() => new THREE.Vector3(), []);

  // El cursor "pointer" sobre la pelota se restaura al desmontar.
  useEffect(() => () => {
    document.body.style.cursor = '';
  }, []);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;

    // En pantallas estrechas la pelota se encoge para no comerse el layout.
    const fit = THREE.MathUtils.clamp(viewport.width / 8.2, 0.55, 1);

    let x: number;
    let y: number;
    let s: number;
    let extraRot = 0;
    let squash = bus.intro.squash * bus.hit.squash;
    if (bus.rally.active) {
      const pose = rallyPose(bus.rally.t);
      x = pose.x;
      y = pose.y;
      s = 1.0;
      squash *= pose.squash;
      extraRot = -bus.rally.t * Math.PI * 6; // efecto extra durante el peloteo

      // El panel que recibe cada bote encaja el golpe (y el remate enciende
      // «Después»): la coreografía toca la historia, no solo la pelota.
      if (!rallyPanels.current) {
        rallyPanels.current = {
          before: document.querySelector<HTMLElement>('[data-rally] .mkt-before'),
          after: document.querySelector<HTMLElement>('[data-rally] .mkt-panel--after'),
        };
      }
      const idx = RALLY_HITS.reduce((n, h) => (bus.rally.t >= h.t ? n + 1 : n), 0);
      if (idx !== rallyIdx.current) {
        const hit = RALLY_HITS[Math.max(idx, rallyIdx.current) - 1];
        const panel = hit && (hit.x < 0 ? rallyPanels.current.before : rallyPanels.current.after);
        if (panel) {
          gsap.killTweensOf(panel);
          gsap.fromTo(panel, { y: 0 }, { y: 7, duration: 0.09, ease: 'power2.out', yoyo: true, repeat: 1, clearProps: 'y' });
          if (idx === RALLY_HITS.length && idx > rallyIdx.current) {
            gsap.fromTo(
              panel,
              { boxShadow: '0 0 0 0px color-mix(in oklab, var(--acc) 55%, transparent)' },
              { boxShadow: '0 0 0 18px color-mix(in oklab, var(--acc) 0%, transparent)', duration: 0.9, ease: 'power2.out', clearProps: 'boxShadow' },
            );
          }
        }
        rallyIdx.current = idx;
      }
    } else {
      const k = samplePath(bus.progress);
      x = k.x;
      y = k.y;
      s = k.s;
    }

    const tx = (x + bus.intro.xOff + bus.hit.x) * viewport.width + state.pointer.x * 0.35;
    const ty =
      (y + bus.intro.y + bus.hit.y) * viewport.height +
      state.pointer.y * 0.25 +
      (bus.intro.done ? Math.sin(t * 1.1) * 0.07 : 0);
    const ts = Math.max(0.0001, s * fit);

    // Amortiguación: sigue al scroll con inercia; el rally pide más nervio.
    // Durante el saque NO se amortigua: un bote necesita la esquina seca del
    // impacto y el damp la redondea (la pelota "mushy" en vez de botar).
    const lambda = bus.rally.active ? 12 : 5;
    if (!init.current || !bus.intro.done) {
      g.position.set(tx, ty, 0);
      init.current = true;
    } else {
      g.position.x = THREE.MathUtils.damp(g.position.x, tx, lambda, delta);
      g.position.y = THREE.MathUtils.damp(g.position.y, ty, lambda, delta);
    }

    // Gira a medida que bajas (5 vueltas por página) + deriva viva + golpes.
    spinAccum.current += bus.hit.spin * delta;
    g.rotation.z = -bus.progress * Math.PI * 10 + extraRot + spinAccum.current;
    g.rotation.y = t * 0.3 + bus.progress * Math.PI * 2;
    g.rotation.x = Math.sin(t * 0.5) * 0.12;

    // Squash & stretch conservando volumen (achata en Y, ensancha en X/Z).
    smoothS.current = THREE.MathUtils.damp(smoothS.current || ts, ts, 5, delta);
    const sq = THREE.MathUtils.clamp(squash, 0.55, 1.2);
    const wide = smoothS.current / Math.sqrt(sq);
    g.scale.set(wide, smoothS.current * sq, wide);

    bus.world.x = g.position.x;
    bus.world.y = g.position.y;

    // Proyección a pantalla: hit-test del golpe, cursor y chip del peloteo.
    v3.copy(g.position).project(state.camera);
    const sx = ((v3.x + 1) / 2) * size.width;
    const sy = ((1 - v3.y) / 2) * size.height;
    const r = smoothS.current * (size.height / viewport.height);
    bus.screen.x = sx;
    bus.screen.y = sy;
    bus.screen.r = r;

    const px = ((state.pointer.x + 1) / 2) * size.width;
    const py = ((1 - state.pointer.y) / 2) * size.height;
    const hov = (px - sx) ** 2 + (py - sy) ** 2 <= (r * 1.1) ** 2;
    if (hov !== hover.current) {
      hover.current = hov;
      document.body.style.cursor = hov ? 'pointer' : '';
    }

    if (bus.chipEl && bus.chipOn) {
      bus.chipEl.style.left = `${Math.round(sx + r * 0.55)}px`;
      bus.chipEl.style.top = `${Math.round(sy - r * 1.45)}px`;
    }

    // Coordenadas para los e2e (throttle: no es para animar).
    throttle.current += delta;
    if (throttle.current > 0.15 && wrap.current) {
      throttle.current = 0;
      wrap.current.setAttribute('data-ball-x', String(Math.round(sx)));
      wrap.current.setAttribute('data-ball-y', String(Math.round(sy)));
      wrap.current.setAttribute('data-ball-r', String(Math.round(r)));
    }
  });

  return (
    <group ref={group} scale={0.0001}>
      <mesh>
        <sphereGeometry args={[1, 56, 56]} />
        <meshStandardMaterial
          color="#c3e63a"
          roughness={0.92}
          metalness={0}
          bumpMap={bump ?? undefined}
          bumpScale={0.6}
        />
      </mesh>
      <mesh>
        <tubeGeometry args={[curve, 240, 0.045, 8, true]} />
        <meshStandardMaterial color="#f3f6e4" roughness={0.55} metalness={0} />
      </mesh>
    </group>
  );
}

/** Confeti al aterrizar en el podio: chips 3D en los colores de la pelota que
 *  estallan desde su posición cuando el scroll llega al final (una vez por
 *  llegada, con enfriamiento). Celebración = el lenguaje de marca de La Timba. */
const CONFETTI_COLORS = ['#c8f03c', '#f3f6e4', '#7ea832'];
const CONFETTI_N = 24;

function Confetti() {
  const group = useRef<THREE.Group>(null);
  const parts = useRef<{ vel: THREE.Vector3; rotV: THREE.Vector3; life: number }[]>([]);
  const prevP = useRef(0);
  const lastBurst = useRef(-10);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;

    if (BUS.progress >= 0.985 && prevP.current < 0.985 && t - lastBurst.current > 3) {
      lastBurst.current = t;
      parts.current = g.children.map((m, i) => {
        const a = (i / g.children.length) * Math.PI * 2;
        m.position.set(BUS.world.x, BUS.world.y, 0.5);
        m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        m.visible = true;
        return {
          vel: new THREE.Vector3(Math.sin(a) * (0.8 + Math.random() * 2.2), 2.4 + Math.random() * 3, (Math.random() - 0.5) * 1.6),
          rotV: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
          life: 1,
        };
      });
    }
    prevP.current = BUS.progress;

    g.children.forEach((m, i) => {
      const p = parts.current[i];
      if (!p || p.life <= 0) {
        m.visible = false;
        return;
      }
      p.life -= delta / 1.5;
      p.vel.y -= 7 * delta;
      m.position.addScaledVector(p.vel, delta);
      m.rotation.x += p.rotV.x * delta;
      m.rotation.y += p.rotV.y * delta;
      m.rotation.z += p.rotV.z * delta;
      m.scale.setScalar(Math.max(0.0001, p.life) * 0.11);
      m.visible = p.life > 0;
    });
  });

  return (
    <group ref={group}>
      {Array.from({ length: CONFETTI_N }, (_, i) => (
        <mesh key={i} visible={false}>
          <boxGeometry args={[1, 1, 0.25]} />
          <meshBasicMaterial color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]} />
        </mesh>
      ))}
    </group>
  );
}

/** Soporte en este dispositivo: null = no montar nada (SSR o reduced-motion). */
function detectSupport(): { webgl: boolean } | null {
  if (typeof window === 'undefined') return null;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  try {
    const c = document.createElement('canvas');
    return { webgl: Boolean(c.getContext('webgl2') ?? c.getContext('webgl')) };
  } catch {
    return { webgl: false };
  }
}

export default function PadelBall3D() {
  const wrap = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLSpanElement>(null);
  // Client-only (dynamic ssr:false): el inicializador perezoso corre ya en navegador.
  const [enabled] = useState(detectSupport);

  useEffect(() => {
    if (!enabled) return;
    resetBus();
    const b = BUS;
    b.chipEl = chip.current;
    gsap.registerPlugin(ScrollTrigger);

    // Progreso global de la página (mueve el recorrido y el giro).
    const progressST = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        b.progress = self.progress;
        wrap.current?.setAttribute('data-progress', self.progress.toFixed(3));
      },
    });

    // Rally: pinea la sección Antes/Después un tramo y pelotea entre paneles.
    // Solo en ≥760px (en móvil los paneles apilan y no hay "lados").
    let rallyST: ScrollTrigger | undefined;
    const rallyEl = document.querySelector<HTMLElement>('[data-rally]');
    if (rallyEl && window.matchMedia('(min-width: 760px)').matches) {
      rallyST = ScrollTrigger.create({
        trigger: rallyEl,
        start: 'top 10%',
        end: '+=130%',
        pin: true,
        anticipatePin: 1,
        onUpdate: (self) => {
          b.rally.t = self.progress;
        },
        onToggle: (self) => {
          b.rally.active = self.isActive;
        },
      });
    }
    // El pin cambia las posiciones de todo lo que hay debajo: recalcular los
    // triggers ya creados (los expand de scroll-fx se montaron antes que esto).
    ScrollTrigger.refresh();

    // Saque (cold-open): cae desde fuera, bota con squash y rueda a su sitio.
    // Si la página ya está scrolleada (recarga a mitad), no hay saque.
    const io = b.intro;
    let introTl: gsap.core.Timeline | undefined;
    const markIntroDone = () => {
      io.done = true;
      wrap.current?.setAttribute('data-intro', 'done');
    };
    if (window.scrollY < window.innerHeight * 0.4) {
      io.y = 1.25;
      io.xOff = -0.155; // cae en el hueco entre el relato y el marcador
      // Física de bote de verdad (posiciones absolutas en el timeline):
      // estirón vertical en la caída, aplaste seco EN el contacto, despegue
      // durante la recuperación y duraciones de bote que escalan con √altura.
      introTl = gsap
        .timeline({ delay: 0.15, onComplete: markIntroDone })
        .to(io, { squash: 1.12, duration: 0.3, ease: 'power1.in' }, 0)
        .to(io, { y: 0, duration: 0.5, ease: 'power2.in' }, 0)
        // impacto 1
        .to(io, { squash: 0.6, duration: 0.055, ease: 'power2.out' }, 0.5)
        .to(io, { squash: 1.06, duration: 0.1, ease: 'power2.in' }, 0.555)
        .to(io, { y: 0.3, duration: 0.28, ease: 'power2.out' }, 0.56)
        .to(io, { squash: 1, duration: 0.15 }, 0.66)
        .to(io, { y: 0, duration: 0.28, ease: 'power2.in' }, 0.84)
        // impacto 2
        .to(io, { squash: 0.75, duration: 0.05, ease: 'power2.out' }, 1.12)
        .to(io, { squash: 1.03, duration: 0.08, ease: 'power2.in' }, 1.17)
        .to(io, { y: 0.09, duration: 0.15, ease: 'power2.out' }, 1.18)
        .to(io, { squash: 1, duration: 0.1 }, 1.25)
        .to(io, { y: 0, duration: 0.15, ease: 'power2.in' }, 1.33)
        // impacto 3: mínimo, y asentado
        .to(io, { squash: 0.9, duration: 0.045 }, 1.48)
        .to(io, { squash: 1, duration: 0.12 }, 1.525)
        .to(io, { y: 0.025, duration: 0.09, ease: 'power2.out' }, 1.53)
        .to(io, { y: 0, duration: 0.09, ease: 'power2.in' }, 1.62)
        // rueda a su sitio tras el marcador
        .to(io, { xOff: 0, duration: 0.65, ease: 'power2.inOut' }, 1.6);
    } else {
      markIntroDone();
    }

    // Peloteo: golpe por proximidad en pantalla (funciona aunque la pelota
    // esté detrás de una tarjeta; no bloquea ningún enlace: no hay overlay).
    let combo = 0;
    let lastHit = 0;
    let hideCall: gsap.core.Tween | undefined;
    const onPointerDown = (e: PointerEvent) => {
      const s = b.screen;
      if (!s.r) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (dx * dx + dy * dy > (s.r * 1.15) ** 2) return;

      const now = performance.now();
      combo = now - lastHit < 2000 ? combo + 1 : 1;
      lastHit = now;

      // Impulso: bote corto, empujón contrario al lado del golpe y giro extra.
      gsap.killTweensOf(b.hit);
      b.hit.squash = 0.62;
      b.hit.spin = (dx >= 0 ? -1 : 1) * (7 + Math.min(combo, 8));
      gsap.to(b.hit, { squash: 1, duration: 0.55, ease: 'elastic.out(1.2, 0.4)' });
      gsap.to(b.hit, { spin: 0, duration: 1.1, ease: 'power2.out' });
      gsap
        .timeline()
        .to(b.hit, { y: 0.08, x: (dx >= 0 ? -1 : 1) * 0.03, duration: 0.16, ease: 'power2.out' })
        .to(b.hit, { y: 0, x: 0, duration: 0.34, ease: 'power2.in' });

      // Contador de peloteo junto a la pelota.
      const el = chip.current;
      if (el) {
        el.textContent = `Peloteo ×${combo}`;
        b.chipOn = true;
        gsap.fromTo(el, { scale: 0.6 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(3)' });
        hideCall?.kill();
        hideCall = gsap.to(el, {
          opacity: 0,
          duration: 0.3,
          delay: 1.8,
          onComplete: () => {
            b.chipOn = false;
          },
        });
      }
    };
    window.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      introTl?.kill();
      hideCall?.kill();
      gsap.killTweensOf(b.hit);
      rallyST?.kill();
      progressST.kill();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={wrap}
      className="mkt-ball3d"
      data-ball3d
      data-webgl={enabled.webgl ? '1' : '0'}
      data-progress="0"
      data-intro="pending"
      aria-hidden
    >
      {enabled.webgl && (
        <Canvas
          dpr={[1, 1.75]}
          camera={{ position: [0, 0, 10], fov: 40 }}
          gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        >
          <ambientLight intensity={0.65} />
          <directionalLight position={[5, 7, 6]} intensity={1.6} />
          <pointLight position={[-6, 2, -5]} intensity={16} color="#a8db27" />
          <Ball wrap={wrap} />
          <Confetti />
        </Canvas>
      )}
      <span ref={chip} className="mkt-peloteo num" />
    </div>
  );
}
