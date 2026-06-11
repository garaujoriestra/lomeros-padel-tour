import { ACHIEVEMENT_BY_ID } from '@/lib/achievements/catalog';
import type { PushPayload } from './types';

export type ReminderKind = 'reminder_day' | 'reminder_eve';

export function buildResultNotification(
  didWin: boolean,
  eloChange: number,
  matchId: string,
): PushPayload {
  const rounded = Math.round(eloChange);
  const sign = rounded >= 0 ? '+' : '';
  return {
    title: didWin ? '🏆 ¡Victoria registrada!' : '📋 Resultado registrado',
    body: `${didWin ? 'Ganaste' : 'Perdiste'} · ELO ${sign}${rounded}`,
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
  detail: string,
  matchId: string,
): PushPayload {
  const when = kind === 'reminder_day' ? 'Hoy juegas un partido' : 'Mañana tienes partido';
  return {
    title: '🎾 Recordatorio de partido',
    body: detail ? `${when} · ${detail}` : when,
    url: `/matches/${matchId}`,
    tag: `reminder-${matchId}-${kind}`,
  };
}
