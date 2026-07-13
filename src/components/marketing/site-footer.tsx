import Link from 'next/link';
import { PLATFORM_NAME } from '@/lib/groups/constants';

export function SiteFooter() {
  return (
    <footer role="contentinfo" style={{ borderTop: '1px solid var(--line)', marginTop: 'calc(34px * var(--sp))' }}>
      <div className="lpt-container" style={{ padding: '24px 20px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="small muted">© {PLATFORM_NAME}</span>
        <nav style={{ display: 'flex', gap: 18 }}>
          <Link className="small" href="/legal/privacidad" style={{ color: 'var(--ink-2)' }}>Privacidad</Link>
          <Link className="small" href="/legal/terminos" style={{ color: 'var(--ink-2)' }}>Términos</Link>
          <Link className="small" href="/" style={{ color: 'var(--ink-2)' }}>Ver un tour en marcha</Link>
        </nav>
      </div>
    </footer>
  );
}
