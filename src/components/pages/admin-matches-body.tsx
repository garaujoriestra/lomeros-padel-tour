import { listMatchesByDate, listMatchSetsInGroup } from '@/lib/matches/queries';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import Link from 'next/link';
import { Calendar, MapPin, Plus, RectangleVertical, ClipboardPen, Pencil } from 'lucide-react';
import { ScoreGrid, StatusPill, formatMatchDate } from '@/components/lpt/ui';
import { DeleteMatchButton } from '@/app/admin/matches/delete-match-button';
import type { PageContext } from '@/lib/auth/page-context';

const smallBtn = { minHeight: 38, padding: '7px 13px', fontSize: 12.5 } as const;

// Cuerpo compartido de /admin/matches (raíz) y /g/[slug]/admin/matches.
// Bajo grupo: nuevo partido y resultado ya viven en /g/[slug]/admin/matches/...
// (Task 11); "Lados" y "Editar" también, con basePath (Task 9, paridad 2b).
// El borrado funciona vía API group-aware con ?g= explícito.
export async function AdminMatchesBody({ ctx }: { ctx: PageContext }) {
  const { groupId, basePath } = ctx;
  const isRoot = basePath === '';
  const gSlug = isRoot ? undefined : ctx.group.slug;
  const allMatches = await listMatchesByDate(groupId);
  const allSets = await listMatchSetsInGroup(groupId);
  const allPlayers = await listAllPlayersInGroup(groupId);

  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));
  const setsMap: Record<string, typeof allSets> = {};
  for (const set of allSets) {
    if (!setsMap[set.matchId]) setsMap[set.matchId] = [];
    setsMap[set.matchId].push(set);
    setsMap[set.matchId].sort((a, b) => a.setNumber - b.setNumber);
  }

  const scheduled = allMatches.filter((m) => m.status === 'scheduled');
  const completed = allMatches.filter((m) => m.status === 'completed' || m.status === 'injury_aborted');

  const meta = (match: (typeof allMatches)[number]) => (
    <div className="flex items-center gap-3 flex-wrap small muted" style={{ fontWeight: 600 }}>
      <span className="inline-flex items-center gap-1.5"><Calendar size={12} /> {formatMatchDate(match.date)}</span>
      {match.location && <span className="inline-flex items-center gap-1.5"><MapPin size={12} /> {match.location}</span>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="sec-title">Partidos</h1>
          <p className="muted text-sm mt-1.5">
            {scheduled.length > 0 && <span style={{ color: 'var(--acc-text)', fontWeight: 600 }}>{scheduled.length} pendiente{scheduled.length !== 1 ? 's' : ''} · </span>}
            {completed.length} completado{completed.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href={`${basePath}/admin/matches/new`} className="lpt-btn primary shrink-0" style={smallBtn}>
          <Plus size={15} /> Partido
        </Link>
      </div>

      {allMatches.length === 0 ? (
        <div className="text-center py-12 muted">
          <p className="text-4xl mb-2">🎾</p>
          <p>No hay partidos todavía.</p>
          <Link href={`${basePath}/admin/matches/new`} className="lpt-btn primary mt-4 inline-flex">Registrar el primero</Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Programados */}
          {scheduled.length > 0 && (
            <div className="space-y-3">
              <p className="kicker">Próximos partidos</p>
              {scheduled.map((match) => {
                const t1 = [playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]];
                const t2 = [playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]];
                return (
                  <div key={match.id} className="lpt-card card-pad" style={{ borderColor: 'color-mix(in oklab, var(--acc) 35%, var(--line))' }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                      {meta(match)}
                      <StatusPill status="scheduled" />
                    </div>
                    <ScoreGrid team1={t1} team2={t2} sets={[]} compact />
                    <div className="flex items-center justify-end gap-2 flex-wrap mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                      <Link href={`${basePath}/admin/matches/${match.id}/result`} className="lpt-btn primary" style={smallBtn}>
                        <ClipboardPen size={14} /> Resultado
                      </Link>
                      <Link href={`${basePath}/admin/matches/${match.id}/sides`} className="lpt-btn" style={smallBtn}>
                        <RectangleVertical size={14} /> Lados
                      </Link>
                      <DeleteMatchButton id={match.id} g={gSlug} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completados */}
          {completed.length > 0 && (
            <div className="space-y-3">
              {scheduled.length > 0 && <p className="kicker">Partidos completados</p>}
              {completed.map((match) => {
                const sets = (setsMap[match.id] || []).map((s) => ({ team1Games: s.team1Games, team2Games: s.team2Games }));
                const t1 = [playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]];
                const t2 = [playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]];
                const isInjury = match.status === 'injury_aborted';
                return (
                  <div key={match.id} className="lpt-card card-pad" style={isInjury ? { borderColor: 'color-mix(in oklab, var(--loss) 35%, var(--line))' } : undefined}>
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                      {meta(match)}
                      <div className="flex items-center gap-2">
                        {isInjury && <StatusPill status="injury_aborted" />}
                        {!isInjury && (
                          <Link href={`${basePath}/admin/matches/${match.id}/edit`} className="lpt-btn" style={smallBtn}>
                            <Pencil size={14} /> Editar
                          </Link>
                        )}
                        <Link href={`${basePath}/admin/matches/${match.id}/sides`} className="lpt-btn" style={smallBtn}>
                          <RectangleVertical size={14} /> Lados
                        </Link>
                        <DeleteMatchButton id={match.id} g={gSlug} />
                      </div>
                    </div>
                    <ScoreGrid
                      team1={t1}
                      team2={t2}
                      sets={sets}
                      winnerTeam={isInjury ? null : match.winnerTeam}
                      injuredPlayerId={match.injuredPlayerId}
                      compact
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
