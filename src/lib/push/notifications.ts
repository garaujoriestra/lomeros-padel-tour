import { ACHIEVEMENT_BY_ID } from '@/lib/achievements/catalog';
import { DAY_ABBR } from '@/lib/planner/day-names';
import { formatMin } from '@/lib/planner/slots';
import type { ResultPosition } from '@/lib/rankings/match-positions';
import type { PushPayload } from './types';

export type ReminderKind = 'reminder_day' | 'reminder_eve';

export function buildResultNotification(
  didWin: boolean,
  eloChange: number,
  matchId: string,
  position?: ResultPosition,
): PushPayload {
  const rounded = Math.round(eloChange);
  const sign = rounded >= 0 ? '+' : '';
  // Posición en el ranking: muestra el movimiento «#5 → #3» cuando cambia de
  // puesto; si no se mueve (o no tenemos la posición), muestra solo «#3».
  let posPart = '';
  if (position) {
    posPart =
      position.before != null && position.before !== position.after
        ? ` · #${position.before} → #${position.after}`
        : ` · #${position.after}`;
  }
  return {
    title: didWin ? '🏆 ¡Victoria registrada!' : '📋 Resultado registrado',
    body: `${didWin ? 'Ganaste' : 'Perdiste'} · ELO ${sign}${rounded}${posPart}`,
    url: `/matches/${matchId}`,
    tag: `result-${matchId}`,
  };
}

// Empate 1-1: no hay ELO ni posición que enseñar, así que el aviso solo cuenta
// lo que pasó.
export function buildDrawNotification(matchId: string): PushPayload {
  return {
    title: '🤝 Empate registrado',
    body: 'El partido acabó 1-1 · no mueve el ranking',
    url: `/matches/${matchId}`,
    tag: `result-${matchId}`,
  };
}

export function buildAchievementNotification(achievementId: string): PushPayload | null {
  const a = ACHIEVEMENT_BY_ID[achievementId];
  if (!a) return null;
  return {
    title: `${a.icon} ¡Logro desbloqueado!`,
    body: `${a.name} — ${a.description}`,
    url: '/me',
    tag: `achievement-${achievementId}`,
  };
}

export function buildReminderNotification(
  kind: ReminderKind,
  opts: { time?: string | null; location?: string | null },
  matchId: string,
): PushPayload {
  const day = kind === 'reminder_day' ? 'Hoy' : 'Mañana';
  // Con hora: «Hoy a las 19:00». Sin hora (partidos antiguos sin time):
  // fallback al texto genérico anterior.
  let body = opts.time
    ? `${day} a las ${opts.time}`
    : kind === 'reminder_day'
      ? 'Hoy juegas un partido'
      : 'Mañana tienes partido';
  if (opts.location) body += ` · ${opts.location}`;
  return {
    title: '🎾 Recordatorio de partido',
    body,
    url: `/matches/${matchId}`,
    tag: `reminder-${matchId}-${kind}`,
  };
}

export function buildBettingOpenNotification(
  matchLabel: string,
  opts: { date?: string | null; time?: string | null; location?: string | null },
  matchId: string,
): PushPayload {
  // «15/07 a las 19:00 · Club X» cuando hay datos; si faltan, se omiten.
  const parts: string[] = [];
  if (opts.date) {
    const [, m, d] = opts.date.split('-');
    if (m && d) parts.push(opts.time ? `${d}/${m} a las ${opts.time}` : `${d}/${m}`);
  } else if (opts.time) {
    parts.push(`a las ${opts.time}`);
  }
  if (opts.location) parts.push(opts.location);
  const when = parts.length > 0 ? ` · ${parts.join(' · ')}` : '';
  return {
    title: '🎲 Nuevo partido en La Timba',
    body: `${matchLabel}${when} · ¡Apuestas abiertas!`,
    url: `/matches/${matchId}`,
    tag: `betting-open-${matchId}`,
  };
}

export interface PlannerDayAvailability {
  day: number; // 0=lunes … 6=domingo
  ranges: { startMin: number; endMin: number }[];
}

// Une una lista en lenguaje natural: «Mar», «Mar y Jue», «Mar, Jue y Sáb».
function joinEs(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

// Resume la disponibilidad de un jugador en una semana con el detalle que cabe
// en un push: un día se cuenta con sus horas, varios días solo se nombran, y a
// partir de cuatro basta el recuento — quien quiera el detalle abre la app.
function summarizeAvailability(days: PlannerDayAvailability[]): string {
  const sorted = [...days].sort((a, b) => a.day - b.day);
  if (sorted.length >= 4) return `${sorted.length} días marcados`;
  if (sorted.length > 1) return joinEs(sorted.map((d) => DAY_ABBR[d.day]));

  const only = sorted[0];
  const label = DAY_ABBR[only.day];
  if (only.ranges.length >= 3) return `${label} · ${only.ranges.length} tramos`;
  return `${label} ${joinEs(only.ranges.map((r) => `${formatMin(r.startMin)}–${formatMin(r.endMin)}`))}`;
}

// Aviso al grupo de que alguien ha marcado disponibilidad. Describe la semana
// ENTERA del jugador (no solo el día que disparó el aviso), así que si vuelve a
// ampliarla pasada la ventana de antispam el siguiente aviso ya lo refleja todo.
// Sin días marcados no hay nada que anunciar → null.
export function buildPlannerAvailabilityNotification(opts: {
  actorName: string;
  groupId: string;
  playerId: string;
  weekStart: string;
  isNextWeek: boolean;
  basePath: '' | `/g/${string}`;
  days: PlannerDayAvailability[];
}): PushPayload | null {
  if (opts.days.length === 0) return null;
  const when = opts.isNextWeek ? 'Próxima semana' : 'Esta semana';
  return {
    title: `📅 ${opts.actorName} ha marcado su disponibilidad`,
    body: `${when} · ${summarizeAvailability(opts.days)}`,
    // La semana actual es la que abre el planificador por defecto: el ?week=
    // solo hace falta para mandar a alguien a la siguiente.
    url: `${opts.basePath}/planificador${opts.isNextWeek ? `?week=${opts.weekStart}` : ''}`,
    tag: `planner-${opts.groupId}-${opts.weekStart}-${opts.playerId}`,
  };
}

export function buildBetSettledNotification(
  status: 'won' | 'lost' | 'refunded',
  amount: number,
  payout: number,
  matchLabel: string,
  matchId: string,
): PushPayload {
  const title =
    status === 'won' ? '🎉 ¡Acertaste tu apuesta!'
    : status === 'lost' ? '💸 Fallaste tu apuesta'
    : '↩️ Apuesta devuelta';
  const delta = status === 'won' ? `+${payout}` : status === 'lost' ? `-${amount}` : `+${amount}`;
  return {
    title,
    body: `${matchLabel} · ${delta} tokens`,
    url: `/matches/${matchId}`,
    tag: `bet-${matchId}-${status}`,
  };
}
