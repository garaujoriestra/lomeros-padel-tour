import type { ReminderKind } from './notifications';

export function madridDateParts(now: Date): { today: string; tomorrow: string } {
  // en-CA produces the YYYY-MM-DD format
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  const today = fmt(now);
  const tomorrow = fmt(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  return { today, tomorrow };
}

export function selectReminders(
  matches: { id: string; date: string }[],
  today: string,
  tomorrow: string,
): { matchId: string; kind: ReminderKind }[] {
  const out: { matchId: string; kind: ReminderKind }[] = [];
  for (const m of matches) {
    if (m.date === today) out.push({ matchId: m.id, kind: 'reminder_day' });
    else if (m.date === tomorrow) out.push({ matchId: m.id, kind: 'reminder_eve' });
  }
  return out;
}
