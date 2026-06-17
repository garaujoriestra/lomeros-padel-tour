'use client';

import { useState } from 'react';
import type { BracketView as BracketViewModel, GroupView } from '@/lib/tournament/torneo-view';
import { GroupsTable } from './groups-table';
import { BracketView } from './bracket-view';
import { CrossesBand } from './crosses-band';

interface Props {
  tournamentId: string;
  groups: GroupView[];
  bracket: BracketViewModel;
  advance: number;
  editable: boolean;
  myPairIds?: string[];
}

export function TorneoBoard({ tournamentId, groups, bracket, advance, editable, myPairIds = [] }: Props) {
  const hasGroups = groups.length > 0;
  const hasBracket = bracket.rounds.length > 0;
  const [tab, setTab] = useState<'grupos' | 'cuadro'>(hasBracket ? 'cuadro' : 'grupos');

  if (!hasGroups && !hasBracket) return null;

  // single_elim: solo cuadro.
  if (!hasGroups) {
    return (
      <section className="space-y-3">
        <h2 className="kicker">Cuadro</h2>
        <BracketView tournamentId={tournamentId} bracket={bracket} editable={editable} myPairIds={myPairIds} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="seg" role="group" aria-label="Fase del torneo">
        <button className={tab === 'grupos' ? 'on' : ''} aria-pressed={tab === 'grupos'} onClick={() => setTab('grupos')}>Grupos</button>
        <button className={tab === 'cuadro' ? 'on' : ''} aria-pressed={tab === 'cuadro'} onClick={() => setTab('cuadro')} disabled={!hasBracket}>Cuadro</button>
      </div>

      {tab === 'grupos' ? (
        <div className="space-y-3">
          <h2 className="kicker">Grupos</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {groups.map((g) => (
              <GroupsTable key={g.name} tournamentId={tournamentId} group={g} advance={advance} editable={editable} myPairIds={myPairIds} />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="kicker">Cuadro</h2>
          <CrossesBand bracket={bracket} groups={groups} />
          {hasBracket
            ? <BracketView tournamentId={tournamentId} bracket={bracket} editable={editable} myPairIds={myPairIds} />
            : <p className="text-sm text-ink-3">El cuadro se formará al cerrar la fase de grupos.</p>}
        </div>
      )}
    </section>
  );
}
