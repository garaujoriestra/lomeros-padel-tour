import { describe, it, expect } from 'vitest';
import { validateEventInput } from './validation';

describe('validateEventInput', () => {
  const roster = new Set(['p1', 'p2', 'p3', 'p4']);
  const baseCourts = [{ label: 'C1', order: 1, availableFrom: '17:00', availableTo: '20:00' }];

  it('acepta un pozo válido', () => {
    const r = validateEventInput({
      name: 'P', date: '2026-07-01', kind: 'pozo', format: 'americano',
      courts: baseCourts, participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
      config: { rounds: 4, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
    }, roster);
    expect(r.ok).toBe(true);
  });

  it('rechaza kind inválido', () => {
    const r = validateEventInput({
      name: 'P', date: '2026-07-01', kind: 'liga', format: 'americano',
      courts: baseCourts, participantPlayerIds: ['p1', 'p2'], config: {},
    }, roster);
    expect(r.ok).toBe(false);
  });

  it('rechaza pozo con rounds <= 0', () => {
    const r = validateEventInput({
      name: 'P', date: '2026-07-01', kind: 'pozo', format: 'americano',
      courts: baseCourts, participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
      config: { rounds: 0, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
    }, roster);
    expect(r.ok).toBe(false);
  });

  it('acepta torneo groups_elim válido y rechaza advancePerGroup < 1', () => {
    const ok = validateEventInput({
      name: 'T', date: '2026-07-01', kind: 'torneo', format: 'groups_elim',
      courts: baseCourts, participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
      config: { matchFormat: { kind: 'best_of_3' }, thirdPlace: false, numGroups: 2, advancePerGroup: 2 },
    }, roster);
    expect(ok.ok).toBe(true);

    const bad = validateEventInput({
      name: 'T', date: '2026-07-01', kind: 'torneo', format: 'groups_elim',
      courts: baseCourts, participantPlayerIds: ['p1', 'p2', 'p3', 'p4'],
      config: { matchFormat: { kind: 'best_of_3' }, thirdPlace: false, numGroups: 2, advancePerGroup: 0 },
    }, roster);
    expect(bad.ok).toBe(false);
  });

  it('rechaza formato no válido para el tipo', () => {
    const r = validateEventInput({
      name: 'P', date: '2026-07-01', kind: 'pozo', format: 'single_elim',
      courts: baseCourts, participantPlayerIds: ['p1', 'p2'],
      config: { rounds: 3, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
    }, roster);
    expect(r.ok).toBe(false);
  });
});
