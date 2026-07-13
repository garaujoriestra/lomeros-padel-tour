import Link from 'next/link';
import { Trophy, Calendar, Users, CalendarCheck } from 'lucide-react';
import { Podium } from '@/components/shared/podium';
import { MatchCard } from '@/components/shared/match-card';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionHead } from '@/components/lpt/ui';
import { buildPodiumGroups } from '@/lib/rankings/podium-groups';
import { listRankedPlayers, listAllPlayersInGroup } from '@/lib/players/queries';
import { listScheduledMatches } from '@/lib/matches/queries';

// Home de grupo (lean): nombre + clasificación + próximos partidos + roster.
// NO replica el hero/eventos/feed bespoke de Lomeros.
// `basePath` para los enlaces internos.
export async function GroupHomeBody({
  groupId,
  groupName,
  basePath,
}: {
  groupId: string;
  groupName: string;
  basePath: string;
}) {
  const [topPlayers, upcoming, allPlayers] = await Promise.all([
    listRankedPlayers(groupId, 20),
    listScheduledMatches(groupId, 3),
    listAllPlayersInGroup(groupId),
  ]);

  const playerMap: Record<string, (typeof allPlayers)[number]> = {};
  for (const p of allPlayers) playerMap[p.id] = p;

  // delta=null porque no calculamos el cambio de Elo en el home de grupo
  const podiumPlayers = topPlayers.map((p) => ({ ...p, delta: null }));

  return (
    <div className="section" style={{ padding: 'calc(26px * var(--sp))' }}>
      <h1 className="display" style={{ fontSize: 'clamp(30px, 6vw, 48px)', margin: '0 0 4px' }}>
        {groupName}
      </h1>
      <p className="small muted" style={{ margin: '0 0 24px' }}>
        {allPlayers.length} {allPlayers.length === 1 ? 'jugador' : 'jugadores'}
      </p>

      <Link href={`${basePath}/planificador`} className="sec-link" style={{ marginBottom: 20 }}>
        <CalendarCheck size={16} /> Planificador semanal →
      </Link>

      {topPlayers.length >= 3 && (
        <section className="section">
          <SectionHead icon={Trophy} title="Clasificación" />
          <Podium groups={buildPodiumGroups(podiumPlayers)} />
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="section">
          <SectionHead icon={Calendar} title="Próximos partidos" />
          <div className="grid-2 stagger">
            {upcoming.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                team1={[playerMap[m.team1Player1Id], playerMap[m.team1Player2Id]]}
                team2={[playerMap[m.team2Player1Id], playerMap[m.team2Player2Id]]}
                href={`${basePath}/matches/${m.id}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* Roster siempre visible para que los jugadores del grupo sean localizables */}
      {allPlayers.length > 0 && (
        <section className="section">
          <SectionHead icon={Users} title="Jugadores" />
          <ul className="stagger" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {allPlayers.map((p) => (
              <li
                key={p.id}
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid color-mix(in oklab, currentcolor 12%, transparent)',
                }}
              >
                {p.nickname ?? p.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {allPlayers.length === 0 && (
        <EmptyState
          icon={Users}
          title="Este grupo está arrancando"
          hint="Aún no hay jugadores ni partidos. En cuanto el organizador registre el primero, aparecerán aquí la clasificación y la jornada."
        />
      )}
    </div>
  );
}
