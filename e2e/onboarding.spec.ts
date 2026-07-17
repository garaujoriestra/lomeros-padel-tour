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

  // Fase 4: alta abierta — el token deja de ser obligatorio; un token caducado ya no
  // bloquea: el alta cae al modo abierto y crea el grupo igualmente (200).
  test('token caducado con alta abierta → 200 (cae al modo abierto)', async ({ request }) => {
    await loginAsFreshUser(request, 'expired');
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'X', slug: `onb2-${Date.now()}`, t: await inviteToken('-1h') },
    });
    expect(res.status()).toBe(200);
  });

  // Fase 4: alta abierta — el token deja de ser obligatorio. El caso "sin token → 200"
  // vive en landing-bandejazo.spec; aquí solo la validación de slug/nombre, que no cambia:
  // con token válido, un slug reservado/ocupado/inválido o un nombre vacío devuelve 400.
  test('slug reservado → 400; slug ocupado → 400; nombre vacío → 400; slug largo → 400', async ({ request }) => {
    await loginAsFreshUser(request, 'validation');
    const t = await inviteToken();
    expect((await request.post('/api/onboarding/create-group', { data: { name: 'X', slug: 'admin', t } })).status()).toBe(400);
    expect((await request.post('/api/onboarding/create-group', { data: { name: 'X', slug: 'grupo-test', t } })).status()).toBe(400);
    expect((await request.post('/api/onboarding/create-group', { data: { name: '  ', slug: `b-${Date.now()}`, t } })).status()).toBe(400);
    // Cap de longitud: slug de 41 chars con forma válida → 400 (no se crea nada).
    expect((await request.post('/api/onboarding/create-group', { data: { name: 'X', slug: 'a'.repeat(41), t } })).status()).toBe(400);
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
  // Fase 4: alta abierta — el token deja de ser obligatorio. Sin token y sin sesión ya no
  // aparece "necesitas una invitación": se ofrece entrar con Google (la cobertura completa
  // del alta abierta por UI vive en landing-bandejazo.spec).
  test('sin token y sin sesión → botón de Google, sin formulario', async ({ page }) => {
    await page.goto('/crear-grupo');
    await expect(page.getByRole('link', { name: /entrar con google/i })).toBeVisible();
    await expect(page.getByText(/necesitas una invitación/i)).toHaveCount(0);
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
    // Gate raíz: la tarjeta NO aparece bajo un grupo, ni siquiera para el súper-admin.
    await page.goto('/g/grupo-test/admin');
    await expect(page.getByRole('button', { name: /generar enlace/i })).toHaveCount(0);
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

test.describe('onboarding · alta de jugadores bajo el grupo (gt-admin)', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  test('alta con email desde la UI del grupo → aparece en la lista; el invitado aterriza en el grupo', async ({ page, request }) => {
    const name = `Invitado ${Date.now()}`;
    const email = `inv-${Date.now()}@test.com`;
    await page.goto('/g/grupo-test/admin/players');
    await page.getByRole('link', { name: /nuevo/i }).first().click();
    await expect(page).toHaveURL(/\/g\/grupo-test\/admin\/players\/new$/);
    await page.getByLabel(/nombre/i).first().fill(name);
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /crear|guardar/i }).click();
    await expect(page).toHaveURL(/\/g\/grupo-test\/admin\/players$/);
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();

    // El invitado entra (dev-login) y su grupo-hogar es grupo-test.
    const login = await request.post('/api/auth/dev-login', { data: { email } });
    expect(((await login.json()) as { home: string }).home).toBe('/g/grupo-test/me');
  });

  test('edición: el botón Editar existe bajo grupo y guarda con el grupo correcto', async ({ page }) => {
    await page.goto('/g/grupo-test/admin/players');
    await page.getByLabel(/^Editar a /).first().click();
    await expect(page).toHaveURL(/\/g\/grupo-test\/admin\/players\/.+\/edit$/);
    await page.getByRole('button', { name: /guardar/i }).click();
    await expect(page).toHaveURL(/\/g\/grupo-test\/admin\/players$/);
  });
});

test.describe('onboarding · partido y resultado bajo el grupo (gt-admin)', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  test('programa un partido y registra el resultado desde la UI del grupo', async ({ page }) => {
    // 1) /g/grupo-test/admin/matches → link de cabecera a new
    await page.goto('/g/grupo-test/admin/matches');
    await page.getByRole('link', { name: 'Partido', exact: true }).filter({ visible: true }).first().click();
    await page.waitForURL(/\/g\/grupo-test\/admin\/matches\/new$/);

    // 2) Modo "Programar partido" (sin resultado) + 4 jugadores libres del grupo (gt-pl5..gt-pl8)
    //    + fecha; gt-match1 (gt-pl1..4) no se toca.
    await page.getByRole('button', { name: '📅 Programar partido' }).click();
    await page.locator('#date').fill('2026-08-01');
    await page.getByLabel('🔵 Equipo 1 — Jugador 1').selectOption({ label: 'Jugador GT 5' });
    await page.getByLabel('🔵 Equipo 1 — Jugador 2').selectOption({ label: 'Jugador GT 6' });
    await page.getByLabel('🔴 Equipo 2 — Jugador 1').selectOption({ label: 'Jugador GT 7' });
    await page.getByLabel('🔴 Equipo 2 — Jugador 2').selectOption({ label: 'Jugador GT 8' });

    // El recomendador de parejas es group-aware (?g=): muestra las sugerencias,
    // no un error de autorización.
    await expect(page.getByRole('button', { name: 'Aplicar esta combinación' }).first()).toBeVisible();
    await expect(page.getByText('No autorizado')).toHaveCount(0);

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/g\/grupo-test\/admin\/matches$/);

    // 3) Botón "Resultado" del partido recién creado (tarjeta con los 4 nuevos jugadores)
    const card = page.locator('.lpt-card').filter({ visible: true }).filter({ hasText: 'Jugador GT 5' }).filter({ hasText: 'Jugador GT 8' });
    await expect(card).toBeVisible();
    await card.getByRole('link', { name: 'Resultado' }).click();
    await page.waitForURL(/\/g\/grupo-test\/admin\/matches\/.+\/result$/);
    const matchId = page.url().match(/\/matches\/([^/]+)\/result$/)![1];

    // 4) Marcador 2 sets, guardar
    const inputs = page.locator('input[type="number"]').filter({ visible: true });
    await inputs.nth(0).fill('6');
    await inputs.nth(1).fill('0');
    await inputs.nth(2).fill('6');
    await inputs.nth(3).fill('0');
    await page.getByRole('button', { name: /Guardar resultado y actualizar rankings/ }).click();

    // 5) Vuelve a la lista y el partido pasa a completado (su botón Resultado desaparece).
    await page.waitForURL(/\/g\/grupo-test\/admin\/matches$/);
    const completedCard = page.locator('.lpt-card').filter({ visible: true }).filter({ hasText: 'Jugador GT 5' }).filter({ hasText: 'Jugador GT 8' });
    await expect(completedCard).toBeVisible();
    await expect(completedCard.getByRole('link', { name: 'Resultado' })).toHaveCount(0);

    // Limpieza: el dev server (y su DB de fichero) se reutiliza en local; sin borrar,
    // un segundo run dejaría dos tarjetas GT5-GT8 y el locator estricto fallaría.
    // El DELETE lleva el grupo en query (?g=), igual que DeleteMatchButton.
    const del = await page.request.delete(`/api/matches/${matchId}?g=grupo-test`);
    expect(del.ok()).toBeTruthy();
  });
});

test.describe('onboarding · viaje completo', () => {
  test('enlace → crear grupo → invitar jugador → el invitado aterriza y ve el grupo', async ({ browser }) => {
    const slug = `viaje-${Date.now()}`;
    const email = `viaje-${Date.now()}@test.com`;

    // 1) El súper-admin genera el enlace (API).
    const sa = await browser.newContext({ storageState: 'e2e/.auth/super-admin.json' });
    const { url } = (await (await sa.request.post('/api/onboarding/invite-link')).json()) as { url: string };
    await sa.close();

    // 2) Un usuario nuevo (dev-login = misma semántica de cuenta que el callback) crea el grupo por UI.
    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await adminPage.goto('/dev-login');
    await adminPage.getByLabel('Email nuevo').fill(`founder-${Date.now()}@test.com`);
    await adminPage.getByRole('button', { name: 'Entrar como nuevo' }).click();
    await adminPage.waitForURL(/\/me$/);
    await adminPage.goto(url.replace(/^https?:\/\/[^/]+/, ''));
    await adminPage.getByLabel(/nombre del grupo/i).fill('Grupo Viaje');
    await adminPage.getByLabel(/nombre corto/i).fill(slug);
    await adminPage.getByRole('button', { name: /crear grupo/i }).click();
    await adminPage.waitForURL(new RegExp(`/g/${slug}/admin$`));

    // 3) Invita a un jugador con email desde su admin.
    await adminPage.goto(`/g/${slug}/admin/players/new`);
    await adminPage.getByLabel(/nombre/i).first().fill('Jugadora Uno');
    await adminPage.getByLabel(/email/i).fill(email);
    await adminPage.getByRole('button', { name: /crear jugador/i }).click();
    await adminPage.waitForURL(new RegExp(`/g/${slug}/admin/players$`));
    await admin.close();

    // 4) La invitada entra y aterriza en SU grupo con su ficha.
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto('/dev-login');
    await guestPage.getByLabel('Email nuevo').fill(email); // el user ya existe: dev-login lo reutiliza
    await guestPage.getByRole('button', { name: 'Entrar como nuevo' }).click();
    await guestPage.waitForURL(new RegExp(`/g/${slug}/me$`));
    await expect(guestPage.getByText('Jugadora Uno').first()).toBeVisible();

    // 5) No-fuga: su home de grupo no lista jugadores de Lomeros.
    await guestPage.goto(`/g/${slug}`);
    await expect(guestPage.getByText('Jugador 1', { exact: true })).toHaveCount(0);
    await guest.close();
  });
});
