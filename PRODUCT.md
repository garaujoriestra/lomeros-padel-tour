# Product

## Register

product

## Users

Un grupo de amigos («Lomeros») que juega pádel 2vs2 varias veces por semana, y a medio plazo otros grupos iguales (la app es multi-tenant y hay estrategia de comercialización). Perfil no técnico. **Contexto de uso dominante: móvil, como PWA instalada** — se consulta el ranking al terminar un partido, se apunta disponibilidad desde el sofá, se apuesta en La Timba desde el bar. El escritorio existe pero es secundario (admin registrando resultados con calma).

El trabajo a hacer: saber quién va ganando la temporada, cuándo puede jugar la peña, registrar el resultado de hoy y picarse con las apuestas.

## Product Purpose

LPT es el ranking oficial del grupo: Elo 2vs2, historial de partidos, torneos y pozos, apuestas internas con fichas (La Timba), logros y planificador semanal de disponibilidad. Existe para convertir los partidos sueltos del grupo en una competición continua con narrativa. Éxito = el grupo lo consulta solo, cada semana, sin que nadie lo pida.

## Brand Personality

**Broadcast deportivo.** La app trata la jornada de la peña como una retransmisión profesional de pádel: marcadores grandes, stats con dramatismo, podios, escudo de club. Tres palabras: **competitivo, televisivo, orgulloso**. La emoción objetivo es la de ver tu nombre en el marcador de la Pista Central — el grupo se toma la coña en serio.

## Anti-references

- **SaaS corporativo genérico**: dashboard azul/gris de plantilla, cards idénticas con icono+título+texto, gradientes morados, hero-metrics. LPT nunca debe parecer una herramienta interna de empresa.
- **Casa de apuestas real (Bet365 y similares)**: aunque exista La Timba, prohibido el olor a casino online — densidad agresiva, cuotas parpadeando, urgencia, rojo/verde estridente por todas partes. La Timba es una porra entre amigos, no gambling.
- **Excel con estilos**: tablas infinitas sin jerarquía. Los datos deben contar la jornada (quién sube, quién cae, qué racha hay), no solo listarse.

## Design Principles

1. **La jornada es una retransmisión.** Cada pantalla responde «¿qué ha pasado en la liga?» con jerarquía de broadcast: el dato protagonista en display, el contexto en soporte. Si una vista parece un listado administrativo, está mal enfocada.
2. **El móvil es la pista.** Todo se diseña primero para la PWA instalada: targets de 44px, safe-areas, gestos táctiles con feedback, teclado correcto en cada input. El escritorio hereda, no al revés.
3. **Familiaridad ganada.** Registro product: componentes estándar que desaparecen en la tarea (formularios, diálogos, navegación). La personalidad vive en el display type, el lima y los datos — no en reinventar controles.
4. **Un solo acento.** El lima (#c8f03c) señala lo importante: acción primaria, líder, selección. Su escasez es lo que le da autoridad; si está en todas partes no señala nada.
5. **Datos con drama, no decoración.** Animación y color solo cuando transmiten estado o resultado (subida de Elo, victoria, racha). Nada de motion ornamental en flujos repetidos.

## Accessibility & Inclusion

Estándar razonable sin certificación formal: contraste AA en texto, targets táctiles ≥44px, `prefers-reduced-motion` respetado (kill-switch global + JS), focus visible en todo lo interactivo, zoom nunca deshabilitado, inputs a ≥16px (anti-zoom iOS). UI íntegramente en español (es-ES, Europe/Madrid).
