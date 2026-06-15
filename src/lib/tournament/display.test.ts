import { describe, it, expect } from 'vitest';
import { slotLabel, matchTeamLabels, isMatchPlayable, involvesPlayer, nextMatchForPlayer, type DisplayContext, type PlayerScheduleMatch } from './display';

const ctx: DisplayContext = {
  playerName: new Map([['p1', 'Ana'], ['p2', 'Beto'], ['p3', 'Caro'], ['p4', 'Dani']]),
  pairLabel: new Map([['pairX', 'Ana / Beto'], ['pairY', 'Caro / Dani']]),
};

describe('slotLabel', () => {
  it('resuelve cada tipo de slot', () => {
    expect(slotLabel({ type: 'participant', participantId: 'p1' }, ctx)).toBe('Ana');
    expect(slotLabel({ type: 'pair', pairId: 'pairX' }, ctx)).toBe('Ana / Beto');
    expect(slotLabel({ type: 'placeholder', desc: '1º A' }, ctx)).toBe('1º A');
    expect(slotLabel({ type: 'matchWinner', matchId: 'm1' }, ctx)).toBe('Ganador (pdte.)');
    expect(slotLabel({ type: 'matchLoser', matchId: 'm1' }, ctx)).toBe('Perdedor (pdte.)');
    expect(slotLabel({ type: 'bye' }, ctx)).toBe('BYE');
    expect(slotLabel(null, ctx)).toBe('Por determinar');
  });

  it('usa marcador — si el id no está en el contexto', () => {
    expect(slotLabel({ type: 'participant', participantId: 'zzz' }, ctx)).toBe('—');
    expect(slotLabel({ type: 'pair', pairId: 'zzz' }, ctx)).toBe('—');
  });
});

describe('matchTeamLabels', () => {
  it('pozo: 4 participantes → "A / B" vs "C / D"', () => {
    const r = matchTeamLabels({
      slotA1: { type: 'participant', participantId: 'p1' },
      slotA2: { type: 'participant', participantId: 'p2' },
      slotB1: { type: 'participant', participantId: 'p3' },
      slotB2: { type: 'participant', participantId: 'p4' },
    }, ctx);
    expect(r).toEqual({ teamA: 'Ana / Beto', teamB: 'Caro / Dani' });
  });

  it('parejas: un slot por lado', () => {
    const r = matchTeamLabels({
      slotA1: { type: 'pair', pairId: 'pairX' }, slotA2: null,
      slotB1: { type: 'pair', pairId: 'pairY' }, slotB2: null,
    }, ctx);
    expect(r).toEqual({ teamA: 'Ana / Beto', teamB: 'Caro / Dani' });
  });
});

describe('isMatchPlayable', () => {
  it('true cuando ambos equipos están resueltos', () => {
    expect(isMatchPlayable({
      slotA1: { type: 'pair', pairId: 'pairX' }, slotA2: null,
      slotB1: { type: 'pair', pairId: 'pairY' }, slotB2: null,
    })).toBe(true);
  });

  it('false con placeholder, matchWinner o null sin resolver', () => {
    expect(isMatchPlayable({
      slotA1: { type: 'placeholder', desc: '1º A' }, slotA2: null,
      slotB1: { type: 'pair', pairId: 'pairY' }, slotB2: null,
    })).toBe(false);
    expect(isMatchPlayable({
      slotA1: null, slotA2: null, slotB1: null, slotB2: null,
    })).toBe(false);
  });
});

describe('involvesPlayer', () => {
  const myPairs = new Set(['pairX']);
  it('detecta al jugador como participante (pozo)', () => {
    expect(involvesPlayer({
      slotA1: { type: 'participant', participantId: 'p1' }, slotA2: null,
      slotB1: { type: 'participant', participantId: 'p2' }, slotB2: null,
    }, 'p1', myPairs)).toBe(true);
  });
  it('detecta al jugador por su pareja (fixed_pairs)', () => {
    expect(involvesPlayer({
      slotA1: { type: 'pair', pairId: 'pairX' }, slotA2: null,
      slotB1: { type: 'pair', pairId: 'pairY' }, slotB2: null,
    }, 'p1', myPairs)).toBe(true);
  });
  it('false si no aparece', () => {
    expect(involvesPlayer({
      slotA1: { type: 'participant', participantId: 'zzz' }, slotA2: null,
      slotB1: { type: 'pair', pairId: 'pairY' }, slotB2: null,
    }, 'p1', myPairs)).toBe(false);
  });
});

describe('nextMatchForPlayer', () => {
  const myPairs = new Set<string>();
  const base = (over: Partial<PlayerScheduleMatch>): PlayerScheduleMatch => ({
    slotA1: { type: 'participant', participantId: 'p1' }, slotA2: null,
    slotB1: { type: 'participant', participantId: 'p2' }, slotB2: null,
    scheduledStart: null, status: 'pending', ...over,
  });

  it('devuelve el pendiente más temprano que involucra al jugador', () => {
    const m1 = { id: 'm1', ...base({ scheduledStart: '18:00' }) };
    const m2 = { id: 'm2', ...base({ scheduledStart: '17:00' }) };
    const r = nextMatchForPlayer([m1, m2], 'p1', myPairs);
    expect(r?.id).toBe('m2');
  });

  it('ignora completados y partidos sin el jugador', () => {
    const done = { id: 'd', ...base({ scheduledStart: '16:00', status: 'completed' }) };
    const other = { id: 'o', ...base({ scheduledStart: '16:30', slotA1: { type: 'participant', participantId: 'x' } }) };
    const mine = { id: 'mine', ...base({ scheduledStart: '19:00' }) };
    const r = nextMatchForPlayer([done, other, mine], 'p1', myPairs);
    expect(r?.id).toBe('mine');
  });

  it('null si no hay ninguno', () => {
    const other = { id: 'o', ...base({ slotA1: { type: 'participant', participantId: 'x' }, slotB1: { type: 'participant', participantId: 'y' } }) };
    expect(nextMatchForPlayer([other], 'p1', myPairs)).toBeNull();
  });
});
