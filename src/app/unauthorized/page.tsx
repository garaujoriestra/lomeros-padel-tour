import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: 'var(--hero-bg)' }}>
      <div className="lpt-card card-pad w-full max-w-sm" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🚫</div>
        <h1 className="display" style={{ fontSize: 24, margin: 0 }}>Cuenta no autorizada</h1>
        <p className="small muted" style={{ margin: '8px 0 18px' }}>
          Tu cuenta de Google no está dada de alta. Pide al organizador que te añada.
        </p>
        <Link href="/" className="lpt-btn">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
