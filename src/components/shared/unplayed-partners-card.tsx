import Link from 'next/link';
import { LptAvatar } from '@/components/lpt/ui';

interface PartnerLike {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface UnplayedPartnersCardProps {
  unplayed: PartnerLike[];
  totalCandidates: number;
  basePath?: string;
}

export function UnplayedPartnersCard({ unplayed, totalCandidates, basePath = '' }: UnplayedPartnersCardProps) {
  if (unplayed.length === 0) return null;

  return (
    <div className="lpt-card card-pad">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="kicker">✦ Parejas inéditas</span>
        <span className="small muted num">{unplayed.length} de {totalCandidates}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {unplayed.map((p) => (
          <Link key={p.id} href={`${basePath}/players/${p.id}`} className="lpt-badge" style={{ padding: '4px 10px 4px 4px' }}>
            <LptAvatar player={p} size={20} />
            {p.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
