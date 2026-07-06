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
import { resettleExactScoreBets } from '@/lib/betting/settle';
import { notifyBetSettlements } from '@/lib/push/bet-events';
import { reapplyAchievementsForMatch } from '@/lib/rating/process-match';

type SetInput = { setNumber: number; team1Games: number; team2Games: number };

// Valida los sets corregidos y devuelve el ganador que implican, o un error.
function validateSets(sets: unknown): { sets: SetInput[]; winnerTeam: 1 | 2 } | { error: string } {
  if (!Array.isArray(sets) || sets.length < 2 || sets.length > 3) {
    return { error: 'El partido necesita 2 o 3 sets' };
  }
  let t1 = 0, t2 = 0;
  const clean: SetInput[] = [];
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i] as { team1Games?: unknown; team2Games?: unknown };
    const g1 = Number(s?.team1Games), g2 = Number(s?.team2Games);
    if (!Number.isInteger(g1) || !Number.isInteger(g2) || g1 < 0 || g2 < 0) {
      return { error: 'Los juegos de cada set deben ser números válidos' };
    }
    if (g1 === g2) return { error: 'Un set no puede terminar empatado' };
    if (g1 > g2) t1++; else t2++;
    clean.push({ setNumber: i + 1, team1Games: g1, team2Games: g2 });
  }
  if (t1 !== 2 && t2 !== 2) return { error: 'Un equipo debe ganar 2 sets' };
  return { sets: clean, winnerTeam: t1 === 2 ? 1 : 2 };
}

// PATCH /api/matches/[id]/result — corrige un resultado ya registrado (admin del
// grupo objetivo; grupo en body.g). Acepta `sets` nuevos y/o `photoUrl`.
// El ganador NO puede cambiar: el ELO y las estadísticas dependen solo del
// ganador, así que corregir juegos los deja intactos. Si el marcador en sets
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
    if (match.status !== 'completed' || (match.winnerTeam !== 1 && match.winnerTeam !== 2)) {
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
      const validated = validateSets(sets);
      if ('error' in validated) return NextResponse.json({ error: validated.error }, { status: 400 });
      if (validated.winnerTeam !== match.winnerTeam) {
        return NextResponse.json(
          { error: 'La corrección cambiaría el equipo ganador. Para eso, borra el partido y regístralo de nuevo.' },
          { status: 400 },
        );
      }

      const oldSets = await getMatchSetsForMatch(id);
      const oldScore = matchSetsScore(oldSets, match.winnerTeam);
      const newScore = matchSetsScore(validated.sets, match.winnerTeam);

      await replaceMatchSets(id, validated.sets);

      if (oldScore !== newScore) {
        const changed = await resettleExactScoreBets(id, match.winnerTeam, validated.sets);
        await notifyBetSettlements(id, changed);
      }
      await reapplyAchievementsForMatch(id, groupId);
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
