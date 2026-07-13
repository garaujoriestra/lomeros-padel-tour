import Link from 'next/link';
import Crest from '@/components/shared/crest';
import { PLATFORM_NAME } from '@/lib/groups/constants';
import { SiteFooter } from '@/components/marketing/site-footer';

export default function PadeloLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header style={{ position: 'sticky', top: 0, zIndex: 20, backdropFilter: 'blur(12px)', background: 'color-mix(in oklab, var(--bg) 86%, transparent)', borderBottom: '1px solid var(--line)' }}>
        <div className="lpt-container" style={{ height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/padelo" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Crest size={26} wordmark={false} title={PLATFORM_NAME} />
            <span className="display" style={{ fontSize: 20 }}>{PLATFORM_NAME}</span>
          </Link>
          <Link className="lpt-btn primary" href="/crear-grupo" style={{ minHeight: 40 }}>Crea tu grupo</Link>
        </div>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
      <SiteFooter />
    </div>
  );
}
