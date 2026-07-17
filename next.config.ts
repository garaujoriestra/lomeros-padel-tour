import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Envuelve cada navegación de <Link> en document.startViewTransition y habilita
  // los `transitionTypes` en <Link> (App Router usa un React canary que ya exporta
  // <ViewTransition>). Sin esto los <ViewTransition> solo animarían en Suspense.
  experimental: { viewTransition: true },
  // La landing nació como /padelo (renombrada a Bandejazo antes del lanzamiento);
  // el sitemap y algún enlace ya publicado apuntan ahí.
  async redirects() {
    return [{ source: '/padelo', destination: '/bandejazo', permanent: true }];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
};

export default nextConfig;
