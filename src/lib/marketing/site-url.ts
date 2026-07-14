// URL pública canónica del sitio (metadataBase, sitemap, robots). Prioridad:
// NEXT_PUBLIC_SITE_URL explícita (dominio propio de marketing cuando exista) →
// dominio de producción de Vercel → localhost (dev/e2e).
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return new URL(`https://${vercel}`);
  return new URL('http://localhost:3000');
}
