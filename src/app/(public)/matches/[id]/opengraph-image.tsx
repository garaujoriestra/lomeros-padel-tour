import { ImageResponse } from 'next/og';
import { db } from '@/lib/db';
import { matches, matchSets, players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Resultado del partido';

export default async function Image({ params }: { params: { id: string } }) {
  const [match] = await db.select().from(matches).where(eq(matches.id, params.id));
  if (!match) {
    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#052e16', color: 'white', fontSize: 48, fontFamily: 'sans-serif',
        }}>
          Partido no encontrado
        </div>
      ),
      { ...size },
    );
  }

  const allPlayers = await db.select().from(players);
  const pMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const sets = match.status === 'completed'
    ? await db.select().from(matchSets).where(eq(matchSets.matchId, params.id)).then((s) => s.sort((a, b) => a.setNumber - b.setNumber))
    : [];

  const t1Sets = sets.filter((s) => s.team1Games > s.team2Games).length;
  const t2Sets = sets.filter((s) => s.team2Games > s.team1Games).length;

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #052e16 0%, #14532d 50%, #064e3b 100%)',
        color: 'white',
        padding: '60px 80px',
        fontFamily: 'sans-serif',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 28, color: '#86efac', fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 40 }}>🎾</span>
            <span>Lomeros Padel Tour</span>
          </div>
          <span style={{ color: '#bbf7d0' }}>{match.date}</span>
        </div>

        {/* Center: teams + score */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, fontSize: 44, fontWeight: 800, color: match.winnerTeam === 1 ? '#4ade80' : 'white', opacity: match.winnerTeam === 2 ? 0.5 : 1 }}>
            <span>{pMap[match.team1Player1Id]?.name ?? '?'}</span>
            <span>{pMap[match.team1Player2Id]?.name ?? '?'}</span>
            {match.winnerTeam === 1 && <span style={{ fontSize: 24, color: '#4ade80', marginTop: 8 }}>🏆 Ganador</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            {match.status === 'completed' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 110, fontWeight: 900 }}>
                  <span style={{ color: match.winnerTeam === 1 ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>{t1Sets}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 80 }}>—</span>
                  <span style={{ color: match.winnerTeam === 2 ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>{t2Sets}</span>
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 28, fontFamily: 'monospace', color: '#a7f3d0' }}>
                  {sets.map((s) => (
                    <span key={s.setNumber}>{s.team1Games}-{s.team2Games}</span>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 80, fontWeight: 900, color: '#86efac' }}>VS</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, alignItems: 'flex-end', textAlign: 'right', fontSize: 44, fontWeight: 800, color: match.winnerTeam === 2 ? '#4ade80' : 'white', opacity: match.winnerTeam === 1 ? 0.5 : 1 }}>
            <span>{pMap[match.team2Player1Id]?.name ?? '?'}</span>
            <span>{pMap[match.team2Player2Id]?.name ?? '?'}</span>
            {match.winnerTeam === 2 && <span style={{ fontSize: 24, color: '#4ade80', marginTop: 8 }}>🏆 Ganador</span>}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'center', fontSize: 24, color: '#86efac' }}>
          {match.location ? `📍 ${match.location}` : ' '}
        </div>
      </div>
    ),
    { ...size },
  );
}
