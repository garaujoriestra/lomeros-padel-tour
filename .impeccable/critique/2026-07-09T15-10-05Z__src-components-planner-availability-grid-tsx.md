---
target: Planificador semanal
total_score: 19
p0_count: 2
p1_count: 1
timestamp: 2026-07-09T15-10-05Z
slug: src-components-planner-availability-grid-tsx
---
# Critique: Planificador semanal (availability-grid + week-summary)
Method: dual-agent (A: design review · B: detector). Detector: clean (0 findings). Browser overlay: not attempted (no seeded dev server).

## Heuristics: 19/40 (Poor)
1 Visibilidad 2 (dirty solo en el botón) · 2 Mundo real 3 · 3 Control 1 (cambiar semana destruye lo pintado) · 4 Consistencia 3 (sin tabular-nums) · 5 Prevención 3 (regla 1,5h solo se aprende fallando) · 6 Reconocimiento 1 (sin leyenda para 4 estados) · 7 Eficiencia 2 · 8 Minimalismo 2 («Excel con estilos») · 9 Recuperación 2 · 10 Ayuda 0

## Priority issues
- [P0] Pintado sin guardar se destruye al navegar (links de semana, cierre): guard beforeunload + intercepción con confirmación propia; idealmente autosave.
- [P0] Sin leyenda: verde tú / heat otros(nº) / rojo bloque <1,5h — añadir tira de leyenda que además enseña la regla (funde el P1 de la regla).
- [P1] Dirty invisible: botón "Guardar (N días)" + marcar cabeceras de día sucias.
- [P2] Payoff (Quién puede) frío y bajo el fold: acercar contador de coincidencias vivo a la parrilla.
- [P3] Excel con estilos: tabular-nums en counts, columna de hoy destacada, divisores de franjas; celdas <button> focusables sin ruta de teclado (wire keyboard o quitar focusabilidad + alternativa).

## Strengths
Heatmap de convergencia (la gran idea), máquina de estados táctil cuidadosa, regla 1,5h honesta + empty state cálido.
