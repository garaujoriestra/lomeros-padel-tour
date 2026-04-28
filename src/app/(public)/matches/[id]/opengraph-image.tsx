import { ImageResponse } from 'next/og';
import { db } from '@/lib/db';
import { matches, matchSets, players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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

  const sets =
    match.status === 'completed'
      ? await db
          .select()
          .from(matchSets)
          .where(eq(matchSets.matchId, id))
          .then((s) => s.sort((a, b) => a.setNumber - b.setNumber))
      : [];

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
          </div>
        </div>

        {/* Footer strip (placeholder for Task 9) */}
        <div
          style={{
            height: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            color: '#86efac',
          }}
        >
          {' '}
        </div>
      </div>
    ),
    { ...size },
  );
}
