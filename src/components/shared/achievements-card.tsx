import { Award } from 'lucide-react';
import { ACHIEVEMENTS, type Achievement } from '@/lib/achievements/catalog';
import { SectionHead } from '@/components/lpt/ui';

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

  return (
    <div className="section">
      <SectionHead icon={Award} title="Logros" />
      <div className="lpt-card card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 10 }}>
        {ACHIEVEMENTS.map((a: Achievement) => {
          const earnedAt = earnedMap.get(a.id);
          const got = earnedAt !== undefined;
          const tooltip = got
            ? `${a.name} — ${a.description} · Desbloqueado el ${formatEarnedDate(earnedAt)}`
            : `${a.name} — ${a.description} (bloqueado)`;
          return (
            <div
              key={a.id}
              title={tooltip}
              style={{
                textAlign: 'center',
                padding: '10px 4px',
                borderRadius: 10,
                background: got ? 'color-mix(in oklab, var(--acc) 12%, transparent)' : 'var(--surface-2)',
                border: got ? '1px solid color-mix(in oklab, var(--acc) 35%, transparent)' : '1px dashed var(--line)',
                opacity: got ? 1 : 0.45,
                filter: got ? 'none' : 'grayscale(1)',
              }}
            >
              <div style={{ fontSize: 22 }}>{a.icon}</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, marginTop: 3, lineHeight: 1.2 }}>{a.name}</div>
            </div>
          );
        })}
      </div>
      <p className="small muted" style={{ marginTop: 8, textAlign: 'right' }}>
        {earned.length} / {ACHIEVEMENTS.length} desbloqueados
      </p>
    </div>
  );
}
