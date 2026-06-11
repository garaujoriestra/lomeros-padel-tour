import Link from 'next/link';
import Image from 'next/image';
import { Calendar, MapPin } from 'lucide-react';
import { ScoreGrid, StatusPill, formatMatchDate, type LptPlayer, type ScoreSet } from '@/components/lpt/ui';

export interface MatchCardData {
  id: string;
  date: string;
  location?: string | null;
  status: string; // 'scheduled' | 'completed' | 'injury_aborted'
  winnerTeam?: number | null;
  photoUrl?: string | null;
  injuredPlayerId?: string | null;
}

interface MatchCardProps {
  match: MatchCardData;
  team1: [LptPlayer | undefined, LptPlayer | undefined];
  team2: [LptPlayer | undefined, LptPlayer | undefined];
  sets?: ScoreSet[];
  href?: string;
  /** % de victoria previsto para el equipo 1 (solo programados). */
  predictionPct?: number | null;
}

export function MatchCard({ match, team1, team2, sets = [], href, predictionPct }: MatchCardProps) {
  const isUpcoming = match.status === 'scheduled';

  const card = (
    <div className={`lpt-card ${href ? 'clickable' : ''}`} style={{ overflow: 'hidden' }}>
      {match.photoUrl && (
        <div className="ph-img" style={{ height: 84, position: 'relative' }}>
          <Image
            src={match.photoUrl}
            alt=""
            fill
            sizes="(max-width: 760px) 100vw, 520px"
            className="object-cover"
          />
        </div>
      )}
      <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
          <span className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <Calendar size={13} /> {formatMatchDate(match.date)}
          </span>
          <StatusPill status={match.status} />
        </div>
        <ScoreGrid
          team1={team1}
          team2={team2}
          sets={sets}
          winnerTeam={match.status === 'injury_aborted' ? null : match.winnerTeam}
          injuredPlayerId={match.injuredPlayerId}
          compact
        />
        {(match.location || (isUpcoming && predictionPct != null)) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
            <span className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {match.location && (
                <>
                  <MapPin size={12} /> {match.location}
                </>
              )}
            </span>
            {isUpcoming && predictionPct != null && (
              <span className="small num" style={{ fontWeight: 700, color: 'var(--acc-text)' }}>
                {predictionPct}% – {100 - predictionPct}%
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}
