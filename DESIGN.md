---
name: Lomeros Padel Tour
description: Ranking Elo, partidos y apuestas de la peña con estética de retransmisión deportiva.
colors:
  primary: "#c8f03c"
  on-primary: "oklch(0.2 0.03 140)"
  accent-text: "color-mix(in oklab, #c8f03c 55%, oklch(0.21 0.03 190))"
  win: "oklch(0.62 0.16 150)"
  loss: "oklch(0.6 0.18 25)"
  warn: "oklch(0.72 0.14 80)"
  bg: "oklch(0.962 0.008 160)"
  surface: "oklch(0.99 0.004 140)"
  surface-2: "oklch(0.945 0.01 160)"
  line: "oklch(0.89 0.012 165)"
  line-strong: "oklch(0.8 0.02 170)"
  ink: "oklch(0.21 0.03 190)"
  ink-2: "oklch(0.34 0.03 185)"
  ink-3: "oklch(0.52 0.025 180)"
typography:
  display:
    fontFamily: "Barlow Condensed, Archivo, Arial Narrow, sans-serif"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.015em"
  headline:
    fontFamily: "Barlow Condensed, Archivo, Arial Narrow, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.015em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    letterSpacing: "0.14em"
rounded:
  sm: "8px"
  md: "10px"
  card: "14px"
  xl: "20px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  section: "34px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
    height: "44px"
  badge:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
---

# Design System: Lomeros Padel Tour

## 1. Overview

**Creative North Star: "Pista Central"** (el nombre viene del propio código: *Dirección A · Pista Central (broadcast)*).

LPT trata la liga de la peña como una retransmisión deportiva profesional. La jerarquía es la de un marcador de televisión: números y nombres en condensada itálica mayúscula que gritan el resultado, soporte en una sans neutra que se aparta. La paleta es un verde de pista bajo focos — neutros verdosos fríos en oscuro y claro — con un único acento lima eléctrico que hace de rótulo luminoso: señala al líder, a la acción primaria y a nada más.

El sistema rechaza explícitamente tres cosas (de PRODUCT.md): el **SaaS corporativo genérico** (nada de dashboards azul/gris con cards de plantilla), la **casa de apuestas real** (La Timba es una porra entre amigos: cero urgencia de casino) y el **Excel con estilos** (los datos cuentan la jornada, no se listan). Es registro *product*: los controles son familiares y desaparecen en la tarea; la personalidad vive en el display type, el lima y el drama de los datos.

**Key Characteristics:**
- Tema dual con neutros verdosos (hue 160–190), nunca gris puro.
- Un solo acento (lima #c8f03c) con tinta oscura encima, jamás blanco.
- Display condensada itálica 800 uppercase para todo lo que "retransmite"; Archivo para todo lo que informa.
- Números siempre tabulares (`font-variant-numeric: tabular-nums`).
- Móvil PWA primero: bottom nav con safe-area, targets ≥44px, feedback táctil `:active` en todo.

## 2. Colors

Verde de pista bajo focos: neutros tintados hacia verde-azulado, un lima eléctrico como único rótulo, y un vocabulario semántico win/loss/warn.

### Primary
- **Lima Pista Central** (#c8f03c): la voz del sistema. Acción primaria, jugador líder, selección activa, la ficha de La Timba en el bottom nav. Siempre con **Tinta sobre lima** (oklch(0.2 0.03 140)) como texto encima.
- **Lima legible** (`--acc-text`, mezcla 55% lima + tinta en claro; lima puro en oscuro): la versión del acento que funciona como *texto* sobre superficies claras.

### Secondary
- **Verde victoria** (oklch(0.62 0.16 150)): deltas positivos, sets ganados, disponibilidad en el planificador.
- **Rojo derrota** (oklch(0.6 0.18 25)): deltas negativos, borrados, lesión, bancarrota. Es señal, no alarma de casino.
- **Ámbar aviso** (oklch(0.72 0.14 80)): estados intermedios (Δ Elo medio, pendientes).

### Neutral
- **Fondo pista** (claro oklch(0.962 0.008 160) / oscuro oklch(0.16 0.022 188)): el lienzo, siempre con 0.008–0.03 de chroma verdoso.
- **Superficie** y **Superficie-2** (surface/surface-2): cards y controles; segunda capa para segmented, badges y hover.
- **Tinta / Tinta-2 / Tinta-3** (ink/ink-2/ink-3): jerarquía de texto en tres pasos. Tinta-3 es para metadatos, nunca para párrafos largos.
- **Línea / Línea fuerte** (line/line-strong): bordes de 1px y separadores.

### Named Rules
**The Tinta-sobre-Lima Rule.** Texto blanco sobre el lima está prohibido (≈1.3:1). Sobre `--acc` va siempre `--on-acc`; como texto suelto, `--acc-text`. Sin excepciones.
**The Un-Solo-Rótulo Rule.** El lima ocupa ≤10% de cualquier pantalla. Si dos cosas compiten por él, una de las dos no lo lleva.

## 3. Typography

**Display Font:** Barlow Condensed 600–800 italic (fallback Archivo, Arial Narrow)
**Body Font:** Archivo (fallback ui-sans-serif, system-ui)
**Mono:** ui-monospace (solo placeholders técnicos)

**Character:** condensada itálica mayúscula para todo lo que retransmite (títulos de sección, Elo, posiciones, marcadores) sobre una grotesca neutra y muy legible para todo lo demás. El contraste entre ambas ES la marca.

### Hierarchy
- **Display** (800 italic uppercase, tamaño según contexto, line-height 1, tracking 0.015em): marcadores, Elo (24px), posiciones de ranking (21px), heros.
- **Headline** (`.sec-title`: 800 italic uppercase, 26px / 23px móvil): título de sección, acompañado de una regla horizontal (`.sec-rule`).
- **Body** (Archivo 400, 15.5px, lh 1.5): texto corriente. `.small` = 12.5px para soporte.
- **Label** (`.kicker`: 800, 11px, tracking 0.14em, uppercase, color tinta-3): etiquetas de bloque y metadatos.

### Named Rules
**The Broadcast-Type Rule.** La condensada itálica es solo para lo que marca resultado o identidad (números, nombres, títulos). Prohibida en labels de formulario, botones de texto corriente y párrafos.
**The Tabular Rule.** Todo número comparable (Elo, fichas, marcadores, deltas) lleva `tabular-nums` (`.num`).

## 4. Elevation

Híbrido suave: bordes de 1px (`--line`) definen las superficies; la sombra es ambiental y mínima en claro (`0 2px 8px oklch(0.3 0.03 180 / 0.07)`), y en oscuro se sustituye por realce interior + sombra profunda (`0 1px 0 white/4% inset, 0 12px 32px black/25%`) más un **glow lima** reservado a estados especiales (líder del podio, hover del botón primario).

### Shadow Vocabulary
- **Card** (`--card-shadow`): la única sombra estructural; viene con el token, no se inventa por componente.
- **Glow lima** (`0 0 24–38px color-mix(lima 15–40%)`): exclusivo de oscuridad y de momentos de protagonismo (podio, primario hover, ficha de La Timba activa).

### Named Rules
**The Borde-Primero Rule.** La profundidad la da el borde de 1px; la sombra acompaña. Nunca sombra dura sin borde.

## 5. Components

### Buttons
- **Shape:** píldora (`--r-pill: 999px`), min-height 44px.
- **Primary** (`.lpt-btn.primary`): fondo lima, texto tinta-sobre-lima, sin borde; hover con glow en oscuro.
- **Secondary** (`.lpt-btn`): superficie + borde línea; hover eleva 1px y endurece el borde.
- **Press feedback:** `:active { scale(0.97) }` (clase `.press` para botones ad-hoc); en táctil vía `@media (hover:none)`.
- **Icon button** (`.icon-btn`): 36px (40px en móvil), circular, borde línea.

### Chips
- **Badge** (`.lpt-badge`): píldora 11px 800, superficie-2 + borde; variantes `accent`/`win`/`loss` con fondo al 13–18% del color.
- **Status pill** (`.status-pill`): uppercase 10.5px con tracking; scheduled=lima, completed=neutro, injury=rojo.
- **Segmented** (`.seg`): filtros en píldora; el activo salta a superficie con micro-sombra. 44px en móvil.

### Cards / Containers
- **Corner Style:** 14px (`--r-card`); hero a 1.4×.
- **Background:** superficie + borde `--card-border` + `--card-shadow`.
- **Clickable:** hover eleva 2px (solo con hover real); en táctil, `:active scale(0.98)`.
- **Internal Padding:** `.card-pad` 18/20px (15/16 móvil).

### Inputs / Fields
- shadcn `Input`/`Select` sobre tokens (`--input`, `--ring`); base global fuerza ≥16px (anti-zoom iOS). Numéricos con `inputMode` correcto. Focus ring `--ring` (verde 0.7/0.12/128) en todo, incluidos componentes propios vía `:focus-visible`.

### Navigation
- **Topbar:** sticky, blur 12px, fondo al 86%, safe-area-top; marca con escudo + wordmark condensada (se oculta el wordmark <560px con sesión). Tabs píldora solo ≥760px.
- **Bottom nav (móvil):** fija, 5 columnas, blur 16px, safe-area-bottom, labels 10px 700; el activo lleva ceja lima superior.

### La Timba chip (signature)
La pestaña central del bottom nav es una **ficha de casino elevada**: círculo lima de 46px que sobresale de la barra, borde del color de la barra, sombra lima; al pulsarla escala a 0.92 y activa gana un anillo lima. Es el único elemento con licencia para ser teatral en el chrome.

## 6. Do's and Don'ts

### Do:
- **Do** usar `--on-acc` sobre lima y `--acc-text` como texto acento (The Tinta-sobre-Lima Rule).
- **Do** mantener targets táctiles ≥44px y feedback `:active` en todo lo pulsable (la app se usa como PWA instalada).
- **Do** `tabular-nums` en cualquier número comparable.
- **Do** neutros con chroma verdoso (0.004–0.03, hue 140–190); jamás gris puro `#888`.
- **Do** respetar `prefers-reduced-motion` (kill-switch global + checks JS en animaciones rAF).
- **Do** en móvil, apilar comparativas lado-a-lado (equipos, parejas) en vertical antes de truncar nombres.

### Don't:
- **Don't** parecer un **SaaS corporativo genérico**: nada de gradientes morados, hero-metrics, cards idénticas icono+título+texto (anti-referencia de PRODUCT.md).
- **Don't** oler a **casa de apuestas real**: sin cuotas parpadeando, sin countdown agresivo, sin rojo/verde estridente por densidad (anti-referencia de PRODUCT.md).
- **Don't** hacer **Excel con estilos**: toda tabla necesita jerarquía (posición en display, delta con color, avatar) y una lectura de jornada (anti-referencia de PRODUCT.md).
- **Don't** usar la condensada itálica en labels, formularios o prosa.
- **Don't** `transition: all` — enumerar propiedades siempre.
- **Don't** más de un elemento lima protagonista por pantalla.
- **Don't** modales para captura de datos principal: los formularios de partido/resultado son páginas completas; el Dialog queda para confirmaciones cortas.
