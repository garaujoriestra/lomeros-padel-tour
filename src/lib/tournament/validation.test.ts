import { describe, it, expect } from 'vitest';
import { validateTournamentShell, validateResultInput, validateBlocks, validateEventInput } from './validation';

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

const parts = new Set(['a', 'b', 'c', 'd', 'e', 'f']);

function pozoBlock() {
  return {
    type: 'pozo', name: 'Pozo', durationMinutes: 90,
    matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' },
    bufferMinutes: 0, roundMinutes: 15, participantOrder: ['a', 'b', 'c', 'd'],
  };
}
function fixedBlock() {
  return {
    type: 'fixed_pairs', name: 'Torneo', durationMinutes: 120,
    matchFormat: { kind: 'best_of_3' }, bufferMinutes: 5,
    knockout: true, advancePerGroup: 1, groupNames: ['A', 'B'],
    pairs: [
      { player1Id: 'a', player2Id: 'b', seed: 1, groupName: 'A' },
      { player1Id: 'c', player2Id: 'd', seed: 2, groupName: 'A' },
      { player1Id: 'e', player2Id: 'f', seed: 3, groupName: 'B' },
    ],
  };
}

describe('validateBlocks', () => {
  it('acepta y normaliza pozo + fixed_pairs', () => {
    const r = validateBlocks({ blocks: [pozoBlock(), fixedBlock()] }, parts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(2);
    expect(r.value[0].order).toBe(1);
    expect(r.value[1].order).toBe(2);
    expect(r.value[0].config.roundMinutes).toBe(15);
    expect(r.value[1].groupNames).toEqual(['A', 'B']);
    expect(r.value[1].pairs).toHaveLength(3);
  });

  it('acepta lista vacía de bloques', () => {
    const r = validateBlocks({ blocks: [] }, parts);
    expect(r).toEqual({ ok: true, value: [] });
  });

  it('rechaza tipo inválido', () => {
    const r = validateBlocks({ blocks: [{ ...pozoBlock(), type: 'mexicano' }] }, parts);
    expect(r.ok).toBe(false);
  });

  it('rechaza duración <= 0', () => {
    const r = validateBlocks({ blocks: [{ ...pozoBlock(), durationMinutes: 0 }] }, parts);
    expect(r.ok).toBe(false);
  });

  it('rechaza ronda de pozo mayor que el bloque', () => {
    const r = validateBlocks({ blocks: [{ ...pozoBlock(), roundMinutes: 120 }] }, parts);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/ronda/);
  });

  it('rechaza matchFormat inválido', () => {
    const r = validateBlocks({ blocks: [{ ...pozoBlock(), matchFormat: { kind: 'timed' } }] }, parts);
    expect(r.ok).toBe(false);
  });

  it('rechaza jugador de pareja fuera de los participantes', () => {
    const fb = fixedBlock();
    fb.pairs[0].player2Id = 'zzz';
    const r = validateBlocks({ blocks: [fb] }, parts);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/fuera de los participantes/);
  });

  it('rechaza un jugador en dos parejas', () => {
    const fb = fixedBlock();
    fb.pairs[1].player1Id = 'a';
    const r = validateBlocks({ blocks: [fb] }, parts);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/dos parejas/);
  });

  it('rechaza advancePerGroup mayor que el grupo más pequeño', () => {
    const fb = fixedBlock();
    fb.advancePerGroup = 2;
    const r = validateBlocks({ blocks: [fb] }, parts);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/grupo más pequeño/);
  });

  it('rechaza cuadro sin grupos con menos de 2 parejas', () => {
    const r = validateBlocks({ blocks: [{
      type: 'fixed_pairs', name: 'Cuadro', durationMinutes: 60,
      matchFormat: { kind: 'best_of_3' }, bufferMinutes: 0,
      knockout: true, groupNames: [],
      pairs: [{ player1Id: 'a', player2Id: 'b' }],
    }] }, parts);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/al menos 2 parejas/);
  });

  it('rechaza cuerpo sin blocks', () => {
    expect(validateBlocks({}, parts)).toEqual({ ok: false, error: 'Faltan los bloques' });
  });
});

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
