import { test, expect } from '@playwright/test';

test('descubrimiento de eventos: listado /eventos + sección en home', async ({ browser }) => {
  // 1) Montamos un pozo vía API y lo generamos (queda no-borrador → visible en público).
  const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const adminPage = await adminCtx.newPage();
  const create = await adminPage.request.post('/api/tournaments', {
    data: {
      name: 'E2E Evento Descubrible', date: '2026-09-20', location: 'Club Test', kind: 'pozo', format: 'fixed_pairs',
      config: { rounds: 2, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
      courts: [
        { label: 'Central', order: 1, availableFrom: '17:00', availableTo: '20:00' },
        { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '20:00' },
      ],
      participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'],
    },
  });
  const { id } = await create.json();
  await adminPage.request.put(`/api/tournaments/${id}/pairs`, {
    data: { pairs: [['pl1', 'pl2'], ['pl3', 'pl4'], ['pl5', 'pl6'], ['pl7', 'pl8']] },
  });
  await adminPage.request.post(`/api/tournaments/${id}/generate`, { data: { seed: 1 } });
  await adminCtx.close();

  // 2) Listado público /eventos: muestra el evento, su kind y el badge de estado.
  const ctx = await browser.newContext({ storageState: 'e2e/.auth/player.json' });
  const page = await ctx.newPage();
  await page.goto('/eventos');

  // El recordatorio de notificaciones (modal del jugador logueado) aparece async tras
  // registrar el service worker y puede tapar la tarjeta: lo descartamos si aparece.
  // Una vez descartado se recuerda en sessionStorage durante toda la sesión.
  const dismissReminder = async () => {
    const ahoraNo = page.getByRole('button', { name: 'Ahora no' });
    await ahoraNo.click({ timeout: 4000 }).catch(() => { /* no apareció — seguir */ });
  };
  await dismissReminder();

  const card = page.getByRole('link', { name: /E2E Evento Descubrible/ }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText('Pozo').first()).toBeVisible();
  // Generado pero sin resultados → "En directo".
  await expect(card.getByText('En directo').first()).toBeVisible();

  // 3) Click navega al detalle del pozo.
  await dismissReminder();
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/pozos/${id}`));
  await expect(page.getByRole('heading', { name: 'E2E Evento Descubrible' }).first()).toBeVisible();

  // 4) Home muestra la sección "Eventos" con el evento.
  await page.goto('/');
  const homeSection = page.locator('section', { has: page.getByRole('heading', { name: 'Eventos' }) }).first();
  await expect(homeSection).toBeVisible();
  await expect(homeSection.getByText('E2E Evento Descubrible').first()).toBeVisible();

  await ctx.close();
});
