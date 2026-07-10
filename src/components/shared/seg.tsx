'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Segmented control con indicador deslizante: la píldora activa se desliza
 * entre opciones (continuidad espacial) en vez de saltar de fondo.
 * El indicador se mide del botón activo (los labels tienen anchos distintos)
 * y se recoloca también al redimensionar. El primer render lo pinta ya en su
 * sitio (useLayoutEffect), así que no hay animación de entrada.
 */
export function Seg<K extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [K, string])[];
  value: K;
  onChange: (k: K) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const on = root.querySelector<HTMLButtonElement>('button.on');
      if (on) setInd({ x: on.offsetLeft, w: on.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [value, options]);

  return (
    <div className="seg has-ind" ref={ref}>
      {ind && (
        <span
          className="seg-ind"
          aria-hidden="true"
          style={{ transform: `translateX(${ind.x}px)`, width: ind.w }}
        />
      )}
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          className={value === k ? 'on' : ''}
          aria-pressed={value === k}
          onClick={() => onChange(k)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
