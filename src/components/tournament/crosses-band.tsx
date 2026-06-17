import type { BracketView, GroupView } from '@/lib/tournament/torneo-view';
import { seedLabelByPair } from '@/lib/tournament/torneo-view';

interface Props { bracket: BracketView; groups: GroupView[]; }

export function CrossesBand({ bracket, groups }: Props) {
  const r1 = bracket.rounds[0];
  if (!r1 || groups.length === 0) return null;
  const seed = seedLabelByPair(groups);
  const crosses = r1.matches
    .filter((m) => !m.isBye)
    .map((m) => ({
      key: m.matchId,
      a: m.teamAId ? (seed.get(m.teamAId) ?? m.teamA) : m.teamA,
      b: m.teamBId ? (seed.get(m.teamBId) ?? m.teamB) : m.teamB,
    }));
  if (crosses.length === 0) return null;

  return (
    <div className="lpt-card card-pad">
      <p className="kicker mb-2">🔀 Del grupo al cuadro</p>
      <ul className="flex flex-wrap gap-2">
        {crosses.map((c) => (
          <li key={c.key} className="text-[12.5px] px-2.5 py-1 rounded-[var(--r-pill)] bg-surface-2 border border-line">
            <span className="font-bold">{c.a}</span>
            <span className="text-ink-3"> vs </span>
            <span className="font-bold">{c.b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
