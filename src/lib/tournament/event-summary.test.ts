import { describe, it, expect } from 'vitest';
import { eventLiveState, kindLabel, eventDetailHref } from './event-summary';

describe('eventLiveState', () => {
  it("draft → 'upcoming' (no generado todavía)", () => {
    expect(eventLiveState({ status: 'draft', totalMatches: 0, completedMatches: 0 })).toBe('upcoming');
    // Incluso con datos espurios de partidos, draft manda.
    expect(eventLiveState({ status: 'draft', totalMatches: 5, completedMatches: 5 })).toBe('upcoming');
  });

  it("partidos pendientes → 'live'", () => {
    expect(eventLiveState({ status: 'scheduled', totalMatches: 4, completedMatches: 1 })).toBe('live');
    expect(eventLiveState({ status: 'scheduled', totalMatches: 4, completedMatches: 0 })).toBe('live');
  });

  it("todos los partidos completados → 'finished'", () => {
    expect(eventLiveState({ status: 'scheduled', totalMatches: 4, completedMatches: 4 })).toBe('finished');
  });

  it("scheduled sin partidos → 'upcoming'", () => {
    expect(eventLiveState({ status: 'scheduled', totalMatches: 0, completedMatches: 0 })).toBe('upcoming');
  });
});

describe('kindLabel / eventDetailHref', () => {
  it('etiqueta el kind', () => {
    expect(kindLabel('pozo')).toBe('Pozo');
    expect(kindLabel('torneo')).toBe('Torneo');
  });

  it('ruta de detalle según kind', () => {
    expect(eventDetailHref('pozo', 'abc')).toBe('/pozos/abc');
    expect(eventDetailHref('torneo', 'xyz')).toBe('/torneos/xyz');
  });
});
