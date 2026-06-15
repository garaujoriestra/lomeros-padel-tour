import { describe, it, expect } from 'vitest';
import { slotLabel, matchTeamLabels, isMatchPlayable, type DisplayContext } from './display';

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
