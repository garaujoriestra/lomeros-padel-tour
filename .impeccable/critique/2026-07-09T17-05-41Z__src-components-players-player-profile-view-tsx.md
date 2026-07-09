---
target: Perfil de jugador
total_score: 24
p0_count: 1
p1_count: 2
timestamp: 2026-07-09T17-05-41Z
slug: src-components-players-player-profile-view-tsx
---
# Critique: Perfil de jugador (ficha de retransmisión). Method: dual-agent. Detector: limpio.
## 24/40 (Acceptable)
1:3 (tooltip "P4" jerga) 2:3 (3ª persona en /me) 3:1 (sin volver — fix en curso — ni compartir) 4:2 (lima en ~6 sitios; win rate x3) 5:3 (Elo 1500 por defecto parece ganado) 6:3 7:2 (sin compartir) 8:2 9:3 10:2 (gestos sin señalizar)
## Issues
- [P0] Una "ficha de retransmisión" que no se puede retransmitir: sin acción de compartir (Web Share) en el hero.
- [P1] Volver (aplicado en esta rama).
- [P1] Un-Solo-Rótulo violado: lima en Elo, #rank, editar, racha, hitos y logros a la vez.
- [P2] Win rate/V-D repetido hasta 3 veces (header grid + card + caption).
- [P2] Estado Riley (0 partidos): Elo 1500 mostrado como real + muro de 15 logros grises — primera impresión desmoralizante.
- [P3] Tooltip "P{index}"; voz en 3ª persona en el propio perfil.
## Fuerte: hero Elo broadcast (CountUp+Delta), EloChart narrativo con hitos, renderizado condicional disciplinado.
