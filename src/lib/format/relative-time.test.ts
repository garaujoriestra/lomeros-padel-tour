import { describe, it, expect } from 'vitest';
import { relativeTime } from './relative-time';

describe('relativeTime', () => {
  // Reference "now": 2026-04-28T12:00:00Z
  const now = new Date('2026-04-28T12:00:00Z').getTime();

  it('returns "ahora" for less than a minute ago', () => {
    expect(relativeTime(now - 30 * 1000, now)).toBe('ahora');
  });

  it('returns "hace Nmin" for minutes ago', () => {
    expect(relativeTime(now - 5 * 60 * 1000, now)).toBe('hace 5min');
    expect(relativeTime(now - 1 * 60 * 1000, now)).toBe('hace 1min');
  });

  it('returns "hace Nh" for hours ago (less than 24h)', () => {
    expect(relativeTime(now - 2 * 60 * 60 * 1000, now)).toBe('hace 2h');
    expect(relativeTime(now - 23 * 60 * 60 * 1000, now)).toBe('hace 23h');
  });

  it('returns "ayer" for between 24 and 48 hours ago', () => {
    expect(relativeTime(now - 25 * 60 * 60 * 1000, now)).toBe('ayer');
    expect(relativeTime(now - 47 * 60 * 60 * 1000, now)).toBe('ayer');
  });

  it('returns "hace N días" for between 48h and 7 days', () => {
    expect(relativeTime(now - 3 * 24 * 60 * 60 * 1000, now)).toBe('hace 3 días');
    expect(relativeTime(now - 6 * 24 * 60 * 60 * 1000, now)).toBe('hace 6 días');
  });

  it('returns "hace N sem" for between 7 days and 30 days', () => {
    expect(relativeTime(now - 7 * 24 * 60 * 60 * 1000, now)).toBe('hace 1 sem');
    expect(relativeTime(now - 21 * 24 * 60 * 60 * 1000, now)).toBe('hace 3 sem');
  });

  it('returns "hace N meses" for 30+ days', () => {
    expect(relativeTime(now - 31 * 24 * 60 * 60 * 1000, now)).toBe('hace 1 mes');
    expect(relativeTime(now - 90 * 24 * 60 * 60 * 1000, now)).toBe('hace 3 meses');
  });

  it('accepts ISO string input', () => {
    const iso = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(iso, now)).toBe('hace 2h');
  });

  it('uses Date.now() as default reference', () => {
    // Just verify it doesn't throw with default
    expect(() => relativeTime(Date.now() - 1000)).not.toThrow();
  });
});
