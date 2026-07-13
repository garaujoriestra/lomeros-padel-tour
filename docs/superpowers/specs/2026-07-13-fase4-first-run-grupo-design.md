# Fase 4 · Pieza 1 — First-run del grupo nº2 (empty states + marca de plataforma «Padelo»)

**Fecha:** 2026-07-13
**Estado:** diseño aprobado, pendiente de plan de implementación.
**Contexto:** Fases 1–3 completas y en prod (multi-tenant de punta a punta; marca por
grupo + Pase de Temporada dormido tras `BILLING_ENABLED`). La Fase 4 de la estrategia de
comercialización (`docs/superpowers/specs/2026-06-14-comercializacion-estrategia.md`, §2,
fila 4) es «pulido para terceros» y se compone de **5 piezas independientes**: landing
pública, empty states, quitar literales «Lomeros», legal mínima y (quizá) i18n. Este spec
cubre **solo la primera pieza**, que agrupa las dos más acopladas: los **empty states** y la
**neutralización de la marca de plataforma**. Es lo que decide, según la propia estrategia,
que «el grupo nº2 se quede o se vaya».

Las demás piezas (landing, legal, i18n) tendrán su propio ciclo spec → plan → implementación.

---

## 1. Objetivo

Que un grupo recién creado (grupo nº2 en adelante) abra la app y:

1. **No vea «Lomeros»** en ninguna pieza de plataforma que no le corresponde (login,
   atribución, PWA, título del navegador).
2. **No vea nada roto** aunque esté todo vacío (sin jugadores, partidos, ranking, timba,
   torneos, planner).

No-objetivos de esta pieza (ver §6): guía activa de onboarding para el admin, seeds/datos
demo, landing pública, textos legales, i18n, y PWA por-grupo.

---

## 2. Parte A — Neutralizar la marca de plataforma a «Padelo»

### 2.1 Principio

La marca **de cada grupo** (nombre, logo, color de acento, ⭐) ya la resuelve la Fase 3 y se
aplica dentro de su espacio (`brand?.name ?? …` en el navbar, etc.). Lo que sigue diciendo
«Lomeros» son las piezas de **plataforma** que un grupo ajeno no puede rebrandear. Esas pasan
a **«Padelo»**.

**La raíz `/` es el grupo insignia Lomeros** → su hero, su home bespoke (`(public)/page.tsx`)
y su página `/info` **siguen siendo de Lomeros a propósito**. No se tocan.

### 2.2 Fuente única de verdad

Añadir `export const PLATFORM_NAME = 'Padelo'` en `src/lib/groups/constants.ts` (junto a
`LOMEROS_GROUP_NAME`). Prohibido volver a hardcodear el literal de plataforma en componentes.

### 2.3 Mapa de sustituciones

| Fichero (aprox.) | Hoy | Pasa a |
|---|---|---|
| `src/app/login/page.tsx` (`Crest title`, `<h1>`) | «Lomeros Padel Tour» | `PLATFORM_NAME` (login es pre-grupo) |
| `src/app/g/[slug]/layout.tsx` (atribución «hecho con …») | «hecho con Lomeros Padel Tour» | «hecho con {PLATFORM_NAME}» (el *gating* de cuándo se muestra no cambia) |
| `src/app/manifest.ts` (`name`, `short_name`, `description`) | «Lomeros Padel Tour» | `PLATFORM_NAME` (identidad de la PWA instalada) |
| `src/app/layout.tsx` (`metadata.title`, `description`) | «Lomeros Padel Tour» | plantilla neutra con `PLATFORM_NAME` (ver §2.4) |
| `src/components/shared/crest.tsx` (prop `title` por defecto) | «Lomeros Padel Tour» | `PLATFORM_NAME` (el navbar de grupo ya pasa `brand.name`) |
| `src/components/players/player-profile-view.tsx` (texto de share) | «· Lomeros Padel Tour» | marca del grupo (`brand.name`), *fallback* `PLATFORM_NAME` |

### 2.4 Política de `<title>` del navegador

- `src/app/layout.tsx` fija el título **por defecto** de plataforma con una plantilla
  (`{ default: PLATFORM_NAME, template: '%s · ' + PLATFORM_NAME }`) — así cualquier página
  sin título propio muestra «Padelo».
- La raíz `/` (home de Lomeros) **sobrescribe** su `metadata.title` a «Lomeros Padel Tour».
- Las páginas de grupo (`/g/[slug]/…`) sobrescriben el título con la **marca del grupo**
  (`group.name`) donde sea barato (al menos el layout de grupo).

### 2.5 Decisión: PWA manifest estático

El `manifest.ts` queda **estático con `PLATFORM_NAME`** (una sola identidad de plataforma).
El manifest **por-grupo** (que cada grupo instale la PWA con su propio nombre/logo en el
móvil) se **difiere**: es más trabajo (manifest dinámico por request/grupo + alcance de
instalación) y no bloquea el first-run. Se anota como mejora futura.

---

## 3. Parte B — Empty states limpios

### 3.1 Componente compartido

Hoy **no existe** un componente de empty-state; los estados vacíos están dispersos y ad-hoc
(algunos resueltos, otros no). Se crea uno compartido:

**`src/components/shared/empty-state.tsx`** — `<EmptyState>`:
- Props: `title` (string), `hint?` (string de soporte), `icon?` (lucide, opcional),
  `action?` (nodo opcional para un CTA — p. ej. en listas de admin «Añadir jugador»).
- Estilo on-brand según `DESIGN.md`: título en display condensada, `hint` en Archivo
  (`.small`, tinta-3), centrado, aire generoso, **quieto** (nada de motion — «aún no hay
  jornada», no un flujo repetido). Un solo acento como mucho en el CTA.
- Sin dependencias de datos; puramente presentacional y testeable en aislamiento.

### 3.2 Superficies a cubrir

Reemplazar los empties ad-hoc y añadir los que falten, en las vistas que un grupo nuevo abre
vacías. Usan los componentes `*-body.tsx` compartidos (raíz + `/g/[slug]`), así que el arreglo
sirve para ambos contextos:

- **Home de grupo** — `group-home-body.tsx` (sin partidos/feed/ranking).
- **Ranking** — `rankings-body.tsx`, `rankings-pairs-body.tsx`, `tokens-body.tsx`
  (unificar los empties que ya existen ad-hoc).
- **Partidos / eventos** — `matches-list.tsx`, `eventos` (raíz y `/g/[slug]`).
- **La Timba** — sin partidos abiertos para apostar.
- **Torneos / pozos** — vistas públicas y listas de admin (`admin/torneos`, `admin/pozos`).
- **Planner** — `planner-body.tsx` (semana sin jugadores/disponibilidad).
- **/me** — `me-body.tsx` (jugador sin partidos aún).
- **Listas de admin** — `admin-players-body.tsx`, `admin-matches-body.tsx` (con CTA de alta).

### 3.3 Regla

Ninguna vista de grupo debe mostrar una tabla/lista vacía a pelo, un `0` sin contexto, ni
romper (p. ej. cálculos de ranking/podio sobre 0 jugadores). Toda vista vacía → `<EmptyState>`
con un mensaje que diga qué falta (y, en admin, cómo empezar).

---

## 4. Arquitectura y aislamiento

- **`PLATFORM_NAME`** en `constants.ts`: una constante, importada donde haga falta. Cambia el
  literal en un sitio.
- **`<EmptyState>`**: un componente presentacional con interfaz clara (title/hint/icon/action),
  sin estado ni datos. Se entiende y prueba sin leer sus consumidores.
- El barrido de superficies **no cambia la lógica de datos**: solo el render cuando la
  colección viene vacía. Se apoya en los `*-body.tsx` ya compartidos entre raíz y grupo.

---

## 5. Testing (regla de `AGENTS.md`)

- **e2e (Playwright):** un spec nuevo (p. ej. `e2e/fase4-first-run.spec.ts`) que:
  1. Crea/usa un **grupo vacío** (dev-login + grupo demo sin datos, patrón de los `no-fuga-*`).
  2. Verifica que sus vistas de grupo (home, ranking, partidos, timba, torneos, planner, /me)
     **renderizan el empty state y no rompen** (sin errores de runtime, sin tablas a pelo).
  3. Verifica que **login y atribución muestran «Padelo»** y no «Lomeros».
- **unit (Vitest):**
  - `<EmptyState>` renderiza title/hint/action.
  - Las superficies consumen `PLATFORM_NAME` (no el literal) — o un test de guard sencillo que
    prohíba «Lomeros Padel Tour» hardcodeado fuera de la raíz/insignia y de `constants.ts`.
- **Regresión Lomeros:** la raíz `/` (insignia) sigue mostrando «Lomeros Padel Tour» en su
  hero/título — un assert que lo confirme, para no neutralizar de más.

---

## 6. Fuera de alcance (otras piezas de Fase 4 / futuras)

- **Landing pública** de producto (captación de grupos).
- **Legal mínima** (privacidad/términos).
- **i18n**.
- **Guía activa de onboarding** para el admin (checklist de arranque) — descartada por el
  usuario en el brainstorming; solo empty states limpios.
- **Seeds / datos demo** para poblar un grupo nuevo.
- **PWA por-grupo** (manifest dinámico con nombre/logo del grupo en el móvil).
- **Página `/info` por-grupo** (la de la raíz es de Lomeros y se queda).

---

## 7. Criterios de aceptación

1. `PLATFORM_NAME = 'Padelo'` es la única fuente del nombre de plataforma; login, atribución,
   manifest, crest por defecto y título por defecto lo usan.
2. La raíz `/` (Lomeros) sigue intacta y branded como Lomeros.
3. Un grupo vacío no muestra ninguna vista rota ni lista/tabla a pelo; todas usan `<EmptyState>`.
4. Cobertura e2e (grupo vacío + «Padelo» en plataforma) y unit (EmptyState + no-hardcode) en verde.
