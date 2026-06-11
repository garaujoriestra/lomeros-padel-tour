import { describe, it, expect } from 'vitest';
import { madridDateParts, selectReminders } from './reminders';

describe('madridDateParts', () => {
  it('devuelve hoy y mañana en formato YYYY-MM-DD', () => {
    // 2026-06-11 10:00 UTC → en Madrid (verano, UTC+2) es 2026-06-11
    const { today, tomorrow } = madridDateParts(new Date('2026-06-11T10:00:00Z'));
    expect(today).toBe('2026-06-11');
    expect(tomorrow).toBe('2026-06-12');
  });

  it('usa la zona horaria de Madrid, no UTC', () => {
    // 2026-06-11 23:30 UTC → en Madrid (UTC+2) ya es 2026-06-12 01:30
    const { today } = madridDateParts(new Date('2026-06-11T23:30:00Z'));
    expect(today).toBe('2026-06-12');
  });
});

describe('selectReminders', () => {
  const matches = [
    { id: 'a', date: '2026-06-11' },
    { id: 'b', date: '2026-06-12' },
    { id: 'c', date: '2026-06-20' },
  ];

  it('marca los de hoy como reminder_day y los de mañana como reminder_eve', () => {
    const out = selectReminders(matches, '2026-06-11', '2026-06-12');
    expect(out).toEqual([
      { matchId: 'a', kind: 'reminder_day' },
      { matchId: 'b', kind: 'reminder_eve' },
    ]);
  });

  it('ignora partidos fuera de hoy/mañana', () => {
    const out = selectReminders(matches, '2026-06-11', '2026-06-12');
    expect(out.find((r) => r.matchId === 'c')).toBeUndefined();
  });
});
