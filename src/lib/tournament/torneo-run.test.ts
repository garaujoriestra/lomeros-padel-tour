import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { createEvent } from './event-store';
import { replacePairs, loadPairs } from './pair-store';
import { generateTorneo, recordTorneoResult, loadTorneoMatches } from './torneo-run';
import type { TorneoConfig } from './types';

type TestDb = Awaited<ReturnType<typeof createTestDb>>['db'];
type TestClient = Awaited<ReturnType<typeof createTestDb>>['client'];

const KO_CFG: TorneoConfig = { matchFormat: { kind: 'best_of_3' }, thirdPlace: false };

async function seedPlayers(client: TestClient, ids: string[]) {
  for (const id of ids) await client.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [id, id.toUpperCase()] });
}

async function makeTorneo(db: TestDb, client: TestClient, nPairs: number, nCourts: number, format: string, config: TorneoConfig) {
  const players = Array.from({ length: nPairs * 2 }, (_, i) => `p${i + 1}`);
  await seedPlayers(client, players);
  const courts = Array.from({ length: nCourts }, (_, i) => ({
    label: `Pista ${i + 1}`, sortOrder: i + 1, availableFrom: '17:00', availableTo: '23:00',
  }));
  const id = await createEvent(db, {
    name: 'Torneo', date: '2026-07-01', location: null, kind: 'torneo', format,
    config, createdBy: null, courts, participantPlayerIds: players,
  });
  const pairs: [string, string][] = [];
  for (let i = 0; i < players.length; i += 2) pairs.push([players[i], players[i + 1]]);
  await replacePairs(db, id, pairs);
  const pairIds = (await loadPairs(db, id)).map((p) => p.id);
  return { id, pairIds };
}

describe('generateTorneo (single_elim)', () => {
  it('escribe el cuadro completo: 4 parejas → 2 semis + 1 final, con slots pair y matchWinner', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 4, 2, 'single_elim', KO_CFG);
    await generateTorneo(db, id, 123);
    const ko = (await loadTorneoMatches(db, id)).filter((m) => m.phaseTag?.startsWith('ko:'));
    expect(ko.length).toBe(3);
    const r0 = ko.filter((m) => m.round === 0);
    const r1 = ko.filter((m) => m.round === 1);
    expect(r0.length).toBe(2);
    expect(r1.length).toBe(1);
    for (const m of r0) {
      expect(JSON.parse(m.slotA1!).type).toBe('pair');
      expect(JSON.parse(m.slotB1!).type).toBe('pair');
      expect(m.scheduledStart).toBeTruthy();
    }
    expect(JSON.parse(r1[0].slotA1!).type).toBe('matchWinner');
    expect(JSON.parse(r1[0].slotB1!).type).toBe('matchWinner');
  });

  it('marca el evento como scheduled y phaseTag ko:<idPosicional>', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 4, 2, 'single_elim', KO_CFG);
    await generateTorneo(db, id, 1);
    const { loadEvent } = await import('./event-store');
    expect((await loadEvent(db, id)).status).toBe('scheduled');
    const ko = (await loadTorneoMatches(db, id)).filter((m) => m.phaseTag?.startsWith('ko:'));
    expect(ko.map((m) => m.phaseTag).sort()).toEqual(['ko:r0m0', 'ko:r0m1', 'ko:r1m0']);
  });

  it('auto-completa los byes al generar (3 parejas → 1 bye ganado, 1 semi real)', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 3, 2, 'single_elim', KO_CFG);
    await generateTorneo(db, id, 1);
    const r0 = (await loadTorneoMatches(db, id)).filter((m) => m.phaseTag?.startsWith('ko:') && m.round === 0);
    expect(r0.length).toBe(2);
    const byeMatch = r0.find((m) => JSON.parse(m.slotA1!).type === 'bye' || JSON.parse(m.slotB1!).type === 'bye')!;
    expect(byeMatch.status).toBe('completed');
    expect(byeMatch.winner === 'A' || byeMatch.winner === 'B').toBe(true);
    const realMatch = r0.find((m) => m.id !== byeMatch.id)!;
    expect(realMatch.status).toBe('pending');
  });

  it('lanza TOO_FEW_PAIRS con menos de 2 parejas', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 1, 1, 'single_elim', KO_CFG);
    await expect(generateTorneo(db, id, 1)).rejects.toThrow(/TOO_FEW_PAIRS/);
  });
});

describe('recordTorneoResult (single_elim)', () => {
  it('escribe marcador y ganador de una semifinal', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 4, 2, 'single_elim', KO_CFG);
    await generateTorneo(db, id, 7);
    const semi = (await loadTorneoMatches(db, id)).find((m) => m.phaseTag === 'ko:r0m0')!;
    await recordTorneoResult(db, semi.id, 2, 0);
    const after = (await loadTorneoMatches(db, id)).find((m) => m.id === semi.id)!;
    expect(after.status).toBe('completed');
    expect(after.winner).toBe('A');
    expect(after.teamAScore).toBe(2);
  });
});
