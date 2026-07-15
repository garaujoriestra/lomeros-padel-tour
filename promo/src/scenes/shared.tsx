import type { CSSProperties, PropsWithChildren } from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { C } from '../theme';

/** Frame local retrasado, para escalonar entradas dentro de una escena. */
export const at = (frame: number, delay: number) => Math.max(0, frame - delay);

/** Spring de entrada estándar (sin rebote, rápido y firme). */
export const useEnter = (delay = 0, durationInFrames = 20) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: at(frame, delay),
    fps,
    config: { damping: 200 },
    durationInFrames,
  });
};

/** Spring con un punto de rebote, para elementos protagonistas (botón, ficha). */
export const usePop = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: at(frame, delay),
    fps,
    config: { damping: 12, stiffness: 160, mass: 0.6 },
  });
};

/**
 * Contenedor de escena: entra con fundido+subida y sale empujada hacia arriba
 * en sus últimos frames (si se le pasa `duration`). La última escena no sale.
 */
export const SceneShell: React.FC<
  PropsWithChildren<{ duration?: number; style?: CSSProperties }>
> = ({ duration, style, children }) => {
  const frame = useCurrentFrame();
  const enter = useEnter(0, 18);
  const exit = duration
    ? interpolate(frame, [duration - 14, duration - 2], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.in(Easing.cubic),
      })
    : 0;
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        padding: '0 84px',
        opacity: (1 - exit) * interpolate(enter, [0, 1], [0, 1]),
        transform: `translateY(${(1 - enter) * 46 - exit * 90}px)`,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Barrita lima que precede a los kickers (equivale a .mkt-tick de la landing). */
export const Tick: React.FC<{ width?: number; style?: CSSProperties }> = ({
  width = 26,
  style,
}) => (
  <span
    style={{
      display: 'inline-block',
      width,
      height: 6,
      borderRadius: 6,
      background: C.acc,
      marginRight: 16,
      verticalAlign: 'middle',
      ...style,
    }}
  />
);

/** Avatar circular con iniciales, como .mkt-ava de la landing. */
export const Ava: React.FC<{ ini: string; bg: string; size?: number }> = ({
  ini,
  bg,
  size = 72,
}) => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: bg,
      color: C.accInk,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: size * 0.36,
      letterSpacing: '0.02em',
      flexShrink: 0,
    }}
  >
    {ini}
  </span>
);

/** Chip ▲/▼ de variación de Elo, como .mkt-delta. */
export const Delta: React.FC<{ v: number; size?: number }> = ({ v, size = 34 }) => {
  const up = v >= 0;
  return (
    <span
      style={{
        color: up ? C.acc : C.loss,
        fontWeight: 700,
        fontSize: size,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {up ? '▲' : '▼'} {up ? '+' : ''}
      {v}
    </span>
  );
};
