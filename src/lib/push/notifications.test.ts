import { describe, it, expect } from 'vitest';
import {
  buildResultNotification,
  buildAchievementNotification,
  buildReminderNotification,
} from './notifications';

describe('buildResultNotification', () => {
  it('muestra victoria y ELO positivo', () => {
    const p = buildResultNotification(true, 12.4, 'm1');
    expect(p.title).toContain('Victoria');
    expect(p.body).toContain('Ganaste');
    expect(p.body).toContain('+12');
    expect(p.url).toBe('/matches/m1');
  });

  it('muestra derrota y ELO negativo', () => {
    const p = buildResultNotification(false, -8.7, 'm2');
    expect(p.body).toContain('Perdiste');
    expect(p.body).toContain('-9');
  });
});

describe('buildAchievementNotification', () => {
  it('construye el texto desde el catálogo', () => {
    const p = buildAchievementNotification('first_win');
    expect(p).not.toBeNull();
    expect(p!.body).toContain('Primera victoria');
    expect(p!.title).toContain('🥇');
  });

  it('devuelve null para un id desconocido', () => {
    expect(buildAchievementNotification('no_existe')).toBeNull();
  });
});

describe('buildReminderNotification', () => {
  it('dice "Hoy" para reminder_day', () => {
    const p = buildReminderNotification('reminder_day', 'Club Padel', 'm3');
    expect(p.body).toContain('Hoy');
    expect(p.body).toContain('Club Padel');
    expect(p.url).toBe('/matches/m3');
  });

  it('dice "Mañana" para reminder_eve sin detalle', () => {
    const p = buildReminderNotification('reminder_eve', '', 'm4');
    expect(p.body).toContain('Mañana');
  });
});
