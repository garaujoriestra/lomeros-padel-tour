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
 * nunca tapa texto. Alterna de lado según la sección, reacciona al puntero
 * y aterriza sobre el podio en el cierre.
 *
 * La pelota es procedural (sin assets): esfera de fieltro lima —el acento de
 * la marca— con ruido de lienzo como bump, y la costura blanca característica
 * construida con la curva paramétrica clásica de la pelota de tenis,
 * proyectada a la esfera y extruida como tubo.
 *
 * Salvaguardas: con prefers-reduced-motion no se monta nada; sin WebGL el
 * canvas no se renderiza (la landing 2D queda intacta). `data-progress` en el
 * wrapper expone el avance del scroll para los e2e.
 */

/** Recorrido por la página: keyframes en fracciones del viewport (x: -0.5..0.5, y: -0.5..0.5, s: escala).
 *  Regla: la pelota se aparca DETRÁS de la maqueta opaca de cada sección (profundidad)
 *  o recortada contra el borde — nunca parada bajo una columna de texto (contraste). */
const PATH: { p: number; x: number; y: number; s: number }[] = [
  { p: 0.0, x: 0.2, y: -0.04, s: 1.85 }, // hero: grande, asomando tras el marcador
  { p: 0.13, x: -0.26, y: 0.0, s: 1.1 }, // tras el panel «antes»
  { p: 0.3, x: -0.3, y: 0.0, s: 1.25 }, // tras las fichas de la capa social
  { p: 0.46, x: 0.3, y: 0.0, s: 1.25 }, // tras el marcador de partido
  { p: 0.62, x: -0.29, y: 0.0, s: 1.1 }, // tras la rejilla del planificador
  { p: 0.74, x: 0.47, y: 0.04, s: 0.85 }, // pasos: recortada al borde derecho
  { p: 0.87, x: 0.27, y: 0.0, s: 1.15 }, // tras el plan Pase de Temporada
  { p: 1.0, x: 0.0, y: -0.075, s: 0.72 }, // cierre: posada sobre el oro del podio
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

function Ball({ progress }: { progress: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const { viewport } = useThree();
  const bump = useMemo(() => makeFeltBump(), []);
  const curve = useMemo(() => seamCurve(1.0), []);
  const born = useRef<number | null>(null);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (born.current === null) born.current = t;
    const p = progress.current ?? 0;
    const k = samplePath(p);

    // En pantallas estrechas la pelota se encoge para no comerse el layout.
    const fit = THREE.MathUtils.clamp(viewport.width / 8.2, 0.55, 1);
    // Entrada: crece con un pequeño rebote elástico en el primer segundo y medio.
    const birth = THREE.MathUtils.clamp((t - born.current) / 1.4, 0, 1);
    const entry = 1 - Math.pow(2, -10 * birth) * Math.cos(birth * 4.5 * Math.PI);

    const tx = k.x * viewport.width + state.pointer.x * 0.35;
    const ty = k.y * viewport.height + state.pointer.y * 0.25 + Math.sin(t * 1.1) * 0.07;
    const ts = k.s * fit * (birth >= 1 ? 1 : entry);

    // Amortiguación: el movimiento sigue al scroll con inercia suave.
    g.position.x = THREE.MathUtils.damp(g.position.x, tx, 5, delta);
    g.position.y = THREE.MathUtils.damp(g.position.y, ty, 5, delta);
    const s = THREE.MathUtils.damp(g.scale.x, Math.max(0.0001, ts), 5, delta);
    g.scale.setScalar(s);

    // Gira a medida que bajas (5 vueltas página completa) + deriva viva constante.
    g.rotation.z = -p * Math.PI * 10;
    g.rotation.y = t * 0.3 + p * Math.PI * 2;
    g.rotation.x = Math.sin(t * 0.5) * 0.12;
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
  const progress = useRef(0);
  // Client-only (dynamic ssr:false): el inicializador perezoso corre ya en navegador.
  const [enabled] = useState(detectSupport);

  useEffect(() => {
    if (!enabled) return;
    gsap.registerPlugin(ScrollTrigger);
    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        progress.current = self.progress;
        wrap.current?.setAttribute('data-progress', self.progress.toFixed(3));
      },
    });
    return () => st.kill();
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div ref={wrap} className="mkt-ball3d" data-ball3d data-webgl={enabled.webgl ? '1' : '0'} data-progress="0" aria-hidden>
      {enabled.webgl && (
        <Canvas
          dpr={[1, 1.75]}
          camera={{ position: [0, 0, 10], fov: 40 }}
          gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        >
          <ambientLight intensity={0.65} />
          <directionalLight position={[5, 7, 6]} intensity={1.6} />
          <pointLight position={[-6, 2, -5]} intensity={16} color="#a8db27" />
          <Ball progress={progress} />
        </Canvas>
      )}
    </div>
  );
}
