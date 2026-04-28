type TimeInput = number | string | Date;

function toMs(t: TimeInput): number {
  if (typeof t === 'number') return t;
  if (t instanceof Date) return t.getTime();
  return new Date(t).getTime();
}

export function relativeTime(timestamp: TimeInput, now: TimeInput = Date.now()): string {
  const ms = toMs(now) - toMs(timestamp);
  if (ms < 60 * 1000) return 'ahora';

  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 60) return `hace ${minutes}min`;

  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return `hace ${hours}h`;

  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 2) return 'ayer';
  if (days < 7) return `hace ${days} días`;

  const weeks = Math.floor(days / 7);
  if (days < 30) return `hace ${weeks} sem`;

  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
}
