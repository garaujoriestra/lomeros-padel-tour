import { describe, it, expect } from 'vitest';
import { findUnplayedPartners } from './unplayed-partners';

describe('findUnplayedPartners', () => {
  function p(id: string, name: string, matchesPlayed = 5) {
    return { id, name, matchesPlayed };
  }
  function pair(player1Id: string, player2Id: string, matchesPlayed = 1) {
    return { player1Id, player2Id, matchesPlayed };
  }

  it('returns empty for a player who has paired with everyone', () => {
    const pedro = p('pedro', 'Pedro');
    const juan = p('juan', 'Juan');
    const luis = p('luis', 'Luis');
    const all = [pedro, juan, luis];
    const stats = [pair('pedro', 'juan'), pair('pedro', 'luis')];
    expect(findUnplayedPartners('pedro', all, stats)).toEqual([]);
  });

  it('returns players the target has not paired with', () => {
    const pedro = p('pedro', 'Pedro');
    const juan = p('juan', 'Juan');
    const luis = p('luis', 'Luis');
    const ana = p('ana', 'Ana');
    const all = [pedro, juan, luis, ana];
    const stats = [pair('pedro', 'juan')];
    const result = findUnplayedPartners('pedro', all, stats);
    expect(result.map((r) => r.id).sort()).toEqual(['ana', 'luis']);
  });

  it('handles pair_stats where target is player2', () => {
    const pedro = p('pedro', 'Pedro');
    const juan = p('juan', 'Juan');
    const luis = p('luis', 'Luis');
    const all = [pedro, juan, luis];
    // pedro is player2 in this stat
    const stats = [pair('juan', 'pedro')];
    const result = findUnplayedPartners('pedro', all, stats);
    expect(result.map((r) => r.id)).toEqual(['luis']);
  });

  it('excludes the target player from the result', () => {
    const pedro = p('pedro', 'Pedro');
    const juan = p('juan', 'Juan');
    const all = [pedro, juan];
    const result = findUnplayedPartners('pedro', all, []);
    expect(result.map((r) => r.id)).toEqual(['juan']);  // not pedro himself
  });

  it('excludes players with 0 matchesPlayed (not active)', () => {
    const pedro = p('pedro', 'Pedro');
    const juan = p('juan', 'Juan');
    const ana = p('ana', 'Ana', 0);  // brand new, no matches
    const all = [pedro, juan, ana];
    const result = findUnplayedPartners('pedro', all, []);
    expect(result.map((r) => r.id)).toEqual(['juan']);  // ana excluded
  });

  it('treats matchesPlayed === 0 in pair_stats as "not paired"', () => {
    const pedro = p('pedro', 'Pedro');
    const juan = p('juan', 'Juan');
    const all = [pedro, juan];
    // Row exists but matchesPlayed is 0 (e.g., zombie row)
    const stats = [pair('pedro', 'juan', 0)];
    const result = findUnplayedPartners('pedro', all, stats);
    expect(result.map((r) => r.id)).toEqual(['juan']);
  });

  it('returns players sorted alphabetically by name', () => {
    const pedro = p('pedro', 'Pedro');
    const charlie = p('charlie', 'Charlie');
    const ana = p('ana', 'Ana');
    const beto = p('beto', 'Beto');
    const all = [pedro, charlie, ana, beto];
    const result = findUnplayedPartners('pedro', all, []);
    expect(result.map((r) => r.name)).toEqual(['Ana', 'Beto', 'Charlie']);
  });
});
