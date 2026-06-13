import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Archivo, Barlow_Condensed } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { ServiceWorkerRegister } from "@/components/shared/service-worker-register";
import { NotificationReminderGate } from "@/components/shared/notification-reminder-gate";
import "./globals.css";

// Splash de marca que se pinta al instante (estilos inline, sin esperar al CSS
// de Tailwind) y se desvanece en cuanto el documento ha cargado y el contenido
// (o su skeleton) está en el DOM. Cubre el hueco en frío de la PWA.
const SPLASH_STYLE = `
#lpt-splash{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;background:linear-gradient(160deg,#1d2f2c 0%,#0c1715 60%);transition:opacity .45s ease,visibility .45s ease}
#lpt-splash.lpt-splash--hide{opacity:0;visibility:hidden;pointer-events:none}
#lpt-splash .lpt-splash__logo{font-family:var(--font-barlow),system-ui,sans-serif;font-size:64px;font-weight:800;font-style:italic;letter-spacing:-0.02em;color:#c8f03c;line-height:1;animation:lpt-splash-pulse 1.4s ease-in-out infinite}
#lpt-splash .lpt-splash__ring{width:30px;height:30px;border-radius:9999px;border:3px solid rgba(200,240,60,0.2);border-top-color:#c8f03c;animation:lpt-splash-spin .8s linear infinite}
@keyframes lpt-splash-pulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes lpt-splash-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){#lpt-splash .lpt-splash__logo,#lpt-splash .lpt-splash__ring{animation:none}}
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
  title: "Lomeros Padel Tour",
  description: "El ranking oficial del grupo Lomeros · LPT",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c1715",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${archivo.variable} ${barlow.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: SPLASH_STYLE }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Splash instantáneo: se desvanece solo cuando el contenido carga */}
        <div id="lpt-splash" aria-hidden="true" suppressHydrationWarning>
          <div className="lpt-splash__logo">LPT</div>
          <div className="lpt-splash__ring" />
        </div>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-right" />
          <Suspense fallback={null}>
            <NotificationReminderGate />
          </Suspense>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
