'use client';

import { useState } from 'react';
import { Swords } from 'lucide-react';
import { MatchCard, type MatchCardData } from './match-card';
import type { LptPlayer, ScoreSet } from '@/components/lpt/ui';

export interface MatchListItem {
  match: MatchCardData;
  team1: [LptPlayer | undefined, LptPlayer | undefined];
  team2: [LptPlayer | undefined, LptPlayer | undefined];
  sets: ScoreSet[];
}

const TABS = [
  ['todos', 'Todos'],
  ['proximos', 'Próximos'],
  ['jugados', 'Jugados'],
] as const;

export function MatchesList({ items }: { items: MatchListItem[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('todos');
  // El stagger solo debe correr en la carga inicial: al cambiar de pestaña las
  // cards se re-montan y sin esto la cascada de entrada se repite en cada tap.
  const [entered, setEntered] = useState(false);

  const upcoming = items.filter((i) => i.match.status === 'scheduled');
  const played = items.filter((i) => i.match.status !== 'scheduled');
  const showUpcoming = tab !== 'jugados' ? upcoming : [];
  const showPlayed = tab !== 'proximos' ? played : [];

  const grid = (list: MatchListItem[]) => (
    <div className={entered ? 'grid-2' : 'grid-2 stagger'} style={{ marginTop: 14 }}>
      {list.map(({ match, team1, team2, sets }) => (
        <MatchCard key={match.id} match={match} team1={team1} team2={team2} sets={sets} href={`/matches/${match.id}`} />
      ))}
    </div>
  );

  return (
    <section className="section">
      <div className="sec-head">
        <h2 className="sec-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Swords size={19} strokeWidth={2.4} style={{ color: 'var(--acc-text)' }} />
          Partidos
        </h2>
        <div className="sec-rule" />
        <div className="seg">
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setEntered(true); setTab(k); }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {showUpcoming.length > 0 && (
        <>
          {tab === 'todos' && <div className="kicker" style={{ margin: '18px 0 0' }}>Programados</div>}
          {grid(showUpcoming)}
        </>
      )}
      {showPlayed.length > 0 && (
        <>
          {tab === 'todos' && <div className="kicker" style={{ margin: '24px 0 0' }}>Jugados</div>}
          {grid(showPlayed)}
        </>
      )}
      {showUpcoming.length === 0 && showPlayed.length === 0 && (
        <div className="muted" style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontSize: 40, margin: '0 0 10px' }}>🎾</p>
          <p style={{ fontWeight: 600, margin: 0 }}>Aún no hay partidos registrados</p>
        </div>
      )}
    </section>
  );
}
