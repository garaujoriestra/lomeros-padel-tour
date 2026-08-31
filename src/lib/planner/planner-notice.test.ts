import { describe, expect, it } from 'vitest';
import { hasNewSlots } from './slots';
import { buildPlannerAvailabilityNotification } from '@/lib/push/notifications';

describe('hasNewSlots', () => {
  it('pintar en un día vacío es disponibilidad nueva', () => {
    expect(hasNewSlots([], [1200, 1230, 1260])).toBe(true);
  });

  it('añadir un tramo a lo que ya había es disponibilidad nueva', () => {
    expect(hasNewSlots([1200, 1230, 1260], [1200, 1230, 1260, 1290])).toBe(true);
  });

  it('borrar disponibilidad NO avisa', () => {
    expect(hasNewSlots([1200, 1230, 1260], [1200, 1230])).toBe(false);
    expect(hasNewSlots([1200, 1230, 1260], [])).toBe(false);
  });

  it('guardar lo mismo NO avisa (el autoguardado reenvía sin cambios)', () => {
    expect(hasNewSlots([1200, 1230, 1260], [1200, 1230, 1260])).toBe(false);
  });

  it('mover el bloque a otra hora SÍ avisa: hay horas que antes no ofrecía', () => {
    expect(hasNewSlots([1200, 1230, 1260], [1320, 1350, 1380])).toBe(true);
  });
});

// day: 0=lunes … 6=domingo. Los minutos son desde medianoche (1140 = 19:00).
const base = {
  actorName: 'Marcos',
  groupId: 'lomeros',
  playerId: 'pl7',
  weekStart: '2026-08-31',
  isNextWeek: false,
  basePath: '' as const,
};

describe('buildPlannerAvailabilityNotification', () => {
  it('sin días marcados no hay nada que anunciar', () => {
    expect(buildPlannerAvailabilityNotification({ ...base, days: [] })).toBeNull();
  });

  it('un día con un tramo: día abreviado y horas', () => {
    const p = buildPlannerAvailabilityNotification({
      ...base,
      days: [{ day: 3, ranges: [{ startMin: 1140, endMin: 1260 }] }],
    });
    expect(p?.title).toBe('📅 Marcos ha marcado su disponibilidad');
    expect(p?.body).toBe('Esta semana · Jue 19:00–21:00');
  });

  it('un día con dos tramos: los une con «y»', () => {
    const p = buildPlannerAvailabilityNotification({
      ...base,
      days: [{ day: 3, ranges: [{ startMin: 720, endMin: 840 }, { startMin: 1140, endMin: 1260 }] }],
    });
    expect(p?.body).toBe('Esta semana · Jue 12:00–14:00 y 19:00–21:00');
  });

  it('un día con tres o más tramos: resume el recuento en vez de encadenar horas', () => {
    const p = buildPlannerAvailabilityNotification({
      ...base,
      days: [{
        day: 3,
        ranges: [
          { startMin: 600, endMin: 690 },
          { startMin: 720, endMin: 840 },
          { startMin: 1140, endMin: 1260 },
        ],
      }],
    });
    expect(p?.body).toBe('Esta semana · Jue · 3 tramos');
  });

  it('dos o tres días: los lista con coma y «y» final', () => {
    const days = [1, 3, 5].map((day) => ({ day, ranges: [{ startMin: 1140, endMin: 1260 }] }));
    expect(buildPlannerAvailabilityNotification({ ...base, days })?.body)
      .toBe('Esta semana · Mar, Jue y Sáb');
    expect(buildPlannerAvailabilityNotification({ ...base, days: days.slice(0, 2) })?.body)
      .toBe('Esta semana · Mar y Jue');
  });

  it('cuatro días o más: solo el recuento', () => {
    const days = [0, 1, 3, 4, 5].map((day) => ({ day, ranges: [{ startMin: 1140, endMin: 1260 }] }));
    expect(buildPlannerAvailabilityNotification({ ...base, days })?.body)
      .toBe('Esta semana · 5 días marcados');
  });

  it('los días se ordenan de lunes a domingo aunque lleguen desordenados', () => {
    const days = [5, 1, 3].map((day) => ({ day, ranges: [{ startMin: 1140, endMin: 1260 }] }));
    expect(buildPlannerAvailabilityNotification({ ...base, days })?.body)
      .toBe('Esta semana · Mar, Jue y Sáb');
  });

  it('la semana siguiente lo dice y lleva ?week= en la URL', () => {
    const p = buildPlannerAvailabilityNotification({
      ...base,
      isNextWeek: true,
      weekStart: '2026-09-07',
      days: [{ day: 3, ranges: [{ startMin: 1140, endMin: 1260 }] }],
    });
    expect(p?.body).toBe('Próxima semana · Jue 19:00–21:00');
    expect(p?.url).toBe('/planificador?week=2026-09-07');
  });

  it('la semana actual apunta al planificador sin parámetros', () => {
    const p = buildPlannerAvailabilityNotification({
      ...base,
      days: [{ day: 3, ranges: [{ startMin: 1140, endMin: 1260 }] }],
    });
    expect(p?.url).toBe('/planificador');
  });

  it('un grupo que no es el de la raíz lleva su basePath', () => {
    const p = buildPlannerAvailabilityNotification({
      ...base,
      groupId: 'padel-jueves',
      basePath: '/g/padel-jueves',
      days: [{ day: 3, ranges: [{ startMin: 1140, endMin: 1260 }] }],
    });
    expect(p?.url).toBe('/g/padel-jueves/planificador');
  });

  it('el tag agrupa por grupo, semana y jugador: un aviso reemplaza al anterior', () => {
    const p = buildPlannerAvailabilityNotification({
      ...base,
      days: [{ day: 3, ranges: [{ startMin: 1140, endMin: 1260 }] }],
    });
    expect(p?.tag).toBe('planner-lomeros-2026-08-31-pl7');
  });
});
