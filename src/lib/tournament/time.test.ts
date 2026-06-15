import { describe, it, expect } from 'vitest';
import { hhmmToMin, minToHHMM } from './time';

describe('time helpers', () => {
  it('convierte HH:MM a minutos desde medianoche', () => {
    expect(hhmmToMin('17:00')).toBe(17 * 60);
    expect(hhmmToMin('18:30')).toBe(18 * 60 + 30);
    expect(hhmmToMin('00:00')).toBe(0);
  });

  it('convierte minutos a HH:MM con cero a la izquierda', () => {
    expect(minToHHMM(17 * 60)).toBe('17:00');
    expect(minToHHMM(18 * 60 + 30)).toBe('18:30');
    expect(minToHHMM(9 * 60 + 5)).toBe('09:05');
  });

  it('es ida y vuelta', () => {
    expect(minToHHMM(hhmmToMin('20:45'))).toBe('20:45');
  });
});
