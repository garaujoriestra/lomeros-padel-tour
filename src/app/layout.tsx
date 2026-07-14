import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { Archivo, Barlow_Condensed } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { ServiceWorkerRegister } from "@/components/shared/service-worker-register";
import { NotificationReminderGate } from "@/components/shared/notification-reminder-gate";
import { SHIELD_PATH, crestInkMarkup } from "@/components/shared/crest-svg";
import { resolvePageContext } from "@/lib/auth/page-context";
import { PLATFORM_NAME } from "@/lib/groups/constants";
import { siteUrl } from "@/lib/marketing/site-url";
import "./globals.css";

// Splash de marca que se pinta al instante (estilos inline, sin esperar al CSS
// de Tailwind) y se desvanece en cuanto el documento ha cargado y el contenido
// (o su skeleton) está en el DOM. Cubre el hueco en frío de la PWA.
const SPLASH_STYLE = `
#lpt-splash{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#1d2f2c 0%,#0c1715 60%);transition:opacity .45s ease,visibility .45s ease}
#lpt-splash.lpt-splash--hide{opacity:0;visibility:hidden;pointer-events:none}
#lpt-splash .lpt-crest{width:132px;height:auto}
#lpt-splash .lpt-crest__outline{fill:none;stroke:#c8f03c;stroke-width:5;stroke-dasharray:100;stroke-dashoffset:100;animation:lpt-draw 1.4s ease forwards}
#lpt-splash .lpt-crest__fill{fill:#c8f03c;opacity:0;animation:lpt-fill 1.4s ease forwards}
#lpt-splash .lpt-crest__ink{opacity:0;transform:scale(.7);transform-origin:64px 62px;animation:lpt-ink 1.4s ease forwards}
@keyframes lpt-draw{0%{stroke-dashoffset:100}35%{stroke-dashoffset:0}45%{stroke-dashoffset:0;opacity:1}55%,100%{opacity:0}}
@keyframes lpt-fill{0%,32%{opacity:0}48%,100%{opacity:1}}
@keyframes lpt-ink{0%,48%{opacity:0;transform:scale(.7)}66%{opacity:1;transform:scale(1)}100%{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion: reduce){
  #lpt-splash .lpt-crest__outline{animation:none;opacity:0}
  #lpt-splash .lpt-crest__fill{animation:none;opacity:1}
  #lpt-splash .lpt-crest__ink{animation:none;opacity:1;transform:scale(1)}
}
`;

const SPLASH_SCRIPT = `(function(){var el=document.getElementById('lpt-splash');if(!el)return;function hide(){el.classList.add('lpt-splash--hide');}function ready(){requestAnimationFrame(function(){requestAnimationFrame(hide);});}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',ready);}else{ready();}setTimeout(hide,8000);})();`;

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  // Base para URLs relativas de OG/canonical (p. ej. la tarjeta de /bandejazo):
  // sin ella, los shares llevarían URLs relativas rotas fuera de localhost.
  metadataBase: siteUrl(),
  title: {
    default: PLATFORM_NAME,
    // template '%s' = passthrough: las páginas con título propio (p. ej. /matches,
    // /offline) se muestran tal cual, SIN sufijo (evita el doble-marca), y el tipo
    // DefaultTemplateString de Next queda satisfecho (`template` es string, no null).
    template: '%s',
  },
  description: "Ranking Elo, partidos y apuestas de tu grupo de pádel",
  appleWebApp: {
    capable: true,
    title: PLATFORM_NAME,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c1715",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Root layout: no slug disponible aquí (envuelve TODAS las rutas, / y /g/[slug]
  // por igual), así que resolver sin slug es legítimo — es la raíz de la app.
  const ctx = await resolvePageContext();
  return (
    <html lang="es" className={`${archivo.variable} ${barlow.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: SPLASH_STYLE }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Splash instantáneo: el escudo se dibuja solo y se desvanece al cargar */}
        <div id="lpt-splash" aria-hidden="true" suppressHydrationWarning>
          <svg
            className="lpt-crest"
            viewBox="0 0 128 138"
            suppressHydrationWarning
          >
            <path className="lpt-crest__outline" pathLength={100} d={SHIELD_PATH} />
            <path className="lpt-crest__fill" d={SHIELD_PATH} />
            <g
              className="lpt-crest__ink"
              dangerouslySetInnerHTML={{ __html: crestInkMarkup() }}
            />
          </svg>
        </div>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
        <ThemeProvider>
          {children}
          {/* top-center con offset: en móvil los toasts no quedan bajo el notch
              ni la topbar (58px + safe-area) de la PWA instalada. */}
          <Toaster
            richColors
            position="top-center"
            offset={{ top: 72 }}
            mobileOffset={{ top: "calc(env(safe-area-inset-top) + 66px)" }}
          />
          <Suspense fallback={null}>
            {/* hasPlayer se resuelve contra el grupo por defecto (root layout sin slug).
                Con varios grupos, el gate correcto sería "ficha en CUALQUIER grupo";
                hoy es inocuo (grupo único; la suscripción push es por usuario/global). */}
            <NotificationReminderGate hasPlayer={!!ctx.player} />
          </Suspense>
        </ThemeProvider>
        <ServiceWorkerRegister />
        {/* Pageviews del funnel de captación (/bandejazo → /crear-grupo → /g/<slug>).
            En dev/e2e no emite nada; requiere Web Analytics activado en Vercel. */}
        <Analytics />
      </body>
    </html>
  );
}
