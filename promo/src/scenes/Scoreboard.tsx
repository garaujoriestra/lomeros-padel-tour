import { interpolate, useCurrentFrame, Easing } from 'remotion';
import { C, F, kickerStyle, fmt } from '../theme';
import { Ava, Delta, SceneShell, useEnter } from './shared';

type Row = {
  pos: number;
  name: string;
  ini: string;
  elo: number;
  delta: number;
  ava: string;
  lead?: boolean;
};

// Mismos datos de ejemplo que la landing /padelo (no son datos reales).
const ROWS: Row[] = [
  { pos: 1, name: 'Nacho R.', ini: 'NR', elo: 1584, delta: 18, lead: true, ava: C.acc },
  { pos: 2, name: 'Bea M.', ini: 'BM', elo: 1551, delta: 7, ava: C.win },
  { pos: 3, name: 'Quique T.', ini: 'QT', elo: 1533, delta: -5, ava: 'oklch(0.72 0.14 80)' },
  { pos: 4, name: 'Silvia P.', ini: 'SP', elo: 1499, delta: -12, ava: C.ink3 },
];

const BoardRow: React.FC<{ row: Row; delay: number }> = ({ row, delay }) => {
  const frame = useCurrentFrame();
  const enter = useEnter(delay, 22);
  // El Elo "corre" hasta su valor final mientras la fila aterriza.
  const elo = Math.round(
    interpolate(frame, [delay, delay + 50], [row.elo - 46, row.elo], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }),
  );
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 28,
        padding: '30px 36px',
        borderTop: `2px solid ${C.line}`,
        background: row.lead ? 'color-mix(in oklab, #c8f03c 9%, transparent)' : 'transparent',
        boxShadow: row.lead ? `inset 6px 0 0 ${C.acc}` : 'none',
        opacity: enter,
        transform: `translateX(${(1 - enter) * 70}px)`,
      }}
    >
      <span
        style={{
          fontFamily: F.display,
          fontStyle: 'italic',
          fontWeight: 800,
          fontSize: 46,
          width: 44,
          color: row.lead ? C.acc : C.ink3,
        }}
      >
        {row.pos}
      </span>
      <Ava ini={row.ini} bg={row.ava} />
      <span style={{ fontSize: 44, fontWeight: 600, flex: 1 }}>{row.name}</span>
      <span
        style={{
          fontSize: 50,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmt(elo)}
      </span>
      <Delta v={row.delta} />
    </div>
  );
};

/** Escena 3 · El marcador: Pista Central, el ranking con dramatismo. */
export const Scoreboard: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const card = useEnter(0, 24);
  const caption = useEnter(96, 24);
  // Punto "en directo" respirando, como .mkt-live de la landing.
  const ping = (Math.sin(frame / 9) + 1) / 2;
  return (
    <SceneShell duration={duration}>
      <div
        style={{
          background: C.surface,
          border: `2px solid ${C.line}`,
          borderRadius: 28,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          opacity: card,
          transform: `translateY(${(1 - card) * 70}px) scale(${0.95 + card * 0.05})`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '34px 36px',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: C.acc,
                boxShadow: `0 0 ${10 + ping * 26}px ${4 + ping * 6}px rgba(200, 240, 60, 0.35)`,
              }}
            />
            <span style={{ ...kickerStyle, fontSize: 38, color: C.ink2 }}>
              Pista Central
            </span>
          </span>
          <span
            style={{
              fontSize: 30,
              fontWeight: 700,
              color: C.ink3,
              background: C.surface2,
              border: `2px solid ${C.line}`,
              borderRadius: 999,
              padding: '10px 26px',
            }}
          >
            Jornada 14
          </span>
        </div>
        {ROWS.map((row, i) => (
          <BoardRow key={row.pos} row={row} delay={18 + i * 13} />
        ))}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '26px 36px',
            borderTop: `2px solid ${C.line}`,
            color: C.ink3,
            fontSize: 30,
          }}
        >
          <span>+ 9 jugadores en la clasificación</span>
          <span>Ejemplo</span>
        </div>
      </div>
      <p
        style={{
          marginTop: 52,
          fontSize: 46,
          lineHeight: 1.4,
          color: C.ink2,
          opacity: caption,
          transform: `translateY(${(1 - caption) * 30}px)`,
        }}
      >
        Cada partido mueve el ranking.{' '}
        <span style={{ color: C.acc, fontWeight: 700 }}>Elo 2vs2</span> con
        historial completo.
      </p>
    </SceneShell>
  );
};
