import { interpolate, useCurrentFrame, Easing } from 'remotion';
import { C, kickerStyle, displayStyle } from '../theme';
import { SceneShell, Tick, useEnter, usePop } from './shared';

/** Podio de fondo, como .mkt-podium del cierre de la landing. */
const Podium: React.FC = () => {
  const frame = useCurrentFrame();
  const bars = [
    { h: 190, delay: 30 },
    { h: 290, delay: 22 },
    { h: 140, delay: 38 },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 18,
        opacity: 0.55,
      }}
    >
      {bars.map((b, i) => {
        const h = interpolate(frame, [b.delay, b.delay + 40], [0, b.h], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.out(Easing.cubic),
        });
        return (
          <div
            key={i}
            style={{
              width: 220,
              height: h,
              background: C.surface2,
              borderTop: `8px solid ${C.acc}`,
              borderRadius: '10px 10px 0 0',
            }}
          />
        );
      })}
    </div>
  );
};

/** Escena 5 · Cierre: marca, promesa y CTA. */
export const Cta: React.FC<{ brand: string; tagline: string; url: string }> = ({
  brand,
  tagline,
  url,
}) => {
  const frame = useCurrentFrame();
  const mark = useEnter(6, 26);
  const tag = useEnter(30, 24);
  const free = useEnter(48, 24);
  const btn = usePop(66);
  const urlIn = useEnter(92, 24);
  // Pulso sutil del botón una vez asentado.
  const pulse = frame > 100 ? (Math.sin((frame - 100) / 11) + 1) / 2 : 0;
  // Zoom lentísimo de toda la escena para que el cierre respire.
  const zoom = 1 + Math.min(frame / 210, 1) * 0.025;

  return (
    <SceneShell style={{ alignItems: 'center', transform: `scale(${zoom})` }}>
      <Podium />
      <div style={{ textAlign: 'center', position: 'relative' }}>
        <div
          style={{
            opacity: mark,
            transform: `translateY(${(1 - mark) * 50}px)`,
          }}
        >
          <p style={{ ...kickerStyle, color: C.acc, marginBottom: 26 }}>
            <Tick width={34} />
            Empieza la temporada
            <Tick width={34} style={{ marginLeft: 16, marginRight: 0 }} />
          </p>
          <h1 style={{ ...displayStyle, fontSize: 148 }}>{brand}</h1>
        </div>
        <p
          style={{
            marginTop: 30,
            fontSize: 46,
            color: C.ink2,
            opacity: tag,
            transform: `translateY(${(1 - tag) * 26}px)`,
          }}
        >
          {tagline}
        </p>
        <p
          style={{
            marginTop: 18,
            fontSize: 38,
            color: C.ink3,
            opacity: free,
            transform: `translateY(${(1 - free) * 22}px)`,
          }}
        >
          Gratis para siempre. Se instala como app.
        </p>
        <div
          style={{
            marginTop: 64,
            display: 'inline-block',
            transform: `scale(${btn})`,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              background: C.acc,
              color: C.accInk,
              fontWeight: 700,
              fontSize: 48,
              padding: '32px 72px',
              borderRadius: 999,
              boxShadow: `0 0 ${34 + pulse * 26}px rgba(200, 240, 60, ${0.28 + pulse * 0.16})`,
            }}
          >
            Crea tu grupo gratis
          </span>
        </div>
        <p
          style={{
            marginTop: 44,
            fontSize: 40,
            fontWeight: 600,
            letterSpacing: '0.02em',
            color: C.ink2,
            opacity: urlIn,
          }}
        >
          {url}
        </p>
      </div>
    </SceneShell>
  );
};
