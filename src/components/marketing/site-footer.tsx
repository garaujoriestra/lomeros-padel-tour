import Link from 'next/link';
import Crest from '@/components/shared/crest';
import { PLATFORM_NAME } from '@/lib/groups/constants';

export function SiteFooter() {
  return (
    <footer role="contentinfo" className="mkt-footer">
      <div className="lpt-container mkt-footer__in">
        <div className="mkt-footer__brand">
          <Crest size={24} wordmark={false} title={PLATFORM_NAME} />
          <div>
            <span className="display" style={{ fontSize: 17 }}>{PLATFORM_NAME}</span>
            <p className="small muted" style={{ marginTop: 1 }}>El ranking oficial de tu peña de pádel.</p>
          </div>
        </div>
        <nav className="mkt-footer__nav" aria-label="Enlaces legales">
          <Link href="/legal/privacidad">Privacidad</Link>
          <Link href="/legal/terminos">Términos</Link>
          <Link href="/">Ver un tour en marcha</Link>
        </nav>
      </div>
    </footer>
  );
}
