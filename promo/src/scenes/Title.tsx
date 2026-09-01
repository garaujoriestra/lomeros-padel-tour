import { C, kickerStyle, displayStyle } from '../theme';
import { SceneShell, Tick, useEnter } from './shared';

const Line: React.FC<{ text: string; delay: number; color?: string }> = ({
  text,
  delay,
  color,
}) => {
  const enter = useEnter(delay, 24);
  return (
    <div style={{ overflow: 'hidden', paddingBottom: 8 }}>
      <div
        style={{
          ...displayStyle,
          fontSize: 148,
          color: color ?? C.ink,
          transform: `translateY(${(1 - enter) * 110}%)`,
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Escena 2 · La promesa: tu peña merece una liga. */
export const Title: React.FC<{ duration: number }> = ({ duration }) => {
  const sub = useEnter(46, 24);
  return (
    <SceneShell duration={duration}>
      <p style={{ ...kickerStyle, color: C.acc, marginBottom: 44 }}>
        <Tick />
        El ranking oficial de tu peña
      </p>
      <h1 style={{ margin: 0 }}>
        <Line text="Tu peña" delay={8} />
        <Line text="merece" delay={16} />
        <Line text="una liga" delay={24} color={C.acc} />
      </h1>
      <p
        style={{
          marginTop: 48,
          fontSize: 46,
          lineHeight: 1.4,
          color: C.ink2,
          maxWidth: 820,
          opacity: sub,
          transform: `translateY(${(1 - sub) * 30}px)`,
        }}
      >
        Ranking Elo 2vs2, apuestas con fichas, torneos y logros. Como una
        retransmisión de verdad.
      </p>
    </SceneShell>
  );
};
