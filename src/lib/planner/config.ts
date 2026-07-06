// Parámetros del planificador semanal. Las horas se manejan como minutos desde
// medianoche en hora local del grupo (Europe/Madrid); no se hace aritmética de
// zona horaria con los slots — solo madridTodayIso() consulta la TZ.
export const PLANNER = {
  slotMinutes: 30,   // tamaño de celda
  minBlockSlots: 3,  // bloque mínimo pintado = 1,5h (duración fija de partido)
  matchSlots: 3,     // ventana de partido = 3 slots
  dayStartMin: 480,  // 08:00 — primer slot del día
  dayEndMin: 1440,   // 24:00 — fin exclusivo (último slot empieza a las 23:30)
  minPlayers: 4,     // jugadores necesarios para «partido posible»
} as const;
