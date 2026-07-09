'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PLANNER } from '@/lib/planner/config';
import { allSlotStarts, formatMin } from '@/lib/planner/slots';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DRAG_THRESHOLD_PX = 12; // un tap con micro-deslizamiento no debe pintar la celda vecina

// Celdas en bloques de menos de minBlockSlots consecutivas (inválidas para guardar).
function invalidCells(day: Set<number>): Set<number> {
  const sorted = [...day].sort((a, b) => a - b);
  const bad = new Set<number>();
  let run: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    run.push(sorted[i]);
    const nextConsecutive = i + 1 < sorted.length && sorted[i + 1] === sorted[i] + PLANNER.slotMinutes;
    if (!nextConsecutive) {
      if (run.length < PLANNER.minBlockSlots) for (const s of run) bad.add(s);
      run = [];
    }
  }
  return bad;
}

// Cuadrícula pintable de disponibilidad semanal (slots de 30 min, L→D).
// Pintar con tap/drag; los bloques de <3 celdas se marcan en rojo y bloquean
// el guardado (el servidor revalida igualmente). Guardar hace un PUT por día
// modificado y refresca la página (coincidencias server-rendered).
export function AvailabilityGrid({
  title,
  dates,
  initial,
  week,
  g,
  endpoint,
  counts,
}: {
  title: string;
  dates: string[];      // 7 fechas ISO L→D (cabecera)
  initial: number[][];  // slots por día 0..6
  week: string;         // lunes YYYY-MM-DD
  g?: string;           // slug del grupo (solo bajo /g/[slug])
  endpoint: '/api/planner/availability';
  counts: number[][];   // counts[day][row] = cuántos OTROS pueden en ese slot (mapa de calor)
}) {
  const router = useRouter();
  const [byDay, setByDay] = useState<Set<number>[]>(() => initial.map((d) => new Set(d)));
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const paintMode = useRef<'paint' | 'erase' | null>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  // Táctil: el toggle se decide en pointerup (tap confirmado); si el gesto
  // deriva en scroll, el navegador emite pointercancel y no se pinta nada.
  const touchPending = useRef<{ day: number; min: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const stop = () => {
      paintMode.current = null;
      dragFrom.current = null;
      dragging.current = false;
      touchPending.current = null;
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);

  const starts = useMemo(allSlotStarts, []);
  const badByDay = byDay.map(invalidCells);
  const hasInvalid = badByDay.some((b) => b.size > 0);

  function applyCell(day: number, min: number, mode: 'paint' | 'erase') {
    if (byDay[day].has(min) === (mode === 'paint')) return; // ya está así: evita renders por pointermove
    setByDay((prev) => {
      const next = prev.map((s, i) => (i === day ? new Set(s) : s));
      if (mode === 'paint') next[day].add(min);
      else next[day].delete(min);
      return next;
    });
    setDirty((prev) => new Set(prev).add(day));
  }

  function startPaint(e: React.PointerEvent, day: number, min: number) {
    // Táctil: no pintar aún — con touch-action:pan-y el dedo puede estar
    // empezando un scroll. Se registra la celda y se resuelve en pointerup.
    if (e.pointerType === 'touch') {
      touchPending.current = { day, min, x: e.clientX, y: e.clientY };
      return;
    }
    // Sin captura de puntero: el drag debe disparar pointerenter en otras celdas.
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragFrom.current = { x: e.clientX, y: e.clientY };
    dragging.current = false;
    const mode = byDay[day].has(min) ? 'erase' : 'paint';
    paintMode.current = mode;
    applyCell(day, min, mode);
  }

  // Solo pinta por arrastre si el puntero se ha movido de verdad (umbral): un tap
  // que resbala 1-2px ya no selecciona la celda de al lado. Solo ratón/lápiz.
  function continuePaint(e: React.PointerEvent, day: number, min: number) {
    if (e.pointerType === 'touch') {
      // Si el dedo se mueve más del umbral es un scroll: descarta el tap.
      if (
        touchPending.current &&
        Math.hypot(e.clientX - touchPending.current.x, e.clientY - touchPending.current.y) >= DRAG_THRESHOLD_PX
      ) {
        touchPending.current = null;
      }
      return;
    }
    if (!paintMode.current || !dragFrom.current) return;
    if (!dragging.current) {
      if (Math.hypot(e.clientX - dragFrom.current.x, e.clientY - dragFrom.current.y) < DRAG_THRESHOLD_PX) return;
      dragging.current = true;
    }
    applyCell(day, min, paintMode.current);
  }

  // Tap táctil confirmado: el dedo levantó sin moverse → toggle de la celda.
  function endTouchTap(e: React.PointerEvent, day: number, min: number) {
    if (e.pointerType !== 'touch') return;
    const p = touchPending.current;
    touchPending.current = null;
    if (!p || p.day !== day || p.min !== min) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= DRAG_THRESHOLD_PX) return;
    applyCell(day, min, byDay[day].has(min) ? 'erase' : 'paint');
  }

  async function save() {
    setSaving(true);
    try {
      for (const day of [...dirty]) {
        const slots = [...byDay[day]].sort((a, b) => a - b);
        const res = await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ g, week, day, slots }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? 'Error al guardar');
        }
      }
      setDirty(new Set());
      toast.success('Disponibilidad guardada');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="lpt-card" style={{ padding: 14 }}>
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: 10 }}>
        <h2 className="sec-title" style={{ fontSize: 17 }}>{title}</h2>
        <button
          className="lpt-btn primary"
          style={{ minHeight: 34, padding: '6px 14px' }}
          onClick={save}
          disabled={saving || hasInvalid || dirty.size === 0}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {hasInvalid && (
        <p className="small" style={{ color: 'var(--loss)', margin: '0 0 8px' }}>
          Los bloques deben ser de mínimo 1,5h (3 casillas seguidas).
        </p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '52px repeat(7, 1fr)',
          gap: 2,
          // pan-y: el scroll vertical de la página sigue funcionando sobre la
          // cuadrícula (en móvil ocupa toda la pantalla y bloquearlo la hacía
          // imposible de recorrer). En táctil se pinta con tap, no con drag.
          touchAction: 'pan-y',
          userSelect: 'none',
        }}
      >
        <div />
        {dates.map((d, i) => (
          <div key={d} className="small muted" style={{ textAlign: 'center', fontWeight: 600 }}>
            {DAY_LABELS[i]} {Number(d.slice(8))}
          </div>
        ))}
        {starts.map((min, row) => (
          <Fragment key={min}>
            <div className="small muted" style={{ fontSize: 11, textAlign: 'right', paddingRight: 6, lineHeight: '28px' }}>
              {formatMin(min)}
            </div>
            {dates.map((_, day) => {
              const on = byDay[day].has(min);
              const bad = badByDay[day].has(min);
              const n = counts[day]?.[row] ?? 0;
              // Mapa de calor: cuanta más gente puede en ese slot, más intenso el fondo.
              const heat = n > 0
                ? `color-mix(in oklab, var(--win) ${Math.min(12 + n * 10, 45)}%, transparent)`
                : 'transparent';
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${DAY_LABELS[day]} ${formatMin(min)}`}
                  data-day={day}
                  data-min={min}
                  // Pintado solo con puntero (tap/drag): sin ruta de teclado a propósito —
                  // una cuadrícula de 32×7 celdas no es operable razonablemente por teclado.
                  onPointerDown={(e) => { e.preventDefault(); startPaint(e, day, min); }}
                  onPointerEnter={(e) => continuePaint(e, day, min)}
                  onPointerMove={(e) => continuePaint(e, day, min)}
                  onPointerUp={(e) => endTouchTap(e, day, min)}
                  style={{
                    height: 28,
                    borderRadius: 4,
                    border: '1px solid color-mix(in oklab, currentcolor 14%, transparent)',
                    background: on ? (bad ? 'var(--loss)' : 'var(--win)') : heat,
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 10,
                    fontWeight: 600,
                    color: on ? '#fff' : 'inherit',
                  }}
                >
                  {n > 0 ? n : ''}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
