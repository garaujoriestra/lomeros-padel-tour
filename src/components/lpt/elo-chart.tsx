'use client';

import { useEffect, useRef, useState } from 'react';

export interface EloMilestone {
  index: number;
  label: string;
}

/** Gráfica de evolución del Elo con hitos y tooltip (estilo broadcast). */
export function EloChart({ data, milestones = [], height = 200 }: { data: number[]; milestones?: EloMilestone[]; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  if (data.length < 2) return null;

  const pad = { l: 40, r: 14, t: 16, b: 22 };
  const min = Math.min(...data, 1500) - 12;
  const max = Math.max(...data, 1500) + 12;
  const X = (i: number) => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b);
  const line = data.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
  const area = `${pad.l},${Y(data[0])} ${line} ${X(data.length - 1)},${height - pad.b} ${pad.l},${height - pad.b}`;
  // Descarta líneas de grid cuya etiqueta quedaría pegada a otra (p. ej. 1498 vs 1500).
  const gridVals = [1500, max - 10, min + 10].reduce<number[]>((acc, v) => {
    if (acc.every((u) => Math.abs(Y(u) - Y(v)) > 14)) acc.push(v);
    return acc;
  }, []);
  const pathLen = 1600;
  const hoverMilestone = hover != null ? milestones.find((m) => m.index === hover) : undefined;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = (e.clientX - r.left) * (w / r.width);
          const i = Math.max(0, Math.min(data.length - 1, Math.round(((px - pad.l) / (w - pad.l - pad.r)) * (data.length - 1))));
          setHover(i);
        }}
      >
        {gridVals.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} stroke="var(--line)" strokeWidth="1" strokeDasharray={v === 1500 ? '4 4' : 'none'} />
            <text x={pad.l - 7} y={Y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-3)" fontWeight="600">
              {Math.round(v)}
            </text>
          </g>
        ))}
        <polygon points={area} fill="var(--acc)" opacity="0.09" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--acc)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={pathLen}
          strokeDashoffset={pathLen}
          style={{ animation: 'chartDraw 1.1s cubic-bezier(0.4,0,0.2,1) forwards' }}
        />
        {milestones.map(
          (m, k) =>
            m.index < data.length && (
              <circle key={k} cx={X(m.index)} cy={Y(data[m.index])} r="5.5" fill="var(--acc)" stroke="var(--surface)" strokeWidth="2" />
            )
        )}
        {hover != null && (
          <g>
            <line x1={X(hover)} x2={X(hover)} y1={pad.t} y2={height - pad.b} stroke="var(--line-strong)" strokeWidth="1" />
            <circle cx={X(hover)} cy={Y(data[hover])} r="4.5" fill="var(--acc)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="chart-hint" style={{ left: `${(X(hover) / w) * 100}%`, top: Y(data[hover]) }}>
          {data[hover]} · P{hover}
          {hoverMilestone ? ` · ${hoverMilestone.label}` : ''}
        </div>
      )}
    </div>
  );
}
