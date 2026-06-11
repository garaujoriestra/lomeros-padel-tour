'use client';

import { useEffect, useRef } from 'react';

/** Número que cuenta desde 0 hasta `value` al montar (estilo marcador). */
export function CountUp({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !ref.current) return;
    started.current = true;
    const t0 = performance.now();
    const dur = 800;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      if (ref.current) ref.current.textContent = String(Math.round(value * e));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);
  return (
    <span ref={ref} className={className} style={style}>
      {value}
    </span>
  );
}
