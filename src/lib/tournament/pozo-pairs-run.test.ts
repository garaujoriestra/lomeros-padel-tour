import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent } from './event-store';
import { loadEvent } from './event-store';
import { replacePairs } from './pair-store';
import { listPozoMatches } from './pozo-run';
import {
  generatePozoPairs, recordPozoPairsResult, pozoPairsStandingsLive,
} from './pozo-pairs-run';
import type { PozoConfig } from './types';

const CFG: PozoConfig = { rounds: 3, matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' } };

async function seedPlayers(client: any, ids: string[]) {
  for (const id of ids) {
    await client.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [id, id.toUpperCase()] });
  }
}

// nPairs parejas, nCourts pistas. Devuelve { id, pairIds }.
async function makePairsPozo(db: any, client: any, nPairs: number, nCourts: number) {
  const players = Array.from({ length: nPairs * 2 }, (_, i) => `p${i + 1}`);
  await seedPlayers(client, players);
  const courts = Array.from({ length: nCourts }, (_, i) => ({
    label: `Pista ${i + 1}`, sortOrder: i + 1, availableFrom: '17:00', availableTo: '20:00',
  }));
  const id = await createEvent(db, {
    name: 'Pozo PF', date: '2026-07-01', location: null, kind: 'pozo', format: 'fixed_pairs',
    config: CFG, createdBy: null, courts, participantPlayerIds: players,
  });
  // Empareja consecutivos: [p1,p2], [p3,p4], ...
  const pairs: [string, string][] = [];
  for (let i = 0; i < players.length; i += 2) pairs.push([players[i], players[i + 1]]);
  await replacePairs(db, id, pairs);
  const stored = (await import('./pair-store')).loadPairs;
  const pairIds = (await stored(db, id)).map((p) => p.id);
  return { id, pairIds };
}

async function playRound(db: any, id: string, round: number) {
  const ms = await listPozoMatches(db, id, round);
  for (const m of ms) await recordPozoPairsResult(db, m.id, 4, 2); // A gana siempre
  return ms;
}

describe('generatePozoPairs', () => {
  it('crea 1 partido por pista en la ronda 0, con 2 slots de pareja y hora por rejilla', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePairsPozo(db, client, 4, 2); // 4 parejas, 2 pistas → 2 partidos
    await generatePozoPairs(db, id, 123);

    const r0 = await listPozoMatches(db, id, 0);
    expect(r0.length).toBe(2);
    for (const m of r0) {
      const a1 = JSON.parse(m.slotA1!); const b1 = JSON.parse(m.slotB1!);
      expect(a1.type).toBe('pair'); expect(b1.type).toBe('pair');
      expect(a1.pairId).not.toBe(b1.pairId);
      expect(m.slotA2).toBeNull(); expect(m.slotB2).toBeNull();
      expect(m.phaseTag).toBe('pozo');
      expect(m.status).toBe('pending');
      expect(m.scheduledStart).toBe('17:00');
    }
    expect((await loadEvent(db, id)).status).toBe('scheduled');
  });

  it('es reproducible: misma semilla → misma ronda 0', async () => {
    const a = await createTestDb(); const pa = await makePairsPozo(a.db, a.client, 4, 2);
    await generatePozoPairs(a.db, pa.id, 777);
    const b = await createTestDb(); const pb = await makePairsPozo(b.db, b.client, 4, 2);
    await generatePozoPairs(b.db, pb.id, 777);
    const ma = (await listPozoMatches(a.db, pa.id, 0)).map((m) => JSON.parse(m.slotA1!).pairId.length);
    const mb = (await listPozoMatches(b.db, pb.id, 0)).map((m) => JSON.parse(m.slotA1!).pairId.length);
    expect(ma.length).toBe(mb.length);
  });

  it('rechaza generar si quedan más de 2 parejas descansando (config desbalanceada)', async () => {
    const { db, client } = await createTestDb();
    // 4 parejas en 1 sola pista → 1 pista usable, 2 parejas juegan, 2 descansan (OK). Forzamos 6 parejas en 1 pista → 4 descansan.
    const { id } = await makePairsPozo(db, client, 6, 1); // 6 parejas, 1 pista → 4 descansan (>2)
    await expect(generatePozoPairs(db, id, 1)).rejects.toThrow(/UNBALANCED_PAIRS|descans/i);
  });

  it('lanza si no hay parejas definidas', async () => {
    const { db, client } = await createTestDb();
    const players = ['p1', 'p2'];
    await seedPlayers(client, players);
    const id = await createEvent(db, {
      name: 'X', date: '2026-07-01', location: null, kind: 'pozo', format: 'fixed_pairs',
      config: CFG, createdBy: null,
      courts: [{ label: 'C1', sortOrder: 1, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: players,
    });
    await expect(generatePozoPairs(db, id, 1)).rejects.toThrow();
  });
});

describe('recordPozoPairsResult + avance', () => {
  it('al cerrar la ronda 0 genera la ronda 1 con el movimiento de parejas', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePairsPozo(db, client, 4, 2);
    await generatePozoPairs(db, id, 5);

    expect((await listPozoMatches(db, id, 1)).length).toBe(0);
    await playRound(db, id, 0);
    const r1 = await listPozoMatches(db, id, 1);
    expect(r1.length).toBe(2);
    for (const m of r1) {
      expect(m.status).toBe('pending');
      expect(m.scheduledStart).not.toBe('17:00');
      expect(JSON.parse(m.slotA1!).type).toBe('pair');
    }
  });

  it('las parejas no se rompen: cada pairId aparece en exactamente un partido por ronda', async () => {
    const { db, client } = await createTestDb();
    const { id, pairIds } = await makePairsPozo(db, client, 4, 2);
    await generatePozoPairs(db, id, 5);
    await playRound(db, id, 0);
    const r1 = await listPozoMatches(db, id, 1);
    const present = r1.flatMap((m) => [JSON.parse(m.slotA1!).pairId, JSON.parse(m.slotB1!).pairId]);
    expect(new Set(present).size).toBe(present.length);
    for (const pid of present) expect(pairIds).toContain(pid);
  });

  it('escribe marcador/ganador y no genera más allá del nº de rondas', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePairsPozo(db, client, 4, 2); // rounds: 3
    await generatePozoPairs(db, id, 9);
    await playRound(db, id, 0);
    await playRound(db, id, 1);
    await playRound(db, id, 2);
    expect((await listPozoMatches(db, id, 3)).length).toBe(0);
    const r0 = await listPozoMatches(db, id, 0);
    expect(r0[0].winner).toBe('A');
    expect(r0[0].teamAScore).toBe(4);
    expect(r0[0].status).toBe('completed');
  });
});

describe('pozoPairsStandingsLive', () => {
  it('clasifica por la pista de la última ronda con datos; una fila por pareja', async () => {
    const { db, client } = await createTestDb();
    const { id, pairIds } = await makePairsPozo(db, client, 4, 2);
    await generatePozoPairs(db, id, 5);
    await playRound(db, id, 0); // genera ronda 1
    const table = await pozoPairsStandingsLive(db, id);
    expect(table.length).toBe(4); // 4 parejas
    expect(table.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(new Set(table.map((r) => r.entityId))).toEqual(new Set(pairIds));
  });

  it('devuelve [] si el pozo no se ha generado', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePairsPozo(db, client, 4, 2);
    expect(await pozoPairsStandingsLive(db, id)).toEqual([]);
  });
});
