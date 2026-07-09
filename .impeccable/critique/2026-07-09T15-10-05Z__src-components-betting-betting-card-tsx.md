---
target: La Timba (betting card + cartera)
total_score: 29
p0_count: 1
p1_count: 2
timestamp: 2026-07-09T15-10-05Z
slug: src-components-betting-betting-card-tsx
---
# Critique: La Timba (betting-card + redeem + wallet)
Method: dual-agent (A: design review · B: detector). Detector: clean (0 findings). Browser overlay: not attempted (no seeded dev server).

## Heuristics: 29/40 (Good)
1 Visibilidad 3 (botón sin estado loading visible) · 2 Mundo real 3 (fichas/tokens/tk) · 3 Control 4 (cancelar+refund) · 4 Consistencia 2 (cartera con lenguaje de cuota fija x{odds} exacta siendo pari-mutuel) · 5 Prevención 3 (botón muerto sin motivo visible) · 6 Reconocimiento 3 · 7 Eficiencia 3 (sin chips de importe) · 8 Minimalismo 3 (sin jerarquía; pago no protagonista) · 9 Recuperación 3 (solo toasts) · 10 Ayuda 2 (pari-mutuel en una nota al pie)

## Priority issues
- [P0] Apostar (gastar fichas) es 1 tap sin confirmación ni preview de saldo restante, mientras canjear premio tiene Dialog: protección invertida. Fix: preview inline "apostarás X · te quedan Y" + estado confirmando/loading en el botón + aviso de sustitución de apuesta previa.
- [P1] Moneda con 3 nombres: fichas (card) / tokens / tk (cartera, premios). Unificar en "fichas".
- [P1] Cartera "Apuestas abiertas": x{odds} exacto y "Equipo 1" contradicen el modelo pari-mutuel del card. Marcar ≈ y alinear vocabulario.
- [P2] Sin jerarquía: promover el pago estimado a display type; degradar footnotes.
- [P2] Marcador exacto siempre abierto: colapsar tras toggle (progressive disclosure; >4 opciones simultáneas).
- [Riley] noPool calculado pero nunca renderizado (bote vacío muestra pago engañoso); importe fuera de rango deshabilita sin mensaje; segunda apuesta sustituye sin avisar.

## Strengths
Reversibilidad (cancelar+refund), cero urgencia de casino, UI condicional según rol en el partido.
