'use client';

// Error boundary raíz con la marca LPT: sin él, cualquier error de servidor
// caía en la página por defecto de Next (sin estilo y en inglés).
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      className="screen"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 20px',
        minHeight: '70dvh',
        gap: 14,
      }}
    >
      <div className="display" style={{ fontSize: 'clamp(48px, 12vw, 84px)', color: 'var(--acc)' }}>Let, segundo saque</div>
      <p className="muted" style={{ margin: 0, fontSize: 14.5, maxWidth: '38ch' }}>
        Algo ha fallado al cargar esta pantalla. Suele resolverse reintentando.
      </p>
      <button type="button" className="lpt-btn primary" style={{ marginTop: 10 }} onClick={reset}>
        Reintentar
      </button>
    </main>
  );
}
