// e2e/fase4-pwa-grupo.spec.ts
//
// Fase 4 · Pieza 2 — PWA por-grupo: cada grupo instala su propia identidad
// (nombre/scope/start_url/iconos), mientras la raíz "/" sigue siendo el manifest
// del grupo insignia (Lomeros). Usa el grupo fixture "grupo-test" que siembra
// e2e/global-setup.ts (compartido con e2e/group-home.spec.ts).
import { test, expect } from '@playwright/test';

const SLUG = 'grupo-test';

test.describe('PWA · manifest raíz (grupo insignia)', () => {
  test('GET /manifest.webmanifest es la identidad Lomeros', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();

    expect(manifest.name).toBe('Lomeros Padel Tour');
    expect(manifest.start_url).toBe('/');

    const entries = manifest.icons.map(
      (i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? `:${i.purpose}` : ''}`,
    );
    expect(entries).toContain('512x512');
    expect(entries).toContain('512x512:maskable');
  });
});

test.describe('PWA · manifest por grupo', () => {
  test(`GET /g/${SLUG}/manifest.webmanifest es propio del grupo`, async ({ request }) => {
    const res = await request.get(`/g/${SLUG}/manifest.webmanifest`);
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();

    expect(manifest.start_url).toBe(`/g/${SLUG}`);
    expect(manifest.scope).toBe('/');
    expect(typeof manifest.name).toBe('string');
    expect(manifest.name.length).toBeGreaterThan(0);
    expect(manifest.name).not.toBe('Padelo');
  });

  test('slug inexistente → 404', async ({ request }) => {
    const res = await request.get('/g/no-existe-xyz/manifest.webmanifest');
    expect(res.status()).toBe(404);
  });

  test('la página de grupo enlaza UN único manifest, el del grupo', async ({ page }) => {
    await page.goto(`/g/${SLUG}`);
    const links = page.locator('link[rel="manifest"]');
    await expect(links).toHaveCount(1);
    await expect(links).toHaveAttribute('href', `/g/${SLUG}/manifest.webmanifest`);
  });

  test('los iconos del grupo se sirven como PNG', async ({ request }) => {
    const icon = await request.get(`/g/${SLUG}/icon`);
    expect(icon.ok()).toBeTruthy();
    expect(icon.headers()['content-type']).toContain('image/png');

    const icon512 = await request.get(`/g/${SLUG}/icon-512`);
    expect(icon512.ok()).toBeTruthy();
    expect(icon512.headers()['content-type']).toContain('image/png');
  });

  test('icono de slug inexistente → 404', async ({ request }) => {
    const res = await request.get('/g/no-existe-xyz/icon');
    expect(res.status()).toBe(404);
  });
});
