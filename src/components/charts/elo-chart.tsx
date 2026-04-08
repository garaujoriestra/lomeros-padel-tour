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
} from 'recharts';

interface EloChartProps {
  data: { partido: number; elo: number }[];
}

export function EloChart({ data }: EloChartProps) {
  const minElo = Math.min(...data.map((d) => d.elo));
  const maxElo = Math.max(...data.map((d) => d.elo));
  const padding = 40;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
        <defs>
          <linearGradient id="eloGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="partido"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `P${v}`}
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
          labelFormatter={(label) => `Partido #${label}`}
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
      </AreaChart>
    </ResponsiveContainer>
  );
}
