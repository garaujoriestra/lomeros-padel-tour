# Multi-tenant Fase 2 · Tarea 3 — Conmutador de grupos

**Fecha:** 2026-07-12 · **Estado:** diseñado en sesión autónoma (goal del usuario: completar Tarea 3; la Tarea 2 corre en paralelo en otra sesión). Decisiones ancladas en la spec de Tarea 1 (`2026-06-29-multitenant-fase2-tarea1-slug-routing-design.md`) y en la de Fase 1; los supuestos nuevos se marcan como tal.

## 1. Qué es

La UI para saltar entre grupos, diferida desde la Tarea 1:

1. **Conmutador del súper-admin** (el núcleo de la Tarea 3 según Fase 1): selector para visitar cualquier grupo en **solo-lectura**, invisible para el resto.
2. **Chooser multi-grupo** (diferido explícitamente a Tarea 3 en la spec de Tarea 1, §4 aterrizaje): un usuario con memberships en varios grupos puede cambiar de grupo desde la UI (el aterrizaje post-login ya elige el más reciente; esto lo complementa, no lo cambia).

Todo el backend ya existe: `resolveGroupContext` da contexto `super_admin` en grupos sin membership, `requireGroupAdmin` rechaza sus escrituras con 403, `resolvePageContext` resuelve rol y `basePath` por grupo de la URL. La Tarea 3 es **solo UI + un gate**.

## 2. Decisiones

### 2.1 Conmutador en el navbar (dropdown)

- Nuevo componente cliente `GroupSwitcher` en `topbar-actions` del `Navbar`, usando el `dropdown-menu` existente (`src/components/ui/dropdown-menu.tsx`, base-ui) — mismo patrón visual que el resto de la app.
- Trigger: `icon-btn` con icono `ArrowLeftRight` (lucide), `aria-label="Cambiar de grupo"`.
- Items: nombre del grupo, check en el actual; cada item navega (Link) a la **home del grupo**: `/` para el grupo por defecto, `/g/<slug>` para el resto.
  - *Supuesto:* destino = home del grupo (no `/me`): es predecible, pública, y funciona igual para miembros y para el súper-admin (que no tiene ficha → su `/me` de grupo sería una bienvenida vacía).
- **Visibilidad:** solo si la lista tiene ≥2 entradas. Usuario de un solo grupo, visitante sin sesión, o instalación con un único grupo → el navbar queda **idéntico al actual** (Lomeros hoy no ve nada nuevo).

### 2.2 Fuente de datos

- Helper **puro** `buildSwitcherGroups({ memberships, allGroups, isSuperAdmin, defaultGroupId, currentGroupId })` → `SwitcherGroup[] = { slug, name, href, current }` (unit-testeable).
- `getSwitcherGroups(currentGroupId)` (server, en `src/lib/auth/page-context.ts` junto a `navSessionFromContext`): sin sesión → `null`; con sesión → memberships JOIN groups del usuario; si `isSuperAdminEmail` → `listGroups()` (todos, el súper-admin ve todo); `<2` entradas → `null`.
- Cableado en los **5 layouts** que montan `Navbar` ((public), me, admin, planificador, g/[slug]) → nueva prop opcional `switcher` del `Navbar` (default `null` = nada nuevo).

### 2.3 Súper-admin: vista solo-lectura

- `src/app/g/[slug]/admin/layout.tsx`: el gate pasa de `role !== 'admin'` a permitir también `super_admin`, con un **banner "Solo lectura (súper-admin)"** encima del contenido. La protección real de escrituras ya está en la API (`requireGroupAdmin` → 403); los botones de mutación que el súper-admin pulse fallarán con error visible — aceptado para MVP (ocultarlos tocaría todos los cuerpos admin compartidos).
- El **admin de la raíz NO cambia** (decisión previa explícita en `admin/layout.tsx`: el súper-admin no entra al admin del grupo por defecto por la vía súper-admin; en prod es admin normal de Lomeros por membership).
- `navSessionFromContext`: `super_admin` deja de mapear a `null` (navbar de visitante con "Entrar", incoherente para un logueado) → devuelve `{ role: 'super_admin', player: null }`. En el `Navbar`: engranaje → `${basePath}/admin` solo si `role==='admin'` o (`role==='super_admin'` y `basePath` no vacío); botón Salir visible; sin avatar (no hay ficha). El caso "logueado sin NINGUNA membership ve navbar de visitante" (borde aceptado en Paso C) NO cambia.

### 2.4 Lo que NO entra (YAGNI)

- Ni chooser de aterrizaje post-login (página intersticial) — el aterrizaje "más reciente" de Paso C se queda.
- Ni conmutador en `BottomNav` (el topbar ya se ve en móvil).
- Ni ocultar botones de mutación al súper-admin en los cuerpos admin.
- Ni persistencia del "grupo activo" (cookie/preferencia): el grupo vive en la URL, único estado.

## 3. Testing

- **Unit:** `buildSwitcherGroups` (casos: 1 membership → null/corta, multi, súper-admin con todos, marcado de `current`, href del default vs slug) + `navSessionFromContext` con `super_admin`.
- **e2e** (`e2e/group-switcher.spec.ts`), con fixtures nuevos en `global-setup.ts`:
  - Usuario **multi-grupo** `e2e-multi-user` (membership player en `lomeros` y en `grupo-test`, sin ficha) + storageState `multi.json`.
  - Usuario **súper-admin** `e2e-super-user` (`super@test.com`, SIN memberships) + storageState `super.json`; `SUPER_ADMIN_EMAILS=super@test.com` añadido al comando del webServer de Playwright.
  - Tests: (1) player de un solo grupo NO ve el conmutador; (2) multi-usuario en `/` ve 2 grupos y al pulsar Grupo Test aterriza en `/g/grupo-test`; (3) a la inversa vuelve a `/`; (4) súper-admin ve todos los grupos, entra en `/g/grupo-test/admin` y ve el dashboard con banner de solo lectura, y su POST de escritura (`/api/players` con `g=grupo-test`) devuelve 403; (5) visitante sin sesión no ve el conmutador.
  - Los fixtures nuevos no tocan a `gt-admin`/`gt-player` (siguen con una única membership → el fallback "única membership" de los tests existentes queda intacto).

## 4. Garantía de no-rotura (Lomeros)

- Prop nueva opcional en `Navbar` con default `null` → cero cambio si no se pasa o si hay <2 grupos.
- En prod hoy solo existe Lomeros → `listGroups()` devuelve 1 → ni el súper-admin ve el conmutador. Todo queda **dormido** hasta que la Tarea 2 (onboarding) cree más grupos.
- El único cambio de comportamiento visible-en-teoría es para `super_admin` (rol que hoy nadie ejerce en prod con un solo grupo): navbar con logout/engranaje y acceso lectura a `/g/<slug>/admin`.
