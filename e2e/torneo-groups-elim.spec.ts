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

  // Los partidos de cada grupo viven en <details> cerrados; ábrelos para ver los "Guardar".
  const openAllDetails = async () => {
    for (const d of await page.locator('details').all()) {
      const isOpen = await d.evaluate((el) => (el as HTMLDetailsElement).open).catch(() => true);
      if (!isOpen) await d.locator('summary').click().catch(() => {});
    }
  };

  // Cierra toda la liguilla (12 partidos) registrando cada Guardar visible.
  for (let guard = 0; guard < 40; guard++) {
    await openAllDetails();
    const btn = page.getByRole('button', { name: 'Guardar' }).first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await page.getByLabel('Juegos equipo A').first().fill('6');
    await page.getByLabel('Juegos equipo B').first().fill('3');
    await btn.click();
    await page.waitForTimeout(250);
  }

  // Cerrada la liguilla, el conmutador "Cuadro" se habilita → cambiar y ver el árbol + cruces.
  const cuadroTab = page.getByRole('button', { name: 'Cuadro' });
  await expect(cuadroTab).toBeEnabled();
  await cuadroTab.click();
  await expect(page.getByText('🔀 Del grupo al cuadro')).toBeVisible();
  await expect(page.getByText('Final', { exact: true })).toBeVisible();
});
