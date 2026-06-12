import { describe, it, expect } from 'vitest';
import {
  buildResultNotification,
  buildAchievementNotification,
  buildReminderNotification,
  buildBetSettledNotification,
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

describe('buildBetSettledNotification', () => {
  it('apuesta ganada: muestra premio neto y enlace al partido', () => {
    const p = buildBetSettledNotification('won', 50, 115, 'Pepe/Juan vs Luis/Edu', 'm1');
    expect(p.title).toContain('Acertaste');
    expect(p.body).toContain('+115');
    expect(p.body).toContain('Pepe/Juan vs Luis/Edu');
    expect(p.url).toBe('/matches/m1');
  });
  it('apuesta perdida: muestra lo perdido', () => {
    const p = buildBetSettledNotification('lost', 40, 0, 'A/B vs C/D', 'm2');
    expect(p.title).toContain('Fallaste');
    expect(p.body).toContain('-40');
  });
  it('apuesta devuelta', () => {
    const p = buildBetSettledNotification('refunded', 40, 0, 'A/B vs C/D', 'm3');
    expect(p.title).toContain('devuelta');
    expect(p.body).toContain('+40');
  });
});
