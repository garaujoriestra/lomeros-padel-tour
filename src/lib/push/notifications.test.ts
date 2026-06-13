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

  it('muestra el movimiento de posición con flecha cuando cambia', () => {
    const p = buildResultNotification(true, 12, 'm1', { before: 5, after: 3 });
    expect(p.body).toBe('Ganaste · ELO +12 · #5 → #3');
  });

  it('muestra solo la posición cuando no cambia de puesto', () => {
    const p = buildResultNotification(true, 12, 'm1', { before: 3, after: 3 });
    expect(p.body).toBe('Ganaste · ELO +12 · #3');
  });

  it('muestra solo la posición nueva si era su primer partido', () => {
    const p = buildResultNotification(true, 12, 'm1', { before: null, after: 7 });
    expect(p.body).toBe('Ganaste · ELO +12 · #7');
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
  it('incluye hora y lugar para reminder_day', () => {
    const p = buildReminderNotification('reminder_day', { time: '19:00', location: 'Club Padel' }, 'm3');
    expect(p.body).toBe('Hoy a las 19:00 · Club Padel');
    expect(p.url).toBe('/matches/m3');
  });

  it('incluye hora para reminder_eve', () => {
    const p = buildReminderNotification('reminder_eve', { time: '19:00', location: null }, 'm4');
    expect(p.body).toBe('Mañana a las 19:00');
  });

  it('sin hora: usa el texto genérico (partidos antiguos)', () => {
    const day = buildReminderNotification('reminder_day', { time: null, location: 'Club' }, 'm5');
    expect(day.body).toBe('Hoy juegas un partido · Club');
    const eve = buildReminderNotification('reminder_eve', {}, 'm6');
    expect(eve.body).toBe('Mañana tienes partido');
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
