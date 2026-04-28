import { ImageResponse } from 'next/og';
import { db } from '@/lib/db';
import { matches, matchSets, players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveCourtPositions, type PositionedPlayer } from '@/lib/og/court-positions';

function PlayerSlot({
  position,
  pos,
  pMap,
}: {
  position: 'topLeft' | 'bottomLeft' | 'topRight' | 'bottomRight';
  pos: PositionedPlayer;
  pMap: Record<string, { name: string; avatarUrl: string | null }>;
}) {
  const player = pMap[pos.playerId];
  const name = player?.name ?? '?';
  const avatarUrl = player?.avatarUrl ?? null;
  const initial = name.charAt(0).toUpperCase();

  // Quadrant offsets within the court (1080 × 440)
  // Each quadrant is 540 × 220. Center the slot within its quadrant.
  // Slot is 220 wide × 200 tall, vertically centered around y = ~110/330.
  const horizontalSide = position === 'topLeft' || position === 'bottomLeft' ? 'left' : 'right';
  const verticalSide = position === 'topLeft' || position === 'topRight' ? 'top' : 'bottom';

  const slotStyle: Record<string, string | number> = {
    position: 'absolute',
    width: 220,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  };
  // Position the slot center inside its quadrant.
  // Court is 1080 wide, each half = 540. Each quadrant center is at (540/2)=270 from its outer edge.
  // Court is 440 tall, top quadrant center = 110, bottom quadrant center = 330.
  if (horizontalSide === 'left') {
    slotStyle.left = 270 - 110; // center 220px wide slot at x=270
  } else {
    slotStyle.right = 270 - 110;
  }
  if (verticalSide === 'top') {
    slotStyle.top = 30; // small padding from top border
  } else {
    slotStyle.bottom = 30;
  }

  return (
    <div style={slotStyle}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          width={120}
          height={120}
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            objectFit: 'cover',
            border: '4px solid rgba(255,255,255,0.9)',
          }}
        />
      ) : (
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            background: 'linear-gradient(135deg, #4ade80 0%, #14532d 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 64,
            fontWeight: 900,
            border: '4px solid rgba(255,255,255,0.9)',
          }}
        >
          {initial}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            color: 'white',
            fontSize: 26,
            fontWeight: 800,
            textShadow: '0 2px 6px rgba(0,0,0,0.6)',
          }}
        >
          {name}
        </span>
        {pos.label ? (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 6,
              background: 'rgba(255,255,255,0.9)',
              color: '#052e16',
              fontSize: 15,
              fontWeight: 900,
            }}
          >
            {pos.label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Resultado del partido en pista de pádel';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [match] = await db.select().from(matches).where(eq(matches.id, id));
  if (!match) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#052e16',
            color: 'white',
            fontSize: 48,
            fontFamily: 'sans-serif',
          }}
        >
          Partido no encontrado
        </div>
      ),
      { ...size },
    );
  }

  const allPlayers = await db.select().from(players);
  const pMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const positions = resolveCourtPositions({
    team1: {
      p1Id: match.team1Player1Id,
      p2Id: match.team1Player2Id,
      p1Side: match.team1Player1Side,
      p2Side: match.team1Player2Side,
    },
    team2: {
      p1Id: match.team2Player1Id,
      p2Id: match.team2Player2Id,
      p1Side: match.team2Player1Side,
      p2Side: match.team2Player2Side,
    },
  });

  const sets =
    match.status === 'completed'
      ? await db
          .select()
          .from(matchSets)
          .where(eq(matchSets.matchId, id))
          .then((s) => s.sort((a, b) => a.setNumber - b.setNumber))
      : [];

  const scoreText =
    match.status === 'completed' && sets.length > 0
      ? sets.map((s) => `${s.team1Games}-${s.team2Games}`).join(' · ')
      : null;
  const winnerNames =
    match.status === 'completed' && match.winnerTeam === 1
      ? `${pMap[match.team1Player1Id]?.name ?? '?'} & ${pMap[match.team1Player2Id]?.name ?? '?'}`
      : match.status === 'completed' && match.winnerTeam === 2
        ? `${pMap[match.team2Player1Id]?.name ?? '?'} & ${pMap[match.team2Player2Id]?.name ?? '?'}`
        : null;
  const showVs = match.status !== 'completed';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#052e16',
          fontFamily: 'sans-serif',
          color: 'white',
        }}
      >
        {/* Header strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 80,
            padding: '0 60px',
            fontSize: 22,
            color: '#86efac',
            fontWeight: 800,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>🎾</span>
            <span>Lomeros Padel Tour</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#bbf7d0' }}>
            <span>{match.date}</span>
            {match.location ? <span>📍 {match.location}</span> : null}
          </div>
        </div>

        {/* Court area (placeholder for Tasks 7–9) */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 60px',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: 1080,
              height: 440,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #14532d 0%, #064e3b 100%)',
              border: '4px solid white',
              display: 'flex',
            }}
          >
            {/* Net (vertical line center) */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                bottom: 0,
                width: 4,
                marginLeft: -2,
                background: 'white',
              }}
            />
            {/* Service line — left half */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                width: '50%',
                top: '33%',
                height: 2,
                background: 'rgba(255,255,255,0.85)',
              }}
            />
            {/* Service line — right half */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                width: '50%',
                top: '33%',
                height: 2,
                background: 'rgba(255,255,255,0.85)',
              }}
            />
            <PlayerSlot position="topLeft" pos={positions.topLeft} pMap={pMap} />
            <PlayerSlot position="bottomLeft" pos={positions.bottomLeft} pMap={pMap} />
            <PlayerSlot position="topRight" pos={positions.topRight} pMap={pMap} />
            <PlayerSlot position="bottomRight" pos={positions.bottomRight} pMap={pMap} />
            {/* Score / VS over the net */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {showVs ? (
                <span
                  style={{
                    fontSize: 96,
                    fontWeight: 900,
                    color: 'white',
                    textShadow: '0 4px 20px rgba(0,0,0,0.7)',
                    letterSpacing: 4,
                  }}
                >
                  VS
                </span>
              ) : scoreText ? (
                <span
                  style={{
                    fontSize: 78,
                    fontWeight: 900,
                    fontFamily: 'monospace',
                    color: 'white',
                    background: 'rgba(0,0,0,0.55)',
                    padding: '12px 32px',
                    borderRadius: 16,
                    textShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    letterSpacing: 2,
                  }}
                >
                  {scoreText}
                </span>
              ) : null}
            </div>
            {/* Winner overlay — only when match is completed and a winner exists */}
            {match.status === 'completed' && match.winnerTeam === 1 ? (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: '50%',
                  background: 'rgba(74, 222, 128, 0.28)',
                  border: '6px solid #4ade80',
                  borderRadius: '12px 0 0 12px',
                  pointerEvents: 'none',
                  display: 'flex',
                }}
              />
            ) : null}
            {match.status === 'completed' && match.winnerTeam === 2 ? (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '50%',
                  background: 'rgba(74, 222, 128, 0.28)',
                  border: '6px solid #4ade80',
                  borderRadius: '0 12px 12px 0',
                  pointerEvents: 'none',
                  display: 'flex',
                }}
              />
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            height: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: winnerNames ? '#22c55e' : 'transparent',
          }}
        >
          {winnerNames ? (
            <span
              style={{
                color: '#052e16',
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 36 }}>🏆</span>
              <span>{winnerNames} ganan</span>
            </span>
          ) : null}
        </div>
      </div>
    ),
    { ...size },
  );
}
