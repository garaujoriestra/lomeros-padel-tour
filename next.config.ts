import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Envuelve cada navegación de <Link> en document.startViewTransition y habilita
  // los `transitionTypes` en <Link> (App Router usa un React canary que ya exporta
  // <ViewTransition>). Sin esto los <ViewTransition> solo animarían en Suspense.
  experimental: { viewTransition: true },
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
