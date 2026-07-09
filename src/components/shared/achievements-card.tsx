'use client';

import { useState } from 'react';
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
  // En táctil no hay tooltip (title=): el detalle del logro se muestra al tocarlo.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? ACHIEVEMENTS.find((a) => a.id === selectedId) : undefined;
  const selectedEarnedAt = selectedId ? earnedMap.get(selectedId) : undefined;

  return (
    <div className="section">
      <SectionHead icon={Award} title="Logros" />
      <div className="lpt-card card-pad">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 10 }}>
          {ACHIEVEMENTS.map((a: Achievement) => {
            const earnedAt = earnedMap.get(a.id);
            const got = earnedAt !== undefined;
            const isSelected = selectedId === a.id;
            const tooltip = got
              ? `${a.name} — ${a.description} · Desbloqueado el ${formatEarnedDate(earnedAt)}`
              : `${a.name} — ${a.description} (bloqueado)`;
            return (
              <button
                key={a.id}
                type="button"
                title={tooltip}
                aria-pressed={isSelected}
                className="press"
                onClick={() => setSelectedId(isSelected ? null : a.id)}
                style={{
                  textAlign: 'center',
                  padding: '10px 4px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: got ? 'color-mix(in oklab, var(--acc) 12%, transparent)' : 'var(--surface-2)',
                  border: isSelected
                    ? '1px solid var(--acc)'
                    : got
                      ? '1px solid color-mix(in oklab, var(--acc) 35%, transparent)'
                      : '1px dashed var(--line)',
                  opacity: got ? 1 : 0.45,
                  filter: got ? 'none' : 'grayscale(1)',
                  color: 'inherit',
                }}
              >
                <div style={{ fontSize: 22 }}>{a.icon}</div>
                <div style={{ fontSize: 9.5, fontWeight: 700, marginTop: 3, lineHeight: 1.2 }}>{a.name}</div>
              </button>
            );
          })}
        </div>
        {selected && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              fontSize: 12.5,
              lineHeight: 1.45,
            }}
          >
            <b>{selected.icon} {selected.name}</b> — {selected.description}
            <div className="muted" style={{ marginTop: 2 }}>
              {selectedEarnedAt
                ? `Desbloqueado el ${formatEarnedDate(selectedEarnedAt)}`
                : 'Todavía bloqueado'}
            </div>
          </div>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 8, textAlign: 'right' }}>
        {earned.length} / {ACHIEVEMENTS.length} desbloqueados
      </p>
    </div>
  );
}
