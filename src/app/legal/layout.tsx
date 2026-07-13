import Link from 'next/link';
import { PLATFORM_NAME } from '@/lib/groups/constants';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      <header style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="lpt-container" style={{ height: 58, display: 'flex', alignItems: 'center' }}>
          <Link href="/padelo" className="display" style={{ fontSize: 20 }}>{PLATFORM_NAME}</Link>
        </div>
      </header>
      <main className="lpt-container" style={{ maxWidth: 720, padding: '32px 20px 64px', lineHeight: 1.6 }}>
        {children}
      </main>
    </div>
  );
}
