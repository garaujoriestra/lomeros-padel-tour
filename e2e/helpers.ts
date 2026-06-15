import { expect, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { BASE_URL } from '../playwright.config';

type Playwright = PlaywrightWorkerArgs['playwright'];

export const PLAYERS = ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'];

// Contexto de API autenticado como admin (independiente del storageState del test).
export async function newAdminRequest(playwright: Playwright): Promise<APIRequestContext> {
  return playwright.request.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/admin.json' });
}

// Crea un torneo completo (cascarón + bloques pozo y fixed_pairs + parrilla generada) vía API.
// Devuelve el id. Requiere un contexto admin.
export async function setupGeneratedTournament(request: APIRequestContext, name = 'E2E Torneo'): Promise<string> {
  const create = await request.post('/api/tournaments', {
    data: {
      name, date: '2026-06-20', location: 'Club E2E',
      courts: [
        { label: 'Pista 1', order: 1, availableFrom: '17:00', availableTo: '20:00' },
        { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '20:00' },
      ],
      participantPlayerIds: PLAYERS,
    },
  });
  expect(create.status(), 'crear torneo').toBe(201);
  const { id } = await create.json();

  const blocks = await request.put(`/api/tournaments/${id}/blocks`, {
    data: {
      blocks: [
        {
          type: 'pozo', name: 'Pozo de calentamiento', durationMinutes: 60,
          matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' },
          bufferMinutes: 0, roundMinutes: 15, participantOrder: PLAYERS,
        },
        {
          type: 'fixed_pairs', name: 'Torneo', durationMinutes: 120,
          matchFormat: { kind: 'best_of_3' }, bufferMinutes: 5,
          knockout: true, advancePerGroup: 1, groupNames: ['A', 'B'],
          pairs: [
            { player1Id: 'pl1', player2Id: 'pl2', seed: 1, groupName: 'A' },
            { player1Id: 'pl3', player2Id: 'pl4', seed: 2, groupName: 'A' },
            { player1Id: 'pl5', player2Id: 'pl6', seed: 3, groupName: 'B' },
            { player1Id: 'pl7', player2Id: 'pl8', seed: 4, groupName: 'B' },
          ],
        },
      ],
    },
  });
  expect(blocks.status(), 'guardar bloques').toBe(200);

  const gen = await request.post(`/api/tournaments/${id}/generate`);
  expect(gen.status(), 'generar parrilla').toBe(200);

  return id;
}
