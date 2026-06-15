import { ACHIEVEMENT_BY_ID } from '@/lib/achievements/catalog';
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
