import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sin conexión · LPT',
};

// Página estática (sin DB ni sesión) que el service worker sirve cuando una
// navegación falla por falta de red.
export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 24,
        textAlign: 'center',
        background: 'linear-gradient(160deg, #1d2f2c 0%, #0c1715 60%)',
        color: '#e7efe9',
      }}
    >
      <div
        style={{
          fontSize: 44,
          fontWeight: 800,
          fontStyle: 'italic',
          color: '#c8f03c',
          letterSpacing: '-0.02em',
        }}
      >
        LPT
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Sin conexión</h1>
      <p style={{ fontSize: 14, opacity: 0.7, margin: 0, maxWidth: 280 }}>
        No hay conexión a internet. Vuelve a intentarlo cuando recuperes la red.
      </p>
      {/* href="" recarga la navegación actual: el SW reintenta la red. Sin JS. */}
      <a
        href=""
        style={{
          marginTop: 10,
          padding: '10px 22px',
          borderRadius: 999,
          background: '#c8f03c',
          color: '#0c1715',
          fontWeight: 700,
          fontSize: 14,
          textDecoration: 'none',
        }}
      >
        Reintentar
      </a>
    </div>
  );
}
