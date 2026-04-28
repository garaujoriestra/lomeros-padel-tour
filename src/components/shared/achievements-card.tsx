import { ACHIEVEMENTS, type Achievement } from '@/lib/achievements/catalog';

interface EarnedGrant {
  achievementId: string;
  earnedAt: string;
}

interface AchievementsCardProps {
  earned: EarnedGrant[];
}

function formatEarnedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AchievementsCard({ earned }: AchievementsCardProps) {
  const earnedMap = new Map(earned.map((g) => [g.achievementId, g.earnedAt]));
  const earnedCount = earned.length;
  const total = ACHIEVEMENTS.length;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🏆 Logros</p>
        <span className="text-xs text-gray-400">{earnedCount} / {total}</span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {ACHIEVEMENTS.map((a: Achievement) => {
          const earnedAt = earnedMap.get(a.id);
          const isEarned = earnedAt !== undefined;
          const tooltip = isEarned
            ? `${a.name} — ${a.description} · Desbloqueado el ${formatEarnedDate(earnedAt)}`
            : `${a.name} — ${a.description} (bloqueado)`;
          return (
            <div
              key={a.id}
              title={tooltip}
              className={`aspect-square rounded-xl flex items-center justify-center text-2xl ${
                isEarned
                  ? 'bg-gradient-to-br from-yellow-100 to-yellow-300 ring-1 ring-yellow-400/50'
                  : 'bg-gray-100 opacity-40 grayscale'
              }`}
            >
              {a.icon}
            </div>
          );
        })}
      </div>
    </div>
  );
}
