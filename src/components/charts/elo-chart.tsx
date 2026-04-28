'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import type { RankChangeEvent } from '@/lib/feed/rank-changes';

interface EloChartDatum {
  /** ISO date string of the match. */
  date: string;
  /** Player's elo right after the match. */
  elo: number;
}

interface EloChartProps {
  data: EloChartDatum[];
  rankEvents?: RankChangeEvent[];
}

const RANK_DOT_LABELS: Record<RankChangeEvent['type'], string> = {
  rank_into_top1: '🥇 #1',
  rank_loses_top1: '↓ #1',
  rank_into_top3: '↑ Top 3',
  rank_loses_top3: '↓ Top 3',
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  // Spanish short month: "15 mar"
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function EloChart({ data, rankEvents = [] }: EloChartProps) {
  if (data.length < 2) return null;
  const minElo = Math.min(...data.map((d) => d.elo));
  const maxElo = Math.max(...data.map((d) => d.elo));
  const padding = 40;

  // Build a lookup so we can attach dot Y values precisely (using the elo from the matching data point).
  const eloByDate = new Map(data.map((d) => [d.date, d.elo]));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 30, right: 15, left: -15, bottom: 0 }}>
        <defs>
          <linearGradient id="eloGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={shortDate}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis
          domain={[minElo - padding, maxElo + padding]}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: '12px',
            border: 'none',
            boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
            fontSize: 12,
          }}
          formatter={(value) => [`${value} ELO`, '']}
          labelFormatter={(label) => shortDate(String(label))}
          cursor={{ stroke: '#16a34a', strokeWidth: 1, strokeDasharray: '4 4' }}
        />
        <ReferenceLine
          y={1500}
          stroke="#e5e7eb"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{ value: '1500', position: 'insideRight', fontSize: 10, fill: '#d1d5db' }}
        />
        <Area
          type="monotone"
          dataKey="elo"
          stroke="#16a34a"
          strokeWidth={2.5}
          fill="url(#eloGradient)"
          dot={false}
          activeDot={{ r: 5, fill: '#16a34a', stroke: 'white', strokeWidth: 2 }}
        />
        {rankEvents.map((re, idx) => {
          const y = eloByDate.get(re.recordedAt);
          if (y === undefined) return null;
          return (
            <ReferenceDot
              key={`rank-${idx}`}
              x={re.recordedAt}
              y={y}
              r={6}
              fill="#facc15"
              stroke="white"
              strokeWidth={2}
              label={{ value: RANK_DOT_LABELS[re.type], position: 'top', fontSize: 10, fontWeight: 700, fill: '#a16207' }}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}
