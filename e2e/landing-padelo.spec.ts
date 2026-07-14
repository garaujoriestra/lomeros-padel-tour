import { test, expect } from '@playwright/test';

// Reutiliza el patrón dev-login de onboarding.spec: cada test mint una cuenta fresca.
async function loginFresh(request: import('@playwright/test').APIRequestContext, tag: string) {
  const email = `padelo-${tag}-${Date.now()}@test.com`;
  const res = await request.post('/api/auth/dev-login', { data: { email } });
  expect(res.status()).toBe(200);
}

test.describe('alta abierta (create-group)', () => {
  test('con sesión y SIN token → 200 y crea el grupo', async ({ request }) => {
    await loginFresh(request, 'open');
    const slug = `open-${Date.now()}`;
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'Grupo Abierto', slug }, // <-- sin `t`
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).slug).toBe(slug);
  });

  test('sin sesión → 401', async ({ request }) => {
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'X', slug: `nope-${Date.now()}` },
    });
    expect(res.status()).toBe(401);
  });

  test('cap por cuenta: al superar el máximo → 429', async ({ request }) => {
    await loginFresh(request, 'cap');
    for (let i = 0; i < 5; i++) {
      const res = await request.post('/api/onboarding/create-group', {
        data: { name: `Cap ${i}`, slug: `cap-${i}-${Date.now()}` },
      });
      expect(res.status()).toBe(200);
    }
    const over = await request.post('/api/onboarding/create-group', {
      data: { name: 'Cap 6', slug: `cap-6-${Date.now()}` },
    });
    expect(over.status()).toBe(429);
  });
});

test.describe('alta abierta (intent)', () => {
  test('sin token, alta abierta → 307 a login y deja cookie signup_intent', async ({ page }) => {
    const res = await page.request.get('/api/onboarding/intent', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()['location']).toContain('/api/auth/login?from=');
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === 'signup_intent')).toBe(true);
  });
});

async function loginFreshPage(page: import('@playwright/test').Page, tag: string) {
  const email = `padelo-ui-${tag}-${Date.now()}@test.com`;
  const res = await page.request.post('/api/auth/dev-login', { data: { email } });
  expect(res.status()).toBe(200);
}

test.describe('alta abierta (UI /crear-grupo)', () => {
  test('con sesión y sin token → formulario visible; crea y aterriza en su admin', async ({ page }) => {
    const slug = `ui-open-${Date.now()}`;
    await loginFreshPage(page, 'open');
    await page.goto('/crear-grupo');
    await page.getByLabel(/nombre del grupo/i).fill('Panteras Abiertas');
    await page.getByLabel(/nombre corto/i).fill(slug);
    await page.getByRole('button', { name: /crear grupo/i }).click();
    await expect(page).toHaveURL(new RegExp(`/g/${slug}/admin$`));
  });

  test('sin sesión y sin token → botón "Entrar con Google" a la ruta intent', async ({ page }) => {
    await page.goto('/crear-grupo');
    const link = page.getByRole('link', { name: /entrar con google/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/api/onboarding/intent');
  });
});

test.describe('legal + footer', () => {
  test('/legal/privacidad y /legal/terminos renderizan', async ({ page }) => {
    await page.goto('/legal/privacidad');
    await expect(page.getByRole('heading', { name: /privacidad/i })).toBeVisible();
    await page.goto('/legal/terminos');
    await expect(page.getByRole('heading', { name: /términos/i })).toBeVisible();
  });

  test('el footer de /padelo enlaza la legal', async ({ page }) => {
    await page.goto('/padelo');
    await expect(page.getByRole('contentinfo').getByRole('link', { name: /privacidad/i })).toHaveAttribute('href', '/legal/privacidad');
    await expect(page.getByRole('contentinfo').getByRole('link', { name: /términos/i })).toHaveAttribute('href', '/legal/terminos');
  });
});

test.describe('landing /padelo', () => {
  test('hero y ambos CTAs enrutan bien', async ({ page }) => {
    await page.goto('/padelo');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const crear = page.getByRole('link', { name: /crea tu grupo/i }).first();
    await expect(crear).toHaveAttribute('href', '/crear-grupo');
    await expect(page.getByRole('link', { name: /ver un tour en marcha/i }).first()).toHaveAttribute('href', '/');
  });

  test('la landing de plataforma NO contiene el literal «Lomeros»', async ({ page }) => {
    await page.goto('/padelo');
    const html = await page.content();
    expect(html).not.toContain('Lomeros');
  });

  test('la raíz sigue siendo «Lomeros Padel Tour» (insignia intacta)', async ({ page }) => {
    await page.goto('/');
    expect(await page.content()).toContain('Lomeros');
  });
});
