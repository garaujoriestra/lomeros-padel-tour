import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('torneo grupos→eliminación: liguilla → cuadro automático', async ({ page }) => {
  const create = await page.request.post('/api/tournaments', {
    data: {
      name: 'E2E Grupos', date: '2026-08-02', location: null, kind: 'torneo', format: 'groups_elim',
      config: { matchFormat: { kind: 'best_of_3' }, thirdPlace: false, numGroups: 2, advancePerGroup: 2 },
      courts: [
        { label: 'Central', order: 1, availableFrom: '17:00', availableTo: '23:00' },
        { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '23:00' },
      ],
      participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'],
    },
  });
  const { id } = await create.json();
  await page.request.put(`/api/tournaments/${id}/pairs`, {
    data: { pairs: [['pl1', 'pl2'], ['pl3', 'pl4'], ['pl5', 'pl6'], ['pl7', 'pl8']] },
  });

  await page.goto(`/admin/torneos/${id}`);
  await page.getByRole('button', { name: 'Generar' }).click();

  await expect(page.getByRole('heading', { name: 'Grupos', exact: true })).toBeVisible();
  await expect(page.getByText('Grupo A')).toBeVisible();

  // Cierra toda la liguilla recorriendo los Guardar visibles (12 partidos de grupo).
  for (let guard = 0; guard < 40; guard++) {
    const btn = page.getByRole('button', { name: 'Guardar' }).first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await page.getByLabel('Juegos equipo A').first().fill('6');
    await page.getByLabel('Juegos equipo B').first().fill('3');
    await btn.click();
    await page.waitForTimeout(150);
    // Si ya apareció el Cuadro, paramos (no queremos empezar a registrar el cuadro).
    if (await page.getByText('Cuadro').isVisible().catch(() => false)) break;
  }

  await expect(page.getByText('Cuadro')).toBeVisible();
});
