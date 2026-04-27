# Mobile UX Overhaul — Lomeros Padel Tour

**Fecha:** 2026-04-27
**Estado:** Aprobado, pendiente de plan de implementación
**Alcance:** Repaso completo de la experiencia móvil de la app pública y del admin.

---

## Contexto y problema

La aplicación se usa mayoritariamente desde el móvil, pero hoy la experiencia móvil tiene problemas serios:

- **Bug crítico de navegación:** `src/components/shared/navbar.tsx` oculta los enlaces de navegación con `hidden md:flex` y no los reemplaza por nada en pantallas <768px. Los usuarios móviles **no pueden navegar** entre Inicio / Ranking / Parejas / Partidos / Info — solo ven el logo y el botón Admin.
- **Falta `viewport`** en `src/app/layout.tsx`, lo que provoca renderizado a 980px y zoom-out en algunos navegadores.
- **Cabeceras hero** (`text-4xl`, `p-8`, `rounded-3xl`) desbordan o exageran en móvil.
- **Tarjetas de partido** usan `grid-cols-[1fr_auto_1fr]` con `p-6`, lo que aplasta los nombres de los jugadores y los trunca a pocas letras cuando aparecen los marcadores set a set.
- **Cabecera del perfil de jugador** combina avatar 96px + nombre `text-3xl` en flex horizontal y stats en `grid-cols-4` — todo apretado en pantallas estrechas.
- **Tap targets pequeños** (botones admin a `px-3 py-1.5 text-xs` ≈ 28px de alto) por debajo de los 44px recomendados.
- **Admin sidebar** fija en `w-52` ocupa la mitad del viewport en móvil.

El alcance acordado (opción **B**) es un repaso completo: navegación, fundamentos globales, todas las páginas públicas y admin.

---

## Decisión de diseño: navegación

**Patrón elegido (opción A):** Bottom tab bar fija en móvil + barra superior reducida.

- En `<md`: barra superior solo con logo "LPT 🎾" + botón Admin (touch-friendly), y **tab bar fija abajo** con los 5 enlaces principales.
- En `≥md`: se mantiene la navbar superior horizontal actual; la tab bar inferior se oculta (`md:hidden`).

Razón: la mayoría de usuarios entran desde móvil y alternan rápidamente entre Ranking ↔ Partidos. El bottom tab bar es el patrón estándar en apps deportivas (Strava, Onefootball), permite operación a una mano y deja todos los destinos visibles a 1 toque.

Alternativas descartadas:
- **Hamburger drawer:** esconde la navegación tras un click, peor UX para una app de consulta rápida.
- **Top nav scrollable:** los usuarios no siempre descubren el scroll lateral.

---

## Cambios

### 1. Fundamentos globales

**`src/app/layout.tsx`** — añadir el export `viewport` (Next 16 lo separa de `metadata`):

```ts
import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#052e16',
};
```

**`src/app/globals.css`** — añadir dos reglas para evitar bugs típicos de iOS:

```css
html { -webkit-text-size-adjust: 100%; }
input, select, textarea { font-size: max(16px, 1rem); }
```

La segunda evita el zoom automático de iOS al hacer focus en un input.

**Layouts (`(public)/layout.tsx`, `admin/layout.tsx`)** — reservar espacio inferior para tab bar + safe-area:

```tsx
<main className="max-w-6xl mx-auto px-4 py-6 sm:py-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
```

### 2. Sistema de navegación

**Nuevo módulo `src/components/shared/nav-links.ts`** — fuente única para los enlaces (consumido por `navbar` y `bottom-nav`):

```ts
export const navLinks = [
  { href: '/', label: 'Inicio', icon: '🏠' },
  { href: '/rankings', label: 'Ranking', icon: '🏆' },
  { href: '/rankings/pairs', label: 'Parejas', icon: '👥' },
  { href: '/matches', label: 'Partidos', icon: '📋' },
  { href: '/info', label: 'Info', icon: 'ℹ️' },
];
```

**Nuevo componente `src/components/shared/bottom-nav.tsx`:**

- Client component (`'use client'`) — usa `usePathname()` para marcar el activo.
- Visibilidad: `md:hidden`. Posición: `fixed bottom-0 inset-x-0 z-50`.
- Fondo: `bg-green-950/95 backdrop-blur` con `border-t border-green-900/50`.
- Padding inferior: `pb-[env(safe-area-inset-bottom)]`.
- 5 columnas iguales (`grid grid-cols-5`), cada celda `min-h-14` (56px) con icono 20px arriba y label `text-[10px] font-bold uppercase tracking-wide` debajo.
- Estado activo: fondo `bg-green-400/15`, texto `text-white`. Inactivo: `text-green-300`.
- Cada `<Link>` tiene `aria-current={pathname === href ? 'page' : undefined}` para accesibilidad.

**`src/components/shared/navbar.tsx` (modificar):**

- Importar `navLinks` desde `nav-links.ts` (eliminar duplicación).
- En móvil mantener `hidden md:flex` en los enlaces (la tab bar inferior los reemplaza).
- Logo "LPT" siempre visible (quitar `hidden sm:block` del `<span>` interior).
- Botón Admin: subir a `min-h-[40px]` y `text-sm`.
- Botón "Salir" (admin): mismo tratamiento.

**`src/app/(public)/layout.tsx`** — añadir `<BottomNav />` al final del wrapper, después de `<main>`.

**`src/app/admin/layout.tsx`** — el admin no recibe la tab bar de jugador (sería confuso). En su lugar la `<AdminSidebar />` pasa a layout horizontal en móvil (ver §3.7).

### 3. Cambios página a página

#### 3.1 Patrón de hero (cabecera verde)

Aplicado en `rankings/page.tsx`, `matches/page.tsx`, `rankings/pairs/page.tsx`, `matches/[id]/page.tsx`, `players/[id]/page.tsx`, `info/page.tsx` y home:

| Antes | Después |
|---|---|
| `p-8` | `p-5 sm:p-7 md:p-10` |
| `text-4xl` (h1) | `text-2xl sm:text-3xl md:text-4xl` |
| `rounded-3xl` | `rounded-xl sm:rounded-2xl md:rounded-3xl` |
| `mt-1` para subtítulo | `mt-1 text-sm sm:text-base` |

#### 3.2 `<MatchCard />` compartido (nuevo)

**Ubicación:** `src/components/shared/match-card.tsx`

**Reemplaza** la duplicación actual en:
- `(public)/page.tsx` (recent matches)
- `(public)/matches/page.tsx` (upcoming + completed)
- `(public)/matches/[id]/page.tsx` (hero del detalle)

**API:**
```tsx
interface MatchCardProps {
  match: Match;
  team1: [Player | undefined, Player | undefined];
  team2: [Player | undefined, Player | undefined];
  sets?: MatchSet[];               // solo para completed
  variant?: 'compact' | 'detail';  // compact = listas, detail = hero del match-detail
  href?: string;                   // si se pasa, se envuelve en <Link>
}
```

**Layout:**
- `<sm`: vertical apilado — fecha/lugar arriba, equipo 1, marcador horizontal centrado, equipo 2, ganador badge incluido en el equipo correspondiente.
- `≥sm`: layout horizontal `[1fr_auto_1fr]` actual.

#### 3.3 Home (`(public)/page.tsx`)

- Hero: stats trío con `gap-4 sm:gap-6 md:gap-16`, números `text-2xl sm:text-3xl md:text-5xl`.
- Sección "ÚLTIMOS PARTIDOS" → consume `<MatchCard variant="compact" />`.
- Sección "PRÓXIMOS PARTIDOS" → consume `<MatchCard variant="compact" />`.
- Podio top-3 → consume `<Podium />` (§3.5).

#### 3.4 Rankings (`(public)/rankings/page.tsx`)

- Hero: §3.1.
- Podio: consume `<Podium />`.
- Tabla: la columna ELO con número + delta usa `text-sm sm:text-base`. Padding lateral `pl-6 → pl-3 sm:pl-6`, `pr-6 → pr-3 sm:pr-6`. La columna Win% en móvil sigue mostrando solo el % (la barrita ya está oculta con `hidden sm:block`).

#### 3.5 `<Podium />` compartido (nuevo)

**Ubicación:** `src/components/shared/podium.tsx`

**Reemplaza** la duplicación en home y rankings.

- Padding interior `px-3 sm:px-5`, `pt-4 sm:pt-7`.
- Números ELO `text-2xl sm:text-3xl md:text-4xl`.
- Nombres `text-xs sm:text-sm` con `leading-tight` y `truncate` correctamente delimitado por `min-w-0`.

#### 3.6 Pairs (`(public)/rankings/pairs/page.tsx`)

- Hero: §3.1.
- Top-3 cards: ya hace `grid sm:grid-cols-2 lg:grid-cols-3` (1 columna en móvil ✓). Padding `p-5 → p-4 sm:p-5`. Stats fila (`Partidos/V/Win%/Sinergia`) reducir gap a `gap-1 sm:gap-2` y números `text-base sm:text-lg`.
- Tabla: avatares de la columna "Pareja" pasan a `w-4 h-4 sm:w-5 sm:h-5` y nombres `text-xs sm:text-sm`.

#### 3.7 Match detail (`(public)/matches/[id]/page.tsx`)

- Breadcrumb superior (`← Partidos · fecha · 📍 lugar`) en móvil pasa a 2 líneas: breadcrumb arriba, badge de estado abajo (no en `ml-auto`).
- Hero del match → `<MatchCard variant="detail" />`.
- Recomendador de parejas (3 cards): cada card tiene `grid grid-cols-[1fr_auto_1fr]` interior. En móvil pasa a vertical: equipo 1 → "VS" → equipo 2.
- Historial de parejas: ya está bien con `grid sm:grid-cols-2`.

#### 3.8 Player profile (`(public)/players/[id]/page.tsx`)

- Cabecera: `flex items-center gap-6` → `flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 sm:gap-6`. Avatar se centra en móvil.
- Nombre: `text-3xl md:text-4xl` → `text-2xl sm:text-3xl md:text-4xl` con `truncate` solo en `≥sm` (en móvil con flex-col puede ocupar varias líneas).
- Stats grid: `grid-cols-4` → `grid-cols-2 sm:grid-cols-4`, `gap-4` → `gap-3 sm:gap-4`, números `text-3xl md:text-4xl` → `text-2xl sm:text-3xl md:text-4xl`.
- Padding `p-8 md:p-10` → `p-5 sm:p-8 md:p-10`.
- Historial de partidos: las filas (`flex justify-between px-5 py-3.5`) necesitan `min-w-0` y `truncate` en el lado derecho ("vs A & B") para evitar overflow con nombres largos.

#### 3.9 Info (`(public)/info/page.tsx`)

- Hero: `px-8 md:px-12 py-14 md:py-16` → `px-5 sm:px-8 md:px-12 py-10 sm:py-14 md:py-16`. Título `text-4xl md:text-6xl` → `text-3xl sm:text-4xl md:text-6xl`.
- Secciones con `p-8 md:p-10` → `p-5 sm:p-8 md:p-10`.
- Glosario: cambiar `flex gap-4 w-24 shrink-0` por layout `flex flex-col sm:flex-row sm:gap-4`. En móvil el término va arriba, definición debajo. En `≥sm` mantiene el formato actual.

#### 3.10 Login (`/login/page.tsx`)

Sin cambios — ya funciona bien en móvil (card centrada `max-w-sm` con `p-4` exterior).

#### 3.11 Admin

**Sidebar (`src/components/admin/admin-sidebar.tsx`):**

- En móvil: layout horizontal de chips con scroll horizontal por si crece.
- En `≥md`: vertical como ahora.

```tsx
<aside className="md:w-52 md:shrink-0">
  <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-2 md:pb-0">
    {/* enlaces como botones-pill horizontales en móvil */}
  </nav>
</aside>
```

**Layout (`src/app/admin/layout.tsx`):**

- `flex gap-8` → `flex flex-col md:flex-row gap-4 md:gap-8`.
- Mantener el `pb-` inferior reservado en §1 (aunque el admin no tenga tab bar, es coherente).

**Páginas admin:**

- `/admin` (dashboard), `/admin/players`, `/admin/matches`: aplicar §3.1 a cabeceras y revisar tap-targets de botones (mínimo 40px de alto).
- Formularios (`player-form.tsx`, `match-form.tsx`, `result-form.tsx`): los inputs ya respetan §1 (font-size 16px). Revisar grids `grid-cols-2/4` que puedan ser demasiado compactos en móvil → bajar a `grid-cols-1 sm:grid-cols-2`.

---

## Verificación

Sin tests automáticos (el repo no tiene Vitest/Jest configurado y montarlos solo para esto sería desproporcionado). Verificación 100 % manual visual.

**Viewports objetivo:**
1. iPhone SE (375×667) — caso límite estrecho.
2. iPhone 14 Pro (393×852) — más común actualmente.
3. Pixel 7 (412×915) — Android medio.
4. iPad mini (768×1024) — primer breakpoint `md`.

**Recorrido funcional en cada viewport:**
1. Home → hero/stats/podio sin desbordes ni truncados raros.
2. Tab bar abajo → 5 iconos pulsables (≥40px), activo distinguible, navegación funciona.
3. Ranking → tabla legible, podio sin solapes.
4. Click en jugador → cabecera de perfil OK, stats 2x2, gráfico de Elo no rebota.
5. Partidos → tarjetas apiladas legibles, marcadores claros.
6. Click en partido → cabecera apilada OK, recomendador (scheduled) o sets (completed) legibles.
7. Parejas → top-3 una por fila en móvil, tabla scrollable si hace falta.
8. Info → secciones legibles, glosario no se aplasta.
9. Admin (con login) → chips horizontales arriba, formularios usables.

**Chequeos cruzados:**
- DevTools → Lighthouse mobile → ≥90 en accesibilidad.
- Sin overflow horizontal en ninguna página (`document.documentElement.scrollWidth === window.innerWidth`).
- Tap targets visualmente ≥40px (regla en DevTools).

**Build de prod:**
- `npm run build` para asegurar que no rompe tipos.
- `npm run lint` para asegurar que no rompe lint.

---

## Archivos afectados (resumen)

**Nuevos:**
- `src/components/shared/nav-links.ts`
- `src/components/shared/bottom-nav.tsx`
- `src/components/shared/match-card.tsx`
- `src/components/shared/podium.tsx`

**Modificados:**
- `src/app/layout.tsx` (viewport export)
- `src/app/globals.css` (text-size-adjust + input font-size)
- `src/app/(public)/layout.tsx` (BottomNav, padding inferior)
- `src/app/admin/layout.tsx` (responsive flex direction, padding inferior)
- `src/components/shared/navbar.tsx` (consume nav-links, tap targets)
- `src/components/admin/admin-sidebar.tsx` (responsive horizontal/vertical)
- `src/app/(public)/page.tsx` (hero responsive, MatchCard, Podium)
- `src/app/(public)/rankings/page.tsx` (hero, Podium, tabla)
- `src/app/(public)/rankings/pairs/page.tsx` (hero, cards, tabla)
- `src/app/(public)/matches/page.tsx` (hero, MatchCard)
- `src/app/(public)/matches/[id]/page.tsx` (hero, recomendador, MatchCard)
- `src/app/(public)/players/[id]/page.tsx` (hero, stats grid, historial)
- `src/app/(public)/info/page.tsx` (hero, secciones, glosario)
- Páginas admin (`/admin`, `/admin/players`, `/admin/matches` y formularios) — tap targets y heroes.

**Sin cambios:**
- `src/app/login/page.tsx`
- API routes
- Lógica de Elo / recomendador
- Esquema de DB
