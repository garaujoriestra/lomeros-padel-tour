import Link from 'next/link';
import Crest from '@/components/shared/crest';
import { PLATFORM_NAME } from '@/lib/groups/constants';
import { SiteFooter } from '@/components/marketing/site-footer';

export default function PadeloLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt-page min-h-dvh flex flex-col">
      <header className="mkt-topbar">
        <div className="lpt-container mkt-topbar__in">
          <Link href="/padelo" className="mkt-brand">
            <Crest size={26} wordmark={false} title={PLATFORM_NAME} />
            <span className="display" style={{ fontSize: 20 }}>{PLATFORM_NAME}</span>
          </Link>
          <Link className="lpt-btn primary" href="/crear-grupo">Crea tu grupo</Link>
        </div>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
      <SiteFooter />
    </div>
  );
}
