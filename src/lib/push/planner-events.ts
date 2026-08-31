import { getDefaultGroupId } from '@/lib/auth/group-context';
import { getGroupById } from '@/lib/groups/queries';
import { slotsToRanges } from '@/lib/planner/slots';
import { loadWeekView } from '@/lib/planner/week-data';
import { madridTodayIso, mondayOf } from '@/lib/planner/weeks';
import { buildPlannerAvailabilityNotification, type PlannerDayAvailability } from './notifications';
import { sendToGroupExceptUsers, userIdsForPlayers } from './send';
import { claimNotificationSlot } from './throttle';

// Como mucho un aviso por jugador y semana cada 6 horas. Cubre de sobra la
// ráfaga del autoguardado (segundos) y deja que quien amplía su disponibilidad
// por la tarde vuelva a ser noticia.
const WINDOW_HOURS = 6;

// Avisa al grupo de que alguien ha marcado disponibilidad. Best-effort: es un
// efecto secundario del autoguardado y nunca debe tumbarlo, así que captura
// todos sus errores igual que notifyMatchResult.
export async function notifyPlannerAvailability(input: {
  groupId: string;
  actorPlayerId: string;
  weekStart: string;
}): Promise<void> {
  const { groupId, actorPlayerId, weekStart } = input;
  try {
    // El turno se reclama ANTES de leer nada: si no toca enviar, esto cuesta una
    // sola escritura y se acabó (es el caso normal en una ráfaga de guardados).
    const claimed = await claimNotificationSlot(
      `planner:${groupId}:${weekStart}:${actorPlayerId}`,
      WINDOW_HOURS,
    );
    if (!claimed) return;

    const view = await loadWeekView(groupId, weekStart);
    const actor = view.players.find((p) => p.id === actorPlayerId);
    if (!actor) return; // sin disponibilidad que contar (carrera con un borrado)

    const days: PlannerDayAvailability[] = actor.byDay
      .map((slots, day) => ({ day, ranges: slotsToRanges(slots) }))
      .filter((d) => d.ranges.length > 0);

    const [defaultGroupId, group] = await Promise.all([getDefaultGroupId(), getGroupById(groupId)]);
    if (!group) return;
    // El grupo por defecto vive en la raíz; el resto bajo /g/<slug>. Mismo
    // criterio que resolvePageContext, para que el enlace del push case con la
    // navegación normal de la app.
    const basePath = groupId === defaultGroupId ? ('' as const) : (`/g/${group.slug}` as const);

    const payload = buildPlannerAvailabilityNotification({
      actorName: actor.name,
      groupId,
      playerId: actorPlayerId,
      weekStart,
      isNextWeek: weekStart !== mondayOf(madridTodayIso()),
      basePath,
      days,
    });
    if (!payload) return;

    const actorUserIds = await userIdsForPlayers(groupId, [actorPlayerId]);
    await sendToGroupExceptUsers(groupId, actorUserIds, payload);
  } catch (error) {
    console.error('notifyPlannerAvailability error', error);
  }
}
