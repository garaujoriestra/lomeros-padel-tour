'use client';

import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

interface EloSparklineDatum {
  date: string;
  elo: number;
}

interface EloSparklineProps {
  data: EloSparklineDatum[];
  width?: number;
  height?: number;
}

export function EloSparkline({ data, width = 80, height = 28 }: EloSparklineProps) {
  if (data.length < 2) return null;
  const minElo = Math.min(...data.map((d) => d.elo));
  const maxElo = Math.max(...data.map((d) => d.elo));

  return (
    <div style={{ width, height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <YAxis hide domain={[minElo, maxElo]} />
          <Line
            type="monotone"
            dataKey="elo"
            stroke="#16a34a"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
