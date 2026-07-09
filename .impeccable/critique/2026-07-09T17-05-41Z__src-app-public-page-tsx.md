---
target: Home + Rankings públicos
total_score: 30
p0_count: 1
p1_count: 2
timestamp: 2026-07-09T17-05-41Z
slug: src-app-public-page-tsx
---
# Critique: Home + Rankings (público). Method: dual-agent. Detector: limpio (2 falsos positivos en comentarios).
## 30/40 (Good)
1:3 (sin timestamp de jornada) 2:4 3:3 (sin salto a tu posición) 4:2 (emoji vs lucide; podio con destinos mixtos) 5:3 6:3 (Forma oculta en móvil) 7:2 (sin búsqueda/orden) 8:4 9:3 10:3 (Elo nunca se explica)
## Issues
- [P0] El ranking no sabe quién eres: sin fila destacada ni "Tu posición #N ▲Δ" — el momento central del producto (¿he subido?) obliga a buscarse a mano.
- [P1] El ranking es tabla, no jornada: falta tira "Movimientos de la jornada" (detectRankChanges ya existe para el feed del home).
- [P1] hide-sm amputa Forma/V–D justo en el móvil (la superficie North Star).
- [P2] Doble iconografía (emoji funcional vs lucide) y afordancia inconsistente del podio.
- [P3] Hero = ident con 3 count-ups lima (Un-Solo-Rótulo borderline); abrir con el último resultado.
## Fuerte: sistema tipográfico disciplinado, podio, micro-copy humano.
