'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { LANDING_BUS as BUS, resetLandingBus } from './landing-bus';

/**
 * Pelota de pádel 3D + LA PISTA DE CRISTAL (Three.js vía react-three-fiber).
 * El canvas es una capa fija entre el fondo de las secciones y el contenido
 * (`z-index` en globals.css): todo pasa POR DETRÁS de las tarjetas y nunca
 * tapa texto.
 *
 * Momentos:
 * - **Saque (cold-open)**: al cargar, la pelota cae desde fuera de pantalla,
 *   bota con física real y rueda a su sitio tras el marcador.
 * - **La Pista**: mientras la sección [data-pista] está pineada (scroll-fx),
 *   aparece una pista de pádel — suelo con líneas, cristales con marcos y red
 *   en medio — y cada tramo de scroll es un vuelo de la pelota sobre la red
 *   hasta estrellarse contra el cristal: onda expansiva en el vidrio y el
 *   siguiente golpe (funcionalidad) entra desde el impacto.
 * - **Peloteo**: la pelota es golpeable (hit-test por distancia en pantalla)
 *   con contador de toques.
 * - **Confeti** al aterrizar en el podio del cierre.
 *
 * La pelota y la pista son procedurales (sin assets). Con
 * prefers-reduced-motion no se monta nada; sin WebGL el canvas no se
 * renderiza. `data-progress`/`data-intro`/`data-ball-x/y` para los e2e.
 */

/** Recorrido por la página FUERA de la pista: keyframes en fracciones del
 *  viewport (x: -0.5..0.5, y: -0.5..0.5, s: escala), con MESETAS por sección.
 *  Durante el pin de la pista manda pistaPose(). */
const PATH: { p: number; x: number; y: number; s: number }[] = [
  { p: 0.0, x: 0.2, y: -0.04, s: 1.85 }, // hero: grande, asomando tras el marcador
  { p: 0.045, x: 0.2, y: -0.04, s: 1.85 },
  { p: 0.765, x: 0.47, y: 0.04, s: 0.85 }, // pasos: recortada al borde derecho (centro ~0.788)
  { p: 0.81, x: 0.47, y: 0.04, s: 0.85 },
  { p: 0.87, x: 0.27, y: 0.0, s: 1.15 }, // tras el plan Pase de Temporada (centro ~0.893)
  { p: 0.915, x: 0.27, y: 0.0, s: 1.15 },
  { p: 0.985, x: 0.0, y: -0.075, s: 0.72 }, // cierre: posada sobre el oro del podio
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

/* ── La Pista: geometría del vuelo ──
   El impacto contra el cristal del golpe i ocurre en t = (i + HIT_K)/beats;
   scroll-fx mete la tarjeta i justo después (i + 0.1). La pelota queda junto
   al cristal mientras el golpe se lee y despega en FLY_K hacia el otro lado,
   cruzando por encima de la red. */
const HIT_K = 0.08;
const FLY_K = 0.72;
const HIT_Y = -0.19;
const PARK_Y = -0.16;
const APEX_Y = 0.1; // fracción de vh del ápice: por encima de la red

/** Geometría horizontal de la pista según el ancho real: en móvil los
 *  cristales se cierran para que el vidrio siga DENTRO de la pantalla. */
function courtDims(screenW: number) {
  return screenW < 900
    ? { wallX: 0.36, parkX: 0.3 } // fracciones de vw del impacto / aparcamiento
    : { wallX: 0.435, parkX: 0.37 };
}

// Golpes pares → cristal DERECHO: así la pelota queda detrás de la maqueta
// opaca de cada golpe (después-panel, fichas, partido, rejilla), nunca bajo texto.
const pistaSide = (i: number) => (i % 2 === 0 ? 1 : -1);

function pistaPose(t: number, beats: number, WALL_X: number, PARK_X: number) {
  const u = THREE.MathUtils.clamp(t * beats, 0, beats - 1e-4);
  const i = Math.floor(u);
  const k = u - i;
  const flyLen = HIT_K + 1 - FLY_K;
  if (k < HIT_K) {
    // Tramo final del vuelo que viene del golpe anterior (o la entrada inicial).
    if (i === 0) {
      const w = smoothstep(k / HIT_K);
      return { x: THREE.MathUtils.lerp(0.12, pistaSide(0) * WALL_X, w), y: THREE.MathUtils.lerp(0.3, HIT_Y, w) };
    }
    const w = (k + 1 - FLY_K) / flyLen;
    return {
      x: THREE.MathUtils.lerp(pistaSide(i - 1) * PARK_X, pistaSide(i) * WALL_X, w),
      y: THREE.MathUtils.lerp(PARK_Y, HIT_Y, w) + Math.sin(Math.PI * w) * (APEX_Y - PARK_Y),
    };
  }
  if (k < FLY_K || i === beats - 1) {
    // Aparcada junto al cristal que acaba de golpear, mientras se lee el golpe.
    return { x: pistaSide(i) * PARK_X, y: PARK_Y };
  }
  // Despega hacia el cristal del golpe siguiente.
  const w = (k - FLY_K) / flyLen;
  return {
    x: THREE.MathUtils.lerp(pistaSide(i) * PARK_X, pistaSide(i + 1) * WALL_X, w),
    y: THREE.MathUtils.lerp(PARK_Y, HIT_Y, w) + Math.sin(Math.PI * w) * (APEX_Y - PARK_Y),
  };
}

/** Nº de impactos ya cruzados para un u = t·beats (impactos en i + HIT_K). */
const hitsPassed = (u: number) => Math.max(0, Math.floor(u - HIT_K) + 1);

/** Cola de impactos contra el cristal (Ball la llena, Court la consume). */
const IMPACTS: { x: number; y: number; side: number }[] = [];
/** Aplaste horizontal del impacto contra el cristal (lo anima gsap). */
const WALL_SQ = { v: 1 };

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
  const hitCount = useRef(0);
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
    const squash = bus.intro.squash * bus.hit.squash;
    if (bus.pista.active) {
      const { wallX, parkX } = courtDims(size.width);
      const pose = pistaPose(bus.pista.t, bus.pista.beats, wallX, parkX);
      x = pose.x;
      y = pose.y;
      s = 0.8;
      extraRot = -bus.pista.t * Math.PI * 8; // efecto del peloteo

      // Impacto contra el cristal: onda en el vidrio + aplaste horizontal.
      const u = bus.pista.t * bus.pista.beats;
      const n = hitsPassed(u);
      if (n !== hitCount.current) {
        const idx = Math.max(n, hitCount.current) - 1; // impacto cruzado (en cualquier dirección)
        const side = pistaSide(idx);
        IMPACTS.push({ x: side * wallX * viewport.width, y: HIT_Y * viewport.height, side });
        gsap.killTweensOf(WALL_SQ);
        WALL_SQ.v = 0.52;
        gsap.to(WALL_SQ, { v: 1, duration: 0.55, ease: 'elastic.out(1.1, 0.42)' });
        hitCount.current = n;
      }
    } else {
      const k = samplePath(bus.progress);
      x = k.x;
      y = k.y;
      s = k.s;
      // Móvil (una columna): el aparcamiento del hero baja hasta el marcador
      // para no quedar sobre el párrafo (calibrado a dos columnas en desktop).
      if (size.width < 900 && bus.progress < 0.05) {
        x = 0.42;
        y = -0.28;
      }
    }

    const tx = (x + bus.intro.xOff + bus.hit.x) * viewport.width + state.pointer.x * 0.35;
    const ty =
      (y + bus.intro.y + bus.hit.y) * viewport.height +
      state.pointer.y * 0.25 +
      (bus.intro.done ? Math.sin(t * 1.1) * 0.07 : 0);
    const ts = Math.max(0.0001, s * fit);

    // Amortiguación: sigue al scroll con inercia; la pista pide más nervio.
    // Durante el saque NO se amortigua: un bote necesita la esquina seca del
    // impacto y el damp la redondea (la pelota "mushy" en vez de botar).
    const lambda = bus.pista.active ? 12 : 5;
    if (!init.current || !bus.intro.done) {
      g.position.set(tx, ty, 0);
      init.current = true;
    } else {
      g.position.x = THREE.MathUtils.damp(g.position.x, tx, lambda, delta);
      g.position.y = THREE.MathUtils.damp(g.position.y, ty, lambda, delta);
    }

    // Gira a medida que bajas + deriva viva + golpes del usuario.
    spinAccum.current += bus.hit.spin * delta;
    g.rotation.z = -bus.progress * Math.PI * 10 + extraRot + spinAccum.current;
    g.rotation.y = t * 0.3 + bus.progress * Math.PI * 2;
    g.rotation.x = Math.sin(t * 0.5) * 0.12;

    // Squash & stretch conservando volumen: vertical (botes/saque) por `squash`
    // y horizontal (impacto contra el cristal) por WALL_SQ.
    smoothS.current = THREE.MathUtils.damp(smoothS.current || ts, ts, 5, delta);
    const sq = THREE.MathUtils.clamp(squash, 0.55, 1.2);
    const wsq = THREE.MathUtils.clamp(WALL_SQ.v, 0.45, 1);
    const wide = smoothS.current / Math.sqrt(sq);
    g.scale.set(wide * wsq, (smoothS.current * sq) / Math.sqrt(wsq), wide);

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

/* ── La pista de cristal ──
   Suelo con líneas pintadas, cristales laterales y de fondo con marcos y
   junta de paneles, y la red en medio. Aparece en fundido mientras la sección
   [data-pista] está pineada y consume la cola de impactos (ondas en el vidrio). */

function makeFloorTexture() {
  const cnv = document.createElement('canvas');
  cnv.width = 1024;
  cnv.height = 512;
  const ctx = cnv.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#1c484c';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = 'rgba(230, 245, 235, 0.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(26, 26, 1024 - 52, 512 - 52);
  // línea de red (centro) + líneas de saque + línea central de saque
  ctx.beginPath();
  ctx.moveTo(512, 26);
  ctx.lineTo(512, 486);
  ctx.moveTo(226, 26);
  ctx.lineTo(226, 486);
  ctx.moveTo(798, 26);
  ctx.lineTo(798, 486);
  ctx.moveTo(226, 256);
  ctx.lineTo(798, 256);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace; // sin esto, three lo trata como lineal y aclara el color
  return tex;
}

function makeNetTexture() {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 128;
  const ctx = cnv.getContext('2d');
  if (!ctx) return null;
  ctx.strokeStyle = 'rgba(215, 232, 222, 0.85)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 128; i += 10) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 1.6);
  return tex;
}

function makeGlassTexture() {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 256;
  const ctx = cnv.getContext('2d');
  if (!ctx) return null;
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0.03)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cnv);
}

const COURT_BASE_OPACITY = { glass: 0.14, frame: 0.95, floor: 0.96, net: 0.6, band: 0.85 };
const RING_N = 4;

type CourtMats = Record<keyof typeof COURT_BASE_OPACITY, THREE.MeshBasicMaterial> & {
  ring: THREE.MeshBasicMaterial;
};

/** Aplica el fundido de la pista a sus materiales (fuera del componente:
 *  react-hooks/immutability no permite mutar valores de hooks en useFrame). */
function fadeCourtMats(mats: CourtMats, f: number) {
  for (const key of Object.keys(COURT_BASE_OPACITY) as (keyof typeof COURT_BASE_OPACITY)[]) {
    mats[key].opacity = COURT_BASE_OPACITY[key] * f;
  }
}

function Court() {
  const group = useRef<THREE.Group>(null);
  const { viewport, size } = useThree();
  const fade = useRef(0);
  const ringLife = useRef<number[]>(Array.from({ length: RING_N }, () => 0));
  const rings = useRef<(THREE.Mesh | null)[]>([]);

  // Dimensiones desde el viewport (reactivo a resize) — antes del frame loop,
  // que las captura por cierre.
  const vw = viewport.width;
  const vh = viewport.height;
  const { wallX } = courtDims(size.width);
  const ballR = 0.8 * THREE.MathUtils.clamp(vw / 8.2, 0.55, 1);
  const glassX = wallX * vw + ballR + 0.14; // el vidrio, justo por fuera del punto de impacto
  const floorY = -0.315 * vh;
  const wallH = 0.62 * vh;
  const depth = 8.4;
  const zMid = -1.9;
  const netH = 0.16 * vh;
  const postZ = [-5.9, -3.25, -0.6, 2.1];

  const floorTex = useMemo(() => makeFloorTexture(), []);
  const netTex = useMemo(() => makeNetTexture(), []);
  const glassTex = useMemo(() => makeGlassTexture(), []);

  const mats = useMemo(
    () => ({
      glass: new THREE.MeshBasicMaterial({
        map: glassTex ?? undefined,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      frame: new THREE.MeshBasicMaterial({ color: '#0e2122', transparent: true, opacity: 0 }),
      floor: new THREE.MeshBasicMaterial({ map: floorTex ?? undefined, transparent: true, opacity: 0 }),
      net: new THREE.MeshBasicMaterial({
        map: netTex ?? undefined,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      band: new THREE.MeshBasicMaterial({ color: '#e8f4ec', transparent: true, opacity: 0 }),
      ring: new THREE.MeshBasicMaterial({
        color: '#dcff7a',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    }),
    [floorTex, netTex, glassTex],
  );

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    fade.current = THREE.MathUtils.damp(fade.current, BUS.pista.active ? 1 : 0, 4, delta);
    const f = fade.current;
    g.visible = f > 0.02;
    fadeCourtMats(mats, f);

    // Ondas de impacto en el cristal.
    while (IMPACTS.length) {
      const imp = IMPACTS.shift()!;
      const slot = ringLife.current.findIndex((l) => l <= 0);
      const idx = slot === -1 ? 0 : slot;
      const mesh = rings.current[idx];
      if (mesh) {
        mesh.position.set(imp.x + imp.side * (ballR + 0.1), imp.y, 0);
        mesh.rotation.set(0, imp.side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
        ringLife.current[idx] = 1;
      }
    }
    rings.current.forEach((mesh, i) => {
      if (!mesh) return;
      const life = ringLife.current[i];
      if (life <= 0) {
        mesh.visible = false;
        return;
      }
      ringLife.current[i] = life - delta / 0.6;
      const grow = 1 - life;
      mesh.visible = true;
      mesh.scale.setScalar(0.7 + grow * 2.6);
      (mesh.material as THREE.MeshBasicMaterial).opacity = life * 0.8 * Math.max(f, 0.4);
    });
  });

  return (
    <group ref={group} visible={false}>
      {/* suelo con líneas */}
      <mesh position={[0, floorY, zMid]} rotation={[-Math.PI / 2, 0, 0]} material={mats.floor}>
        <planeGeometry args={[glassX * 2 + 1.4, depth]} />
      </mesh>
      {/* cristales laterales con marcos */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * glassX, floorY + wallH / 2, zMid]} rotation={[0, (side * -Math.PI) / 2, 0]} material={mats.glass}>
            <planeGeometry args={[depth, wallH]} />
          </mesh>
          {postZ.map((z) => (
            <mesh key={z} position={[side * glassX, floorY + wallH / 2, z]} material={mats.frame}>
              <boxGeometry args={[0.09, wallH, 0.09]} />
            </mesh>
          ))}
          <mesh position={[side * glassX, floorY + wallH, zMid]} material={mats.frame}>
            <boxGeometry args={[0.09, 0.09, depth]} />
          </mesh>
        </group>
      ))}
      {/* cristal del fondo */}
      <mesh position={[0, floorY + wallH / 2, zMid - depth / 2 - 0.2]} material={mats.glass}>
        <planeGeometry args={[glassX * 2, wallH]} />
      </mesh>
      <mesh position={[0, floorY + wallH, zMid - depth / 2 - 0.2]} material={mats.frame}>
        <boxGeometry args={[glassX * 2, 0.09, 0.09]} />
      </mesh>
      {/* la red, en medio */}
      <mesh position={[0, floorY + netH / 2, zMid]} rotation={[0, Math.PI / 2, 0]} material={mats.net}>
        <planeGeometry args={[depth, netH]} />
      </mesh>
      <mesh position={[0, floorY + netH, zMid]} material={mats.band}>
        <boxGeometry args={[0.05, 0.07, depth]} />
      </mesh>
      {/* ondas de impacto (pool) */}
      {Array.from({ length: RING_N }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            rings.current[i] = m;
          }}
          visible={false}
          material={mats.ring}
        >
          <ringGeometry args={[0.42, 0.55, 40]} />
        </mesh>
      ))}
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

    if (BUS.progress >= 0.99 && prevP.current < 0.99 && t - lastBurst.current > 3) {
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
    resetLandingBus();
    const b = BUS;
    b.chipEl = chip.current;
    gsap.registerPlugin(ScrollTrigger);

    // Progreso global de la página (mueve el recorrido y el giro). El pin de
    // la pista lo crea scroll-fx; aquí solo se lee su estado del bus.
    const progressST = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        b.progress = self.progress;
        wrap.current?.setAttribute('data-progress', self.progress.toFixed(3));
      },
    });

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
      gsap.killTweensOf(WALL_SQ);
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
          <Court />
          <Ball wrap={wrap} />
          <Confetti />
        </Canvas>
      )}
      <span ref={chip} className="mkt-peloteo num" />
    </div>
  );
}
