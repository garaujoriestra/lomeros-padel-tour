import { test, expect } from '@playwright/test';
import http from 'node:http';
import { BASE_URL, TEST_MARKETING_HOST } from '../playwright.config';

// GET con cabecera Host forjada (fetch/undici no permiten forjar Host; http sí).
// Sirve para probar el rewrite del dominio de marketing contra localhost.
function getWithHost(path: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: { Host: host },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test.describe('captación · SEO técnico', () => {
  test('robots.txt bloquea admin/api/sesión y anuncia el sitemap', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('Disallow: /api/');
    expect(body).toContain('Disallow: /admin');
    expect(body).toContain('Disallow: /g/*/admin');
    expect(body).toContain(`Sitemap: ${BASE_URL}/sitemap.xml`);
  });

  test('sitemap.xml enumera la landing, la raíz y las legales', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain(`${BASE_URL}/bandejazo`);
    expect(body).toContain(`${BASE_URL}/legal/privacidad`);
    expect(body).toContain(`${BASE_URL}/legal/terminos`);
  });

  test('/bandejazo lleva tarjeta OG: og:image absoluta que sirve un png', async ({ page, request }) => {
    await page.goto('/bandejazo');
    const content = await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute('content');
    expect(content).toBeTruthy();
    expect(content).toContain('opengraph-image');
    // metadataBase → URL absoluta (los scrapers de WhatsApp no resuelven relativas)
    expect(content!.startsWith('http')).toBe(true);

    const img = await request.get(content!);
    expect(img.status()).toBe(200);
    expect(img.headers()['content-type']).toContain('image/png');
  });

  test('la URL antigua /padelo redirige 308 a /bandejazo (renombrado de marca)', async ({ request }) => {
    const res = await request.get('/padelo', { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    // Location puede venir relativa o absoluta según despliegue; basta el path.
    expect(res.headers()['location']).toContain('/bandejazo');
  });
});

test.describe('captación · atribución enlazada', () => {
  test('en un grupo sin pase «hecho con Bandejazo» es un enlace a la landing', async ({ page }) => {
    await page.goto('/g/grupo-free');
    const link = page.getByRole('link', { name: 'hecho con Bandejazo' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/bandejazo');
  });

  test('en un grupo con pase no hay atribución', async ({ page }) => {
    await page.goto('/g/grupo-test');
    await expect(page.getByText('hecho con Bandejazo')).toHaveCount(0);
  });
});

test.describe('captación · dominio de marketing (MARKETING_HOST)', () => {
  test('en el host de marketing la raíz sirve la landing; en el host normal, el tour', async () => {
    const marketing = await getWithHost('/', TEST_MARKETING_HOST);
    expect(marketing.status).toBe(200);
    expect(marketing.body).toContain('Tu peña merece una liga');

    const normal = await getWithHost('/', new URL(BASE_URL).host);
    expect(normal.status).toBe(200);
    expect(normal.body).not.toContain('Tu peña merece una liga');
  });
});
