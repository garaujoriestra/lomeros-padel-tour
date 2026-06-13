import { describe, it, expect } from 'vitest';
import { distributePool, settlePool, type PoolBet } from './parimutuel';

describe('distributePool', () => {
  it('reparte proporcional y la suma cuadra exacta', () => {
    const m = distributePool(100, [{ betId: 'a', amount: 30 }, { betId: 'b', amount: 70 }]);
    expect(m.get('a')).toBe(30);
    expect(m.get('b')).toBe(70);
    expect(m.get('a')! + m.get('b')!).toBe(100);
  });
  it('reparte los restos del redondeo por resto mayor, sin perder fichas', () => {
    const m = distributePool(100, [{ betId: 'a', amount: 10 }, { betId: 'b', amount: 10 }, { betId: 'c', amount: 10 }]);
    const total = [...m.values()].reduce((s, n) => s + n, 0);
    expect(total).toBe(100);
    expect([...m.values()].sort()).toEqual([33, 33, 34]);
  });
  it('un solo ganador se lleva todo el pool', () => {
    const m = distributePool(150, [{ betId: 'a', amount: 50 }]);
    expect(m.get('a')).toBe(150);
  });
});

describe('settlePool', () => {
  const bets: PoolBet[] = [
    { id: 'a', playerId: 'p1', selection: 'team:1', amount: 40 },
    { id: 'b', playerId: 'p2', selection: 'team:1', amount: 60 },
    { id: 'c', playerId: 'p3', selection: 'team:2', amount: 50 },
  ];
  it('los acertantes se reparten todo el pool proporcionalmente', () => {
    const out = settlePool(bets, 'team:1');
    const a = out.find((o) => o.betId === 'a')!;
    const b = out.find((o) => o.betId === 'b')!;
    const c = out.find((o) => o.betId === 'c')!;
    expect(a).toMatchObject({ status: 'won', payout: 60 });
    expect(b).toMatchObject({ status: 'won', payout: 90 });
    expect(c).toMatchObject({ status: 'lost', payout: 0 });
    expect(a.payout + b.payout + c.payout).toBe(150);
  });
  it('si nadie acierta, se devuelve a todos su apuesta', () => {
    const out = settlePool(bets, 'team:1 que nadie eligió' as string);
    expect(out.every((o) => o.status === 'refunded')).toBe(true);
    expect(out.find((o) => o.betId === 'c')!.payout).toBe(50);
  });
  it('todos al mismo lado y aciertan → cada uno recupera su apuesta (×1)', () => {
    const all: PoolBet[] = [
      { id: 'a', playerId: 'p1', selection: 'team:1', amount: 40 },
      { id: 'b', playerId: 'p2', selection: 'team:1', amount: 60 },
    ];
    const out = settlePool(all, 'team:1');
    expect(out.find((o) => o.betId === 'a')!.payout).toBe(40);
    expect(out.find((o) => o.betId === 'b')!.payout).toBe(60);
  });
});
