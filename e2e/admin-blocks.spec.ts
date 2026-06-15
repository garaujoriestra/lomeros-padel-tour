import { test, expect } from '@playwright/test';
import { newAdminRequest, PLAYERS } from './helpers';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('admin añade y guarda un bloque pozo desde el editor', async ({ page, playwright }) => {
  // Cascarón vía API (sin bloques) para centrar el test en el editor.
  const admin = await newAdminRequest(playwright);
  const create = await admin.post('/api/tournaments', {
    data: {
      name: 'E2E Bloques', date: '2026-07-02',
      courts: [{ label: 'Pista 1', order: 1, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: PLAYERS,
    },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();
  await admin.dispose();

  await page.goto(`/admin/tournaments/${id}/blocks`);

  // Añade un bloque pozo (trae valores por defecto válidos) y guarda.
  await page.getByRole('button', { name: 'Bloque pozo' }).click();
  await expect(page.getByText('1. Pozo')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar bloques' }).click();

  // Vuelve al panel: el bloque aparece y ya se puede generar.
  await expect(page).toHaveURL(new RegExp(`/admin/tournaments/${id}$`));
  await expect(page.getByText('1. Pozo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generar parrilla' })).toBeVisible();
});
