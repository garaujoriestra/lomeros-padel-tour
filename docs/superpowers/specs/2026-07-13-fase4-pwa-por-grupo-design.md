# Fase 4 · Pieza 2 — PWA por-grupo (identidad de instalación por grupo)

**Fecha:** 2026-07-13
**Estado:** diseño aprobado, pendiente de plan de implementación.
**Contexto:** Fase 4 · Pieza 1 (marca «Padelo» + empty states) ya en prod (PR #31). En la
Pieza 1 el manifest PWA quedó **estático como «Padelo»** y el manifest *por-grupo* se
difirió a propósito. Esta pieza lo implementa: al instalar la app desde el espacio de un
grupo, la PWA muestra en el móvil la **identidad de ese grupo** (nombre, icono, color).

Se apoya en la marca de Fase 3 (`groups.logoUrl` / `accentColor` / `paidUntil`, helpers
`isPaidGroup` / `hasSeasonPass` / `isValidAccentColor` / `isDarkColor`). **No hay cambios de
esquema** → sin migración.

---

## 1. Objetivo y decisiones

- **Objetivo:** la app instalada refleja el grupo desde el que se instaló. Instalar desde
  `/` → «Lomeros Padel Tour» (grupo insignia); desde `/g/<slug>` → la marca de ese grupo.
  «Padelo» queda **solo** como marca de plataforma **no-instalable** (login, atribución).
- **Alcance (aprobado):** **completo** — el manifest es group-aware en todos lados,
  incluida la raíz. Esto **revierte** el `name: 'Padelo'` que la Pieza 1 puso en
  `manifest.ts`, devolviéndolo a la identidad del grupo por defecto (Lomeros).
- **Gating (espejo de Fase 3):** el **nombre** del grupo siempre; **logo/color/icono**
  propios solo si `isPaidGroup` (en beta = todos). Un grupo sin marca de pago → nombre del
  grupo + **escudo y color de plataforma**.
- **Iconos:** **generados** con `ImageResponse` (mismo patrón que los `/icon` actuales), no
  el `logoUrl` a pelo (tamaños y safe-zone maskable correctos). Prioridad de fiabilidad:
  **monograma** (inicial del nombre sobre el color de acento) como icono primario; el logo
  del grupo se usa si se embebe limpio, si no, monograma.

---

## 2. Arquitectura

### 2.1 Constructor puro compartido

`src/lib/groups/manifest.ts` — `buildGroupManifest(input): MetadataRoute.Manifest`, función
**pura** (sin DB), usada por la raíz y por la ruta de grupo:

```ts
type BrandInput = {
  name: string;
  slug: string;
  logoUrl: string | null;
  accentColor: string | null;
};
buildGroupManifest({ brand: BrandInput; basePath: '' | `/g/${string}`; paid: boolean })
```

Produce:
- `name` / `short_name` = `brand.name`.
- `id` / `start_url` = `basePath || '/'` (raíz para el grupo por defecto, `/g/<slug>` para
  el resto → la app instalada ES el espacio del grupo).
- `scope` = **siempre `'/'`** (no `basePath`): la app tiene conmutador de grupos y rutas
  cross-grupo (`/crear-grupo`, `/g/otro`); un scope `/g/<slug>` echaría al navegador del
  sistema al cambiar de grupo. La identidad del grupo va por `id`/`start_url`/`name`/icono,
  no por `scope`.
- `display: 'standalone'`, `orientation: 'portrait'`.
- `theme_color` / `background_color` = `accent` si `paid && isValidAccentColor(accentColor)`,
  si no `'#0c1715'` (verde profundo de plataforma). Mismo gating para ambos.
- `icons`: si `hasCustomBranding = paid && (isValidAccentColor(accentColor) || !!logoUrl)`
  → apunta a las rutas de icono del grupo (`${basePath}/icon`, `/icon-512`,
  `/icon-maskable`); si no → rutas de plataforma (`/icon`, `/icon-512`, `/icon-maskable`) —
  el escudo LPT actual.
  (`apple-icon` va por `metadata.icons`/convención, ver §2.4, no dentro del manifest.)

Puro y testeable en aislamiento; sin acceso a DB.

### 2.2 Raíz (grupo insignia)

`src/app/manifest.ts` pasa a construirse con `buildGroupManifest` para la **identidad del
grupo por defecto (Lomeros)**, con datos de constantes (no DB → build-safe):

```ts
buildGroupManifest({
  brand: { name: LOMEROS_GROUP_NAME, slug: LOMEROS_GROUP_SLUG, logoUrl: null, accentColor: null },
  basePath: '',
  paid: true,
})
```

→ `name: 'Lomeros Padel Tour'`, `start_url: '/'`, escudo de plataforma + verde. Se mantiene
síncrono/estático (sin DB) — **asunción:** el grupo por defecto es el insignia Lomeros, sin
marca de pago propia. (Un despliegue con un grupo por defecto *branded* necesitaría leer DB;
fuera de alcance.)

### 2.3 Ruta de manifest por grupo

`src/app/g/[slug]/manifest.webmanifest/route.ts` — Route Handler `GET`:
- Resuelve el grupo por slug (`getGroupBySlug`); **404** si no existe.
- `paid = isPaidGroup(group)`; devuelve
  `Response.json(buildGroupManifest({ brand: group, basePath: '/g/'+slug, paid }), { headers: { 'Content-Type': 'application/manifest+json' } })`.
- `dynamic = 'force-dynamic'` (lee DB por request).

### 2.4 Enganche del `<link rel="manifest">` y apple-icon

En `src/app/g/[slug]/layout.tsx`, el `generateMetadata` existente (Pieza 1) añade a su
retorno:
```ts
return {
  title: { default: ctx.group.name },
  manifest: `/g/${slug}/manifest.webmanifest`,
  icons: hasCustomBranding ? { apple: `/g/${slug}/apple-icon` } : undefined,
};
```
Esto sobrescribe, **solo para páginas de grupo**, el manifest global (que sigue sirviendo a
la raíz = Lomeros) y el apple-touch-icon. `resolvePageContext(slug)` ya está cacheado por
request, así que no hay doble fetch.

### 2.5 Iconos de grupo generados

Rutas nuevas bajo `src/app/g/[slug]/`:
- `icon/route.tsx` (192×192), `icon-512/route.tsx` (512), `icon-maskable/route.tsx` (512,
  con safe-zone), `apple-icon/route.tsx` (180). Todas delegan en `renderGroupIcon(slug, canvas,
  safe)` (`src/lib/og/group-icon.tsx`), que devuelve 404 si el slug no existe.
- Si `hasCustomBranding(group, paid)` es falso, cae al **escudo de plataforma** (reutiliza
  `crestDataUri`, mismo render que `/icon` actual).
- Si es true y el grupo tiene `logoUrl`: **se intenta embeber el logo** — `fetch(logoUrl)`,
  y si responde OK se convierte a `data:` URI (base64) y se renderiza centrado con
  `ImageResponse` sobre el **color de acento** (o `#0c1715` si no hay acento). Es
  best-effort: cualquier fallo de red/formato cae silenciosamente al monograma.
- Monograma (fallback, o cuando no hay `logoUrl`): 1ª letra de `group.name` (por grafema,
  para no partir pares subrogados), tipografía condensada, color de texto legible según
  `isDarkColor(accent)`, centrado sobre el color de acento (o `#0c1715`).
- La variante maskable añade padding de safe-zone (~10%) en ambos casos (logo y monograma).

---

## 3. Guard `platform-name.test.ts`

`src/app/manifest.ts` deja de ser «fichero de plataforma» (ahora representa legítimamente la
identidad del grupo insignia via `LOMEROS_GROUP_NAME`). **Quitarlo** de `PLATFORM_FILES` en
`src/lib/groups/platform-name.test.ts`. (Usa la constante en MAYÚSCULAS, que además no
dispara el regex case-sensitive `/Lomeros/`, pero la eliminación deja clara la intención.)
El resto de ficheros del guard (login, layout, crest, g/[slug]/layout, player-profile-view)
siguen protegidos.

---

## 4. Testing (regla de `AGENTS.md`)

- **unit (Vitest):** `buildGroupManifest` — nombre, `start_url`/`scope`/`id` por `basePath`,
  color por gating (paid+accent vs plataforma), selección de iconos (grupo vs plataforma
  según `hasCustomBranding`), grupo por defecto (basePath '' → start_url '/').
- **e2e (Playwright):**
  - `GET /manifest.webmanifest` (raíz) → JSON con `name: 'Lomeros Padel Tour'` y
    `start_url: '/'` (ya no «Padelo»).
  - `GET /g/<slug>/manifest.webmanifest` (grupo de test) → `name` = nombre del grupo,
    `start_url`/`scope` = `/g/<slug>`.
  - `GET /g/<slug-inexistente>/manifest.webmanifest` → 404.
  - Una página de grupo enlaza su manifest: el HTML de `/g/<slug>` contiene
    `<link rel="manifest" href="/g/<slug>/manifest.webmanifest">`.
  - `GET /g/<slug>/icon` (y `/icon-512`) → 200 `image/png`.
- **regresión:** el guard `platform-name` sigue verde (con manifest.ts fuera de la lista);
  el e2e `fase4-first-run` (Pieza 1) sigue verde (login «Padelo», raíz título Lomeros).

---

## 5. Fuera de alcance

- El **logo** del grupo como icono maskable perfecto (aspect ratio/recorte): best-effort;
  el monograma es el primario fiable.
- Notificaciones push / share por-grupo, splash screens custom, screenshots del manifest.
- Grupo por defecto *branded* distinto de Lomeros (necesitaría DB en la raíz).
- Cualquier otra pieza de Fase 4 (landing, legal, i18n).

---

## 6. Criterios de aceptación

1. Instalar/inspeccionar desde `/` da identidad **Lomeros Padel Tour** (nombre + escudo);
   desde `/g/<slug>` da la del grupo (nombre siempre; logo/color/icono si `isPaidGroup`).
2. `buildGroupManifest` es puro y cubierto por unit tests; las rutas de manifest e icono
   responden (200 / 404 correctos) verificadas por e2e.
3. «Padelo» no aparece como `name` de ningún manifest (es marca de plataforma no-instalable).
4. Guard `platform-name` y e2e de Pieza 1 siguen verdes; sin cambios de esquema.
