import Link from 'next/link';
import Crest from '@/components/shared/crest';
import { PLATFORM_NAME } from '@/lib/groups/constants';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt-page min-h-dvh flex flex-col">
      <header className="mkt-topbar">
        <div className="lpt-container mkt-topbar__in">
          <Link href="/bandejazo" className="mkt-brand">
            <Crest size={26} wordmark={false} title={PLATFORM_NAME} />
            <span className="display" style={{ fontSize: 20 }}>{PLATFORM_NAME}</span>
          </Link>
          <Link className="lpt-btn" href="/bandejazo">Volver</Link>
        </div>
      </header>
      <main className="lpt-container mkt-legal" style={{ maxWidth: 720, padding: 'clamp(40px, 6vw, 72px) 20px 80px', flex: 1 }}>
        {children}
      </main>
    </div>
  );
}
