import { NextRequest, NextResponse } from 'next/server';
import type { NewMatch } from '@/lib/db/schema';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import {
  getMatchInGroup,
  getMatchSetsForMatch,
  replaceMatchSets,
  updateMatchInGroup,
} from '@/lib/matches/queries';
import { matchSetsScore } from '@/lib/betting/settle-logic';
import { resolveSetsOutcome } from '@/lib/matches/outcome';
import { resettleExactScoreBets } from '@/lib/betting/settle';
import { notifyBetSettlements } from '@/lib/push/bet-events';
import { reapplyAchievementsForMatch } from '@/lib/rating/process-match';

// PATCH /api/matches/[id]/result — corrige un resultado ya registrado (admin del
// grupo objetivo; grupo en body.g). Acepta `sets` nuevos y/o `photoUrl`.
// El desenlace NO puede cambiar: el ELO y las estadísticas dependen solo de él,
// así que corregir juegos los deja intactos. Ni el ganador cambia de equipo, ni
// un empate se convierte en victoria (ni al revés). Si el marcador en sets
// (2-0 ↔ 2-1) cambia, se re-liquida el mercado exact_score de La Timba y se
// recalculan los logros de rosco del partido.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;

  try {
    const { id } = await params;
    const { sets, photoUrl } = body;

    if (sets === undefined && photoUrl === undefined) {
      return NextResponse.json({ error: 'Nada que corregir' }, { status: 400 });
    }

    const match = await getMatchInGroup(groupId, id);
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    const isDrawMatch = match.status === 'draw';
    const hasWinner = match.status === 'completed' && (match.winnerTeam === 1 || match.winnerTeam === 2);
    if (!isDrawMatch && !hasWinner) {
      return NextResponse.json({ error: 'Solo se puede corregir un partido con resultado registrado' }, { status: 400 });
    }

    const updateFields: Partial<NewMatch> = {};

    if (photoUrl !== undefined) {
      if (photoUrl !== null && typeof photoUrl !== 'string') {
        return NextResponse.json({ error: 'photoUrl inválida' }, { status: 400 });
      }
      updateFields.photoUrl = photoUrl || null;
    }

    if (sets !== undefined) {
      const outcome = resolveSetsOutcome(sets);
      if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 400 });
      if (outcome.winnerTeam !== match.winnerTeam) {
        const error = isDrawMatch
          ? 'La corrección convertiría el empate en una victoria. Para eso, borra el partido y regístralo de nuevo.'
          : 'La corrección cambiaría el equipo ganador. Para eso, borra el partido y regístralo de nuevo.';
        return NextResponse.json({ error }, { status: 400 });
      }

      if (isDrawMatch) {
        // Un empate no liquidó apuestas (se devolvieron todas) ni escribió en
        // rating_history, así que corregir los juegos solo toca los sets.
        await replaceMatchSets(id, outcome.sets);
      } else {
        const winnerTeam = match.winnerTeam as 1 | 2;
        const oldSets = await getMatchSetsForMatch(id);
        const oldScore = matchSetsScore(oldSets, winnerTeam);
        const newScore = matchSetsScore(outcome.sets, winnerTeam);

        await replaceMatchSets(id, outcome.sets);

        if (oldScore !== newScore) {
          const changed = await resettleExactScoreBets(id, winnerTeam, outcome.sets);
          await notifyBetSettlements(id, changed);
        }
        await reapplyAchievementsForMatch(id, groupId);
      }
    }

    const updated = Object.keys(updateFields).length > 0
      ? await updateMatchInGroup(groupId, id, updateFields)
      : match;
    const finalSets = await getMatchSetsForMatch(id);

    return NextResponse.json({ ...updated, sets: finalSets });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al corregir el resultado' }, { status: 500 });
  }
}
