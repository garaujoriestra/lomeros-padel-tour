import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tournaments, tournamentMatches, type Tournament, type TournamentMatch } from '@/lib/db/schema';

// Gatekeeper: el torneo del grupo (undefined si no existe o es de otro grupo). Las rutas y
// páginas lo llaman ANTES de invocar el motor (loadEvent/generate/record/pairs); una vez
// verificado el torneo in-grupo, todas las operaciones por tournamentId de las sub-tablas
// (courts/participants/pairs/groups/matches) son in-grupo.
export async function getTournamentInGroup(groupId: string, id: string): Promise<Tournament | undefined> {
  const [t] = await db.select().from(tournaments)
    .where(and(eq(tournaments.id, id), eq(tournaments.groupId, groupId)));
  return t;
}

// Un partido de torneo cuyo torneo padre está en el grupo (para la ruta de resultado, que
// recibe matchId suelto). Devuelve undefined si el partido no existe o su torneo es de otro grupo.
export async function getTournamentMatchInGroup(groupId: string, matchId: string): Promise<TournamentMatch | undefined> {
  const [m] = await db
    .select({
      id: tournamentMatches.id, tournamentId: tournamentMatches.tournamentId,
      courtId: tournamentMatches.courtId, round: tournamentMatches.round,
      phaseTag: tournamentMatches.phaseTag, scheduledStart: tournamentMatches.scheduledStart,
      scheduledEnd: tournamentMatches.scheduledEnd, status: tournamentMatches.status,
      slotA1: tournamentMatches.slotA1, slotA2: tournamentMatches.slotA2,
      slotB1: tournamentMatches.slotB1, slotB2: tournamentMatches.slotB2,
      teamAScore: tournamentMatches.teamAScore, teamBScore: tournamentMatches.teamBScore,
      setsJson: tournamentMatches.setsJson, winner: tournamentMatches.winner,
    })
    .from(tournamentMatches)
    .innerJoin(tournaments, eq(tournaments.id, tournamentMatches.tournamentId))
    .where(and(eq(tournamentMatches.id, matchId), eq(tournaments.groupId, groupId)));
  return m;
}
