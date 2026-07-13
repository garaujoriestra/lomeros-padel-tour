// e2e/fase4-first-run.spec.ts
//
// Fase 4 · Pieza 1 — verifica dos cosas de punta a punta:
//   1) la marca de PLATAFORMA es «Padelo» (login, atribución de grupo), mientras
//      la raíz sigue siendo el grupo insignia «Lomeros Padel Tour» (preservado).
//   2) un grupo recién creado, SIN jugadores ni partidos, renderiza sus empty
//      states en home/rankings/admin·jugadores sin romperse (ni overlay de error).
//
// Setup: reutiliza el flujo REAL de onboarding (igual que e2e/onboarding.spec.ts):
// dev-login forja la sesión de un usuario nuevo y /api/onboarding/create-group
// (con un token de invitación firmado con jose/SignJWT, purpose 'create-group')
// crea un grupo genuinamente vacío con ese usuario como admin. No se inventa
// ningún mecanismo de setup nuevo ni se toca el global-setup compartido.
import { test, expect, type Page } from '@playwright/test';
import { SignJWT } from 'jose';
import { TEST_ENV } from '../playwright.config';

const key = new TextEncoder().encode(TEST_ENV.AUTH_SECRET);

async function inviteToken(exp = '7d') {
  return new SignJWT({ purpose: 'create-group' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(exp).sign(key);
}

// Ningún overlay de error de Next (dev o prod) debe estar presente en la página.
async function expectNoRuntimeError(page: Page) {
  await expect(page.getByText('Application error', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Unhandled Runtime Error', { exact: false })).toHaveCount(0);
}

test.describe('marca de plataforma «Padelo» vs grupo insignia', () => {
  test('login muestra «Padelo», no «Lomeros»', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Padelo' })).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Lomeros Padel Tour');
  });

  test('la raíz "/" sigue siendo «Lomeros Padel Tour» (insignia preservada)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Lomeros Padel Tour/);
  });
});

test.describe('primer arranque · grupo vacío (sin jugadores ni partidos)', () => {
  test('un grupo recién creado renderiza sus empty states sin romperse, con marca «Padelo»', async ({ browser }) => {
    const slug = `vacio-${Date.now()}`;
    const email = `first-run-${Date.now()}@test.com`;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Forjar sesión de un usuario NUEVO (mismo mecanismo que dev-login.spec.ts /
    // onboarding.spec.ts — no reutiliza los fixtures compartidos del global-setup
    // para no contaminar su estado con una membership extra).
    const login = await page.request.post('/api/auth/dev-login', { data: { email } });
    expect(login.status()).toBe(200);

    // Crear el grupo vacío vía el flujo real de onboarding (token de invitación + API).
    const create = await page.request.post('/api/onboarding/create-group', {
      data: { name: 'Grupo Vacío', slug, t: await inviteToken() },
    });
    expect(create.status()).toBe(200);

    // Home del grupo: 0 jugadores → empty state "arrancando", nada roto.
    const home = await page.goto(`/g/${slug}`);
    expect(home?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Grupo Vacío' }).first()).toBeVisible();
    await expect(page.getByText('Este grupo está arrancando')).toBeVisible();
    await expectNoRuntimeError(page);

    // Rankings: 0 partidos → empty state.
    await page.goto(`/g/${slug}/rankings`);
    await expect(page.getByText('Aún no hay partidos registrados')).toBeVisible();
    await expectNoRuntimeError(page);

    // Admin > jugadores: 0 jugadores → empty state + CTA "Añadir el primero".
    await page.goto(`/g/${slug}/admin/players`);
    await expect(page.getByText('No hay jugadores todavía')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Añadir el primero' })).toBeVisible();
    await expectNoRuntimeError(page);

    // Atribución de plataforma: si el footer "hecho con …" aparece, dice "Padelo";
    // en ningún caso debe colarse "Lomeros" en las páginas del grupo.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Lomeros');
    const footer = page.getByText('hecho con', { exact: false });
    if (await footer.count() > 0) {
      await expect(footer.first()).toContainText('Padelo');
    }

    await ctx.close();
  });
});
