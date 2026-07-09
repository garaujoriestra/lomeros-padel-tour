import { test, expect } from '@playwright/test';

// PWA instalable con icono de calidad: Android exige un icono de 512px y una
// variante maskable; sin ellos el splash de instalación sale borroso y la
// máscara adaptativa recorta el escudo.
test('el manifest declara iconos 512 y maskable, y las rutas sirven PNG', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();

  const entries = manifest.icons.map(
    (i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? `:${i.purpose}` : ''}`,
  );
  expect(entries).toContain('512x512');
  expect(entries).toContain('512x512:maskable');

  for (const path of ['/icon-512', '/icon-maskable']) {
    const icon = await request.get(path);
    expect(icon.ok()).toBeTruthy();
    expect(icon.headers()['content-type']).toContain('image/png');
  }
});
