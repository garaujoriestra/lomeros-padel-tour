import Link from 'next/link';
import { PlayerAvatar } from '@/components/shared/player-avatar';

interface PartnerLike {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface UnplayedPartnersCardProps {
  unplayed: PartnerLike[];
  totalCandidates: number;
}

export function UnplayedPartnersCard({ unplayed, totalCandidates }: UnplayedPartnersCardProps) {
  if (unplayed.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🎲 Compañeros pendientes</p>
        <span className="text-xs text-gray-400">{unplayed.length} de {totalCandidates}</span>
      </div>
      <p className="text-sm text-gray-600 mb-3">Aún no has jugado de pareja con:</p>
      <div className="flex flex-wrap gap-2">
        {unplayed.map((p) => (
          <Link
            key={p.id}
            href={`/players/${p.id}`}
            className="inline-flex items-center gap-2 bg-green-50 hover:bg-green-100 text-green-800 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors"
          >
            <PlayerAvatar
              name={p.name}
              avatarUrl={p.avatarUrl}
              className="w-5 h-5 rounded-full"
              fallbackClassName="bg-gradient-to-br from-green-400 to-green-600 text-white font-black text-[10px]"
              sizes="20px"
            />
            {p.name}
          </Link>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3 italic">Anímate a probar nuevas parejas — sumáis al historial del grupo.</p>
    </div>
  );
}
