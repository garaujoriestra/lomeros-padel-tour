import { interpolate, useCurrentFrame, Easing } from 'remotion';
import type { ReactNode } from 'react';
import { C, F, kickerStyle, displayStyle, fmt } from '../theme';
import { Ava, SceneShell, Tick, useEnter, usePop } from './shared';

const Tile: React.FC<{
  delay: number;
  icon: ReactNode;
  title: string;
  desc: string;
  right: ReactNode;
}> = ({ delay, icon, title, desc, right }) => {
  const enter = useEnter(delay, 24);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 32,
        background: C.surface,
        border: `2px solid ${C.line}`,
        borderRadius: 26,
        padding: '34px 38px',
        opacity: enter,
        transform: `translateX(${(1 - enter) * 90}px)`,
      }}
    >
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 42, fontWeight: 700 }}>{title}</p>
        <p style={{ margin: '8px 0 0', fontSize: 33, lineHeight: 1.35, color: C.ink3 }}>
          {desc}
        </p>
      </div>
      {right}
    </div>
  );
};

/** Ficha de La Timba: círculo lima con anillo, como .mkt-ficha. */
const Ficha: React.FC<{ delay: number }> = ({ delay }) => {
  const pop = usePop(delay);
  return (
    <span
      style={{
        width: 88,
        height: 88,
        borderRadius: '50%',
        background: C.acc,
        border: `6px solid color-mix(in oklab, ${C.acc} 55%, black)`,
        boxShadow: 'inset 0 0 0 6px color-mix(in oklab, #c8f03c 78%, white)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: C.accInk,
        fontFamily: F.display,
        fontStyle: 'italic',
        fontWeight: 800,
        fontSize: 44,
        flexShrink: 0,
        transform: `scale(${pop})`,
      }}
    >
      T
    </span>
  );
};

const Counter: React.FC<{ to: number; delay: number; color?: string }> = ({
  to,
  delay,
  color,
}) => {
  const frame = useCurrentFrame();
  const n = Math.round(
    interpolate(frame, [delay, delay + 45], [Math.max(0, to - 320), to], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }),
  );
  return (
    <span
      style={{
        fontSize: 52,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        color: color ?? C.ink,
      }}
    >
      {fmt(n)}
    </span>
  );
};

/** Escena 4 · La capa social: La Timba, logros y parejas. */
export const Social: React.FC<{ duration: number }> = ({ duration }) => {
  const badge = usePop(78);
  return (
    <SceneShell duration={duration}>
      <p style={{ ...kickerStyle, color: C.acc, marginBottom: 36 }}>
        <Tick />
        Lo que engancha
      </p>
      <h2 style={{ ...displayStyle, fontSize: 88, marginBottom: 60 }}>
        La Timba, logros
        <br />y parejas
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
        <Tile
          delay={22}
          icon={<Ficha delay={30} />}
          title="La Timba"
          desc="Porra con fichas de juego, nunca dinero real."
          right={<Counter to={1240} delay={34} color={C.acc} />}
        />
        <Tile
          delay={48}
          icon={<span style={{ fontSize: 72, flexShrink: 0 }}>🏅</span>}
          title="Racha de 5 victorias"
          desc="Logro desbloqueado por Bea M. esta jornada."
          right={
            <span
              style={{
                background: C.acc,
                color: C.accInk,
                fontWeight: 700,
                fontSize: 30,
                borderRadius: 999,
                padding: '10px 26px',
                transform: `scale(${badge})`,
              }}
            >
              Nuevo
            </span>
          }
        />
        <Tile
          delay={74}
          icon={
            <span style={{ display: 'inline-flex', flexShrink: 0 }}>
              <Ava ini="NR" bg={C.acc} size={80} />
              <span style={{ marginLeft: -26, display: 'inline-flex' }}>
                <Ava ini="BM" bg={C.win} size={80} />
              </span>
            </span>
          }
          title="Nacho & Bea"
          desc="Mejor pareja de la temporada."
          right={<Counter to={1602} delay={86} />}
        />
      </div>
    </SceneShell>
  );
};
