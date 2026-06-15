import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent } from './event-store';
import { generatePozo, listPozoMatches, recordPozoResult } from './pozo-run';
import type { PozoConfig } from './types';

async function seedPlayers(client: import('@libsql/client').Client, ids: string[]) {
  for (const id of ids) {
    await client.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [id, id.toUpperCase()] });
  }
}

const POZO_CFG: PozoConfig = { rounds: 3, matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' } };

async function makePozo(db: any, client: any, nPlayers: number, nCourts: number) {
  const players = Array.from({ length: nPlayers }, (_, i) => `p${i + 1}`);
  await seedPlayers(client, players);
  const courts = Array.from({ length: nCourts }, (_, i) => ({
    label: `Pista ${i + 1}`, sortOrder: i + 1, availableFrom: '17:00', availableTo: '20:00',
  }));
  const id = await createEvent(db, {
    name: 'Pozo', date: '2026-07-01', location: null, kind: 'pozo', format: 'americano',
    config: POZO_CFG, createdBy: null, courts, participantPlayerIds: players,
  });
  return { id, players };
}

async function playRound(db: any, id: string, round: number) {
  const matches = await listPozoMatches(db, id, round);
  // El equipo A gana siempre 4-2 (determinista para el test).
  for (const m of matches) await recordPozoResult(db, m.id, 4, 2);
  return matches;
}

describe('generatePozo (americano)', () => {
  it('crea 1 partido por pista en la ronda 0, con slots de participante y hora por rejilla', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePozo(db, client, 8, 2); // 8 jugadores, 2 pistas → 2 partidos ronda 0
    await generatePozo(db, id, 123);

    const r0 = await listPozoMatches(db, id, 0);
    expect(r0.length).toBe(2);
    // cada partido tiene 4 slots de participante distintos
    for (const m of r0) {
      const slots = [m.slotA1, m.slotA2, m.slotB1, m.slotB2].map((s) => JSON.parse(s!));
      expect(slots.every((s) => s.type === 'participant')).toBe(true);
      expect(new Set(slots.map((s) => s.participantId)).size).toBe(4);
      expect(m.status).toBe('pending');
      expect(m.phaseTag).toBe('pozo');
      expect(m.scheduledStart).toBe('17:00'); // ronda 0 empieza al inicio de la pista
    }
    // los 8 jugadores aparecen exactamente una vez en la ronda 0
    const all = r0.flatMap((m) => [m.slotA1, m.slotA2, m.slotB1, m.slotB2].map((s) => JSON.parse(s!).participantId));
    expect(new Set(all).size).toBe(8);
  });

  it('es reproducible: misma semilla → misma ronda 0', async () => {
    const a = await createTestDb();
    const pa = await makePozo(a.db, a.client, 8, 2); await generatePozo(a.db, pa.id, 777);
    const b = await createTestDb();
    const pb = await makePozo(b.db, b.client, 8, 2); await generatePozo(b.db, pb.id, 777);
    const ma = (await listPozoMatches(a.db, pa.id, 0)).map((m) => m.slotA1);
    const mb = (await listPozoMatches(b.db, pb.id, 0)).map((m) => m.slotA1);
    expect(ma).toEqual(mb);
  });

  it('marca el evento como scheduled', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePozo(db, client, 8, 2);
    await generatePozo(db, id, 1);
    const { loadEvent } = await import('./event-store');
    expect((await loadEvent(db, id)).status).toBe('scheduled');
  });
});

describe('recordPozoResult + avance', () => {
  it('al cerrar la ronda 0, genera la ronda 1 con el movimiento del pozo', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePozo(db, client, 8, 2);
    await generatePozo(db, id, 5);

    expect((await listPozoMatches(db, id, 1)).length).toBe(0); // aún no
    await playRound(db, id, 0);
    const r1 = await listPozoMatches(db, id, 1);
    expect(r1.length).toBe(2); // se generó la ronda 1
    for (const m of r1) {
      expect(m.status).toBe('pending');
      expect(m.scheduledStart).not.toBe('17:00'); // ronda 1 va después en la rejilla
    }
  });

  it('escribe marcador y ganador y no genera más allá del nº de rondas', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makePozo(db, client, 8, 2); // rounds: 3
    await generatePozo(db, id, 9);
    await playRound(db, id, 0);
    await playRound(db, id, 1);
    await playRound(db, id, 2);
    // 3 rondas configuradas → no debe existir ronda 3
    expect((await listPozoMatches(db, id, 3)).length).toBe(0);
    const r0 = await listPozoMatches(db, id, 0);
    expect(r0[0].winner).toBe('A');
    expect(r0[0].teamAScore).toBe(4);
    expect(r0[0].status).toBe('completed');
  });
});
