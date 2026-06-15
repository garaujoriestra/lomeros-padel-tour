import { describe, it, expect } from 'vitest';
import { validateTournamentShell, validateResultInput } from './validation';

const roster = new Set(['p1', 'p2', 'p3', 'p4']);

function base() {
  return {
    name: '  Cumple 2026 ',
    date: '2026-06-15',
    location: '  Club  ',
    notes: '',
    courts: [
      { label: ' Pista 1 ', order: 1, availableFrom: '17:00', availableTo: '20:00' },
    ],
    participantPlayerIds: ['p1', 'p2'],
  };
}

describe('validateTournamentShell', () => {
  it('normaliza y acepta una entrada válida', () => {
    const r = validateTournamentShell(base(), roster);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe('Cumple 2026');
    expect(r.value.location).toBe('Club');
    expect(r.value.notes).toBeNull();
    expect(r.value.courts[0].label).toBe('Pista 1');
    expect(r.value.participantPlayerIds).toEqual(['p1', 'p2']);
  });

  it('rechaza nombre vacío', () => {
    const r = validateTournamentShell({ ...base(), name: '   ' }, roster);
    expect(r).toEqual({ ok: false, error: 'El nombre es obligatorio' });
  });

  it('rechaza fecha con formato inválido', () => {
    const r = validateTournamentShell({ ...base(), date: '15/06/2026' }, roster);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/Fecha/);
  });

  it('rechaza sin pistas', () => {
    const r = validateTournamentShell({ ...base(), courts: [] }, roster);
    expect(r).toEqual({ ok: false, error: 'Añade al menos una pista' });
  });

  it('rechaza ventana de pista con inicio >= fin', () => {
    const r = validateTournamentShell({
      ...base(),
      courts: [{ label: 'P1', order: 1, availableFrom: '20:00', availableTo: '18:00' }],
    }, roster);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/anterior a la de fin/);
  });

  it('rechaza horario no HH:MM', () => {
    const r = validateTournamentShell({
      ...base(),
      courts: [{ label: 'P1', order: 1, availableFrom: '5pm', availableTo: '20:00' }],
    }, roster);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/HH:MM/);
  });

  it('rechaza sin participantes', () => {
    const r = validateTournamentShell({ ...base(), participantPlayerIds: [] }, roster);
    expect(r).toEqual({ ok: false, error: 'Selecciona al menos un participante' });
  });

  it('rechaza participantes duplicados', () => {
    const r = validateTournamentShell({ ...base(), participantPlayerIds: ['p1', 'p1'] }, roster);
    expect(r).toEqual({ ok: false, error: 'Hay participantes duplicados' });
  });

  it('rechaza participante fuera del roster', () => {
    const r = validateTournamentShell({ ...base(), participantPlayerIds: ['p1', 'zzz'] }, roster);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/no existe en el roster/);
  });

  it('rechaza cuerpo no objeto', () => {
    const r = validateTournamentShell(null, roster);
    expect(r).toEqual({ ok: false, error: 'Cuerpo inválido' });
  });
});

describe('validateResultInput', () => {
  it('acepta marcador válido y deja winner indefinido', () => {
    const r = validateResultInput({ teamAScore: 6, teamBScore: 3 });
    expect(r).toEqual({ ok: true, value: { teamAScore: 6, teamBScore: 3, winner: undefined, setsJson: undefined } });
  });

  it('acepta winner explícito y setsJson', () => {
    const r = validateResultInput({ teamAScore: 5, teamBScore: 5, winner: 'B', setsJson: '[[6,4]]' });
    expect(r).toEqual({ ok: true, value: { teamAScore: 5, teamBScore: 5, winner: 'B', setsJson: '[[6,4]]' } });
  });

  it('acepta winner null', () => {
    const r = validateResultInput({ teamAScore: 4, teamBScore: 4, winner: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.winner).toBeNull();
  });

  it('rechaza marcador no entero o negativo', () => {
    expect(validateResultInput({ teamAScore: -1, teamBScore: 3 }).ok).toBe(false);
    expect(validateResultInput({ teamAScore: 1.5, teamBScore: 3 }).ok).toBe(false);
    expect(validateResultInput({ teamAScore: '6', teamBScore: 3 }).ok).toBe(false);
  });

  it('rechaza winner inválido', () => {
    const r = validateResultInput({ teamAScore: 6, teamBScore: 3, winner: 'X' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/winner/);
  });

  it('rechaza cuerpo no objeto', () => {
    expect(validateResultInput(42)).toEqual({ ok: false, error: 'Cuerpo inválido' });
  });
});
