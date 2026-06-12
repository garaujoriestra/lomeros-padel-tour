import Link from 'next/link';

export default function NotFound() {
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
        minHeight: '70vh',
        gap: 14,
      }}
    >
      <div className="display" style={{ fontSize: 'clamp(72px, 18vw, 120px)', color: 'var(--acc)' }}>404</div>
      <p className="display" style={{ fontSize: 'clamp(18px, 4.5vw, 26px)', margin: 0 }}>Bola fuera</p>
      <p className="muted" style={{ margin: 0, fontSize: 14.5, maxWidth: '36ch' }}>
        Esta página no existe o ya no está disponible.
      </p>
      <Link href="/" className="lpt-btn primary" style={{ marginTop: 10 }}>
        Volver al inicio
      </Link>
    </main>
  );
}
