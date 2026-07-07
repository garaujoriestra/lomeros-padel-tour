import { describe, it, expect } from 'vitest';
import { addDaysIso, editableWeeks, isEditableWeek, madridTodayIso, mondayOf, weekDates } from './weeks';

describe('mondayOf', () => {
  it('devuelve el propio lunes para un lunes', () => {
    expect(mondayOf('2026-07-06')).toBe('2026-07-06');
  });
  it('devuelve el lunes de la semana para jueves y domingo', () => {
    expect(mondayOf('2026-07-09')).toBe('2026-07-06'); // jueves
    expect(mondayOf('2026-07-12')).toBe('2026-07-06'); // domingo
  });
  it('cruza límites de mes', () => {
    expect(mondayOf('2026-08-01')).toBe('2026-07-27'); // sábado 1 de agosto
  });
});

describe('addDaysIso', () => {
  it('suma días cruzando mes y año', () => {
    expect(addDaysIso('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysIso('2026-12-29', 7)).toBe('2027-01-05');
    expect(addDaysIso('2026-07-06', -1)).toBe('2026-07-05');
  });
});

describe('editableWeeks / isEditableWeek', () => {
  it('la semana actual y la siguiente son editables; pasada y +2 no', () => {
    const today = '2026-07-09'; // jueves → semana 2026-07-06
    expect(editableWeeks(today)).toEqual(['2026-07-06', '2026-07-13']);
    expect(isEditableWeek('2026-07-06', today)).toBe(true);
    expect(isEditableWeek('2026-07-13', today)).toBe(true);
    expect(isEditableWeek('2026-06-29', today)).toBe(false);
    expect(isEditableWeek('2026-07-20', today)).toBe(false);
  });
});

describe('weekDates', () => {
  it('devuelve las 7 fechas L→D', () => {
    const dates = weekDates('2026-07-06');
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2026-07-06');
    expect(dates[6]).toBe('2026-07-12');
  });
});

describe('madridTodayIso', () => {
  it('formatea YYYY-MM-DD en Europe/Madrid (UTC 23:30 de verano = día siguiente en Madrid)', () => {
    expect(madridTodayIso(new Date('2026-07-06T23:30:00Z'))).toBe('2026-07-07');
    expect(madridTodayIso(new Date('2026-07-06T10:00:00Z'))).toBe('2026-07-06');
  });
  it('maneja también el horario de invierno (CET, UTC+1)', () => {
    expect(madridTodayIso(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-02');
    expect(madridTodayIso(new Date('2026-01-01T22:30:00Z'))).toBe('2026-01-01');
  });
});
