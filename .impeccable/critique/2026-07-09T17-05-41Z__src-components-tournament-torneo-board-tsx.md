---
target: Torneos y pozos públicos
total_score: 26
p0_count: 1
p1_count: 2
timestamp: 2026-07-09T17-05-41Z
slug: src-components-tournament-torneo-board-tsx
---
# Critique: Torneos/Pozos públicos. Method: dual-agent. Detector: limpio.
## 26/40 (Acceptable)
1:2 (● En juego sobre-dispara: todo partido listo parece vivo) 2:4 3:1 (sin volver — fix en curso; scroll secuestrado) 4:3 5:3 6:2 (bracket con doble eje de scroll) 7:3 8:3 9:2 (estados vacíos fríos) 10:3
## Issues
- [P0] "En juego" marca todo partido jugable: el espectador no sabe qué pista está en directo. Reservar ● para la ronda viva; el resto "A continuación" en neutro.
- [P1] Bracket móvil con scroll en 2 ejes (horizontal + max-h interno) — la superficie menos legible en vivo; pager/acordeón de rondas en móvil.
- [P1] El campeón queda al final del scroll horizontal: banda campeón a ancho completo arriba cuando la final termina (peak-end).
- [P2] Espectador sin sesión no ve "ahora en pista / a continuación" (gated por myPlayerId).
- [P3] truncate sin escape en nombres largos (title= / wrap 2 líneas); verde --win significa 3 cosas a la vez.
## Fuerte: narrativa de dominio (suben/bajan, descansa), sistema broadcast intacto, wayfinding "míos" + autocentrado.
