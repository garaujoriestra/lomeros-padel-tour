import { useCurrentFrame } from 'remotion';
import { C, F, kickerStyle } from '../theme';
import { SceneShell, Tick, useEnter } from './shared';

const BUBBLES = [
  { text: 'creo q ganamos 6-4 6-3?? 😅', me: false, delay: 10 },
  { text: '¿y quién va primero al final?', me: true, delay: 40 },
  { text: 'ni idea, lo tenía en una nota del móvil', me: false, delay: 70 },
];

const Bubble: React.FC<{ text: string; me: boolean; delay: number }> = ({
  text,
  me,
  delay,
}) => {
  const enter = useEnter(delay, 22);
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: me ? 'flex-end' : 'flex-start',
        opacity: enter,
        transform: `translateY(${(1 - enter) * 40}px) scale(${0.92 + enter * 0.08})`,
        transformOrigin: me ? 'right bottom' : 'left bottom',
      }}
    >
      <span
        style={{
          maxWidth: 780,
          padding: '30px 42px',
          borderRadius: 40,
          borderBottomLeftRadius: me ? 40 : 10,
          borderBottomRightRadius: me ? 10 : 40,
          background: me ? C.surface2 : C.surface,
          border: `2px solid ${me ? C.lineStrong : C.line}`,
          color: C.ink2,
          fontSize: 44,
          lineHeight: 1.35,
        }}
      >
        {text}
      </span>
    </div>
  );
};

/** Escena 1 · El caos: los resultados de la peña, perdidos en el chat. */
export const Chaos: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  return (
    <SceneShell duration={duration}>
      <p style={{ ...kickerStyle, marginBottom: 56 }}>
        <Tick />
        Tu grupo, después de cada partido
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
        {BUBBLES.map((b) => (
          <Bubble key={b.text} {...b} />
        ))}
      </div>
      <p
        style={{
          marginTop: 64,
          fontFamily: F.display,
          fontStyle: 'italic',
          fontWeight: 800,
          textTransform: 'uppercase',
          fontSize: 58,
          color: C.ink3,
          opacity: frame > 100 ? Math.min(1, (frame - 100) / 12) : 0,
        }}
      >
        Así no se lleva una liga.
      </p>
    </SceneShell>
  );
};
