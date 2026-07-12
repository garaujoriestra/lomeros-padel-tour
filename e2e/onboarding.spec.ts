// e2e/onboarding.spec.ts
import { test, expect } from '@playwright/test';
import { SignJWT } from 'jose';
import { TEST_ENV } from '../playwright.config';

const key = new TextEncoder().encode(TEST_ENV.AUTH_SECRET);

async function inviteToken(exp = '7d') {
  return new SignJWT({ purpose: 'create-group' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(exp).sign(key);
}

test.describe('onboarding · generación de enlace (súper-admin)', () => {
  test('súper-admin genera enlace → 200 con /crear-grupo?t=', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/super-admin.json' });
    const res = await ctx.request.post('/api/onboarding/invite-link');
    expect(res.status()).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toContain('/crear-grupo?t=');
    await ctx.close();
  });

  test('admin de grupo NO súper-admin → 403', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/gt-admin.json' });
    const res = await ctx.request.post('/api/onboarding/invite-link');
    expect(res.status()).toBe(403);
    await ctx.close();
  });

  test('sin sesión → 401', async ({ request }) => {
    const res = await request.post('/api/onboarding/invite-link');
    expect(res.status()).toBe(401);
  });
});

// Adaptación: en vez de reutilizar el fixture gt-player.json (single-membership, del
// que dependen otros specs como home-landing), cada test aquí se forja su PROPIO usuario
// vía dev-login. Así crear un grupo (2ª membership) no contamina el estado compartido de
// la DB de e2e — el plan original apuntaba este riesgo explícitamente.
async function loginAsFreshUser(request: import('@playwright/test').APIRequestContext, tag: string) {
  const email = `onb-user-${tag}-${Date.now()}@test.com`;
  const res = await request.post('/api/auth/dev-login', { data: { email } });
  expect(res.status()).toBe(200);
}

test.describe('onboarding · crear grupo (API)', () => {
  // Cualquier sesión válida puede crear grupo si trae token: forjamos un usuario nuevo
  // por test (ver loginAsFreshUser arriba).

  test('token válido + slug libre → 200 y membership admin', async ({ request }) => {
    await loginAsFreshUser(request, 'ok');
    const slug = `onb-${Date.now()}`;
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'Grupo Onb', slug, t: await inviteToken() },
    });
    expect(res.status()).toBe(200);
    // El creador es admin del grupo nuevo: puede listar como admin de ese grupo.
    const check = await request.get(`/api/tournaments?kind=pozo&g=${slug}`);
    expect(check.status()).toBe(200);
  });

  test('token caducado → 403', async ({ request }) => {
    await loginAsFreshUser(request, 'expired');
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'X', slug: `onb2-${Date.now()}`, t: await inviteToken('-1h') },
    });
    expect(res.status()).toBe(403);
  });

  test('sin token → 403; slug reservado → 400; slug ocupado → 400; nombre vacío → 400', async ({ request }) => {
    await loginAsFreshUser(request, 'validation');
    const t = await inviteToken();
    expect((await request.post('/api/onboarding/create-group', { data: { name: 'X', slug: `a-${Date.now()}` } })).status()).toBe(403);
    // Orden de validación: el token se comprueba ANTES que el slug (sin token + slug ocupado → 403, no 400).
    expect((await request.post('/api/onboarding/create-group', { data: { name: 'X', slug: 'grupo-test' } })).status()).toBe(403);
    expect((await request.post('/api/onboarding/create-group', { data: { name: 'X', slug: 'admin', t } })).status()).toBe(400);
    expect((await request.post('/api/onboarding/create-group', { data: { name: 'X', slug: 'grupo-test', t } })).status()).toBe(400);
    expect((await request.post('/api/onboarding/create-group', { data: { name: '  ', slug: `b-${Date.now()}`, t } })).status()).toBe(400);
  });
});

test.describe('onboarding · crear grupo sin sesión', () => {
  test('401', async ({ request }) => {
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'X', slug: 'zz', t: await inviteToken() },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('onboarding · página /crear-grupo', () => {
  test('sin token → mensaje de invitación necesaria, sin formulario', async ({ page }) => {
    await page.goto('/crear-grupo');
    await expect(page.getByText(/necesitas una invitación/i).first()).toBeVisible();
    await expect(page.getByLabel(/nombre del grupo/i)).toHaveCount(0);
  });

  test('token válido sin sesión → botón de Google (y deja cookie de intención)', async ({ page }) => {
    const t = await inviteToken();
    await page.goto(`/crear-grupo?t=${t}`);
    const link = page.getByRole('link', { name: /entrar con google/i }).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', `/api/onboarding/intent?t=${t}`);

    // Adaptación (GOTCHA de Next): `cookies().set()` no está soportado en un Server
    // Component, así que el botón enlaza a un Route Handler (/api/onboarding/intent)
    // que deja la cookie y redirige a Google — no la deja el propio render de la página.
    // En vez de clickear (nos llevaría a Google real, inexistente en e2e), pegamos
    // directo al route handler sin seguir la redirección y comprobamos el Set-Cookie.
    const res = await page.request.get(`/api/onboarding/intent?t=${t}`, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()['location']).toContain('/api/auth/login?from=');
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === 'signup_intent')).toBe(true);
  });

  // Adaptación (igual que en 'crear grupo (API)' arriba): gt-player.json es single-membership
  // y de él dependen otros specs (home-landing, fallback sin-g). Crear un grupo desde la UI
  // le añadiría una 2ª membership y contaminaría ese estado compartido. En vez de reutilizar
  // el fixture, forjamos un usuario fresco vía dev-login DESDE EL MISMO contexto de página
  // (la cookie de sesión queda en ese contexto) y navegamos después.
  async function loginFreshPage(page: import('@playwright/test').Page, tag: string) {
    const email = `onb-ui-${tag}-${Date.now()}@test.com`;
    const res = await page.request.post('/api/auth/dev-login', { data: { email } });
    expect(res.status()).toBe(200);
  }

  test('token válido con sesión → crea el grupo desde la UI y aterriza en su admin', async ({ page }) => {
    const slug = `ui-onb-${Date.now()}`;
    await loginFreshPage(page, 'ok');
    await page.goto(`/crear-grupo?t=${await inviteToken()}`);
    await page.getByLabel(/nombre del grupo/i).fill('Panteras Pádel');
    // El slug se auto-deriva; lo sobreescribimos por unicidad entre runs.
    await page.getByLabel(/nombre corto/i).fill(slug);
    await page.getByRole('button', { name: /crear grupo/i }).click();
    await expect(page).toHaveURL(new RegExp(`/g/${slug}/admin$`));
  });

  test('slug ocupado → error inline sin perder el nombre', async ({ page }) => {
    await loginFreshPage(page, 'dup');
    await page.goto(`/crear-grupo?t=${await inviteToken()}`);
    await page.getByLabel(/nombre del grupo/i).fill('Duplicado');
    await page.getByLabel(/nombre corto/i).fill('grupo-test');
    await page.getByRole('button', { name: /crear grupo/i }).click();
    await expect(page.getByText(/ya está cogido|inválido/i).first()).toBeVisible();
    await expect(page.getByLabel(/nombre del grupo/i)).toHaveValue('Duplicado');
  });
});

test.describe('onboarding · bloque de invitaciones en /admin', () => {
  test('el dueño (admin Lomeros + súper-admin) ve el bloque en /admin raíz y genera un enlace', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await ctx.newPage();
    await page.goto('/admin');
    const gen = page.getByRole('button', { name: /generar enlace de invitación/i }).first();
    await expect(gen).toBeVisible();
    await gen.click();
    await expect(page.getByLabel(/enlace de invitación/i).first()).toHaveValue(/crear-grupo\?t=/);
    await ctx.close();
  });

  test('un admin de grupo no súper-admin no ve el bloque', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/gt-admin.json' });
    const page = await ctx.newPage();
    await page.goto('/g/grupo-test/admin');
    await expect(page.getByRole('button', { name: /generar enlace/i })).toHaveCount(0);
    await ctx.close();
  });
});
