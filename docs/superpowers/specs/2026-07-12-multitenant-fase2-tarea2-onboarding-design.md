# Fase 2 · Tarea 2 — Onboarding self-service (beta cerrada por enlace firmado)

**Fecha:** 2026-07-12 · **Estado:** diseño validado en brainstorming con el usuario.

## 0. Contexto y objetivo

Con la Tarea 1 completa (slug routing + `/api` group-aware + paridad MVP + aterrizaje
grupo-hogar, PRs #24/#25), la app es multi-tenant pero **no hay forma de crear un grupo
nuevo ni de que entre nadie que no exista ya en la BBDD** (el callback OAuth rechaza
emails desconocidos → `/unauthorized`).

La Tarea 2 convierte eso en un onboarding self-service **en beta cerrada**: el súper-admin
reparte enlaces de invitación; quien recibe uno crea su grupo, da de alta a sus jugadores
con sus Gmails, y el grupo puede jugar (partidos + resultados + Elo/rankings) sin que el
súper-admin haga nada más.

**Decisiones del usuario (2026-07-12):**
- Beta cerrada: crear grupo requiere invitación del súper-admin.
- Mecanismo: **enlaces firmados que caducan** (sin env vars que rotar, sin tablas nuevas).
- Invitación de miembros: **emails a mano** por el admin del grupo (mecanismo
  `upsertPlayerUser` existente), NO enlace de grupo.
- Alcance: onboarding + **grupo operativo** (bucle jugadores→partidos→resultados);
  paridad completa del admin se difiere a una **Tarea 2b** (ver §7).

## 1. Enlace de invitación (súper-admin)

- **UI:** bloque en el dashboard de `/admin` raíz visible solo si `ctx.isSuperAdmin`
  (allowlist `SUPER_ADMIN_EMAILS` existente): botón «Generar enlace de invitación» +
  campo para copiar el resultado.
- **API:** `POST /api/onboarding/invite-link` — guard: sesión + `isSuperAdmin` (403 si
  no). Devuelve `{ url }` con `/crear-grupo?t=<token>`.
- **Token:** JWT HS256 firmado con el `AUTH_SECRET` existente (módulo nuevo
  `src/lib/onboarding/invite-token.ts`: `signInviteToken()` / `verifyInviteToken()`),
  payload `{ purpose: 'create-group' }`, **caducidad 7 días**. Multiuso mientras viva
  (un enlace filtrado muere solo; no hay revocación individual — trade-off aceptado).

## 2. Página `/crear-grupo` y creación de cuenta

`crear-grupo` entra en `RESERVED_SLUGS`. La página (server component + form client)
valida `?t=` en servidor y bifurca:

1. **Token inválido/caducado/ausente** → mensaje «necesitas una invitación» (sin form).
2. **Token válido, sin sesión** → deja cookie firmada **`signup_intent`** (JWT con
   `AUTH_SECRET`, `{ purpose: 'signup' }`, **30 min**, httpOnly) y muestra «Entrar con
   Google» (→ `/login?from=/crear-grupo?t=…`).
3. **Token válido, con sesión** → formulario de creación (§3).

**Cambio en el callback OAuth** (`api/auth/callback`): ante un email verificado de Google
**sin usuario en BBDD**, si la request trae `signup_intent` válida → **crea el user** y
borra la cookie; si no → `/unauthorized` (comportamiento actual intacto). La cookie vive
en módulo propio `src/lib/onboarding/signup-intent.ts` (firmar/verificar/borrar + la
decisión pura `shouldCreateUser({ userExists, intentValid })` con unit tests, porque el
intercambio con Google no es e2e-able).
`signup_intent` NO autoriza crear grupo; solo crear cuenta.

## 3. Formulario y `POST /api/onboarding/create-group`

- **Campos:** nombre del grupo (obligatorio) y **slug** auto-derivado del nombre
  (minúsculas, sin acentos, guiones; helper puro `slugFromName()`), editable, validado
  con `isValidSlug` + unicidad en `groups`.
- **POST body:** `{ name, slug, t }` (el token viaja oculto en el form y se re-valida).
  Guards: sesión (401), token válido (403), slug válido/libre (400 con mensaje inline;
  el form no pierde lo tecleado).
- **Efecto:** `INSERT groups {id: slug, slug, name}` + `membership {userId, groupId,
  role: 'admin', playerId: null}` → cliente redirige a `/g/<slug>/admin`.
- El creador nace **admin sin ficha**; si también juega, se da de alta como jugador con
  su propio email — `upsertPlayerUser` vincula la ficha a su membership conservando el
  rol admin (camino existente).
- DAL nuevo mínimo en `src/lib/groups/` (createGroup) — sin tocar el guard CI de acceso
  directo (las tablas `groups`/`memberships` no son tenant-raíz, pero se sigue el patrón
  DAL igualmente).

## 4. Invitación de miembros = alta con email (sin código nuevo de auth)

El admin del grupo da de alta a cada jugador con su Gmail. `upsertPlayerUser(groupId,
playerId, email)` ya crea la cuenta si no existe y la membership `player` — ese usuario
ya puede entrar con Google (el callback lo encuentra). El aterrizaje grupo-hogar del
Paso C le deja en `/g/<slug>/me` con su ficha. **«Reclamar ficha» es implícito: cero
pantallas nuevas.** Solo falta la UI de alta bajo el grupo (§5).

## 5. Admin operativo bajo `/g/[slug]/admin` (4 sub-rutas nuevas)

Patrón de paridad existente (cuerpo compartido + `basePath`; gating por el layout de
grupo del Paso 3, sin tocar las páginas raíz de Lomeros — props ausentes = idéntico):

- **`players/new`** y **`players/[id]/edit`** — formulario compartido con la raíz; el
  campo email dispara `upsertPlayerUser`. El form (client) recibe prop opcional
  `groupSlug` y añade `body.g` / `?g=` a sus llamadas — la API ya es group-aware (B1).
- **`matches/new`** y **`matches/[id]/result`** — ídem con `/api/matches*` (B2); el
  roster del selector sale del grupo (`?g=`).
- Listas `AdminPlayersBody`/`AdminMatchesBody`: mostrar botones «Nuevo»/«Editar»/
  «Resultado» también bajo grupo (hoy ocultos), enlazando con `basePath`.
- `AdminSidebar` bajo grupo: sin cambios (3 secciones MVP).

**Fuera de alcance (diferido a Tarea 2b, §7):** lados, editar partido, notificaciones,
La Timba, premios/canjes, pozos/torneos y planificador bajo grupo.

## 6. Seguridad y bordes

- Generación de enlaces: solo `isSuperAdmin` (403 resto). Doble validación del token
  (página y POST). `signup_intent` de un solo uso y 30 min.
- Token caducado a mitad de flujo → el POST devuelve 403 con «pide un enlace nuevo».
- Sin `?t=` la página no revela nada; el callback sin `signup_intent` es byte a byte el
  actual (Lomeros idéntico; ningún deploy-riesgo: todo dormido hasta repartir enlaces).
- `RESERVED_SLUGS` protege colisiones de slug con rutas reales; unicidad en DB.
- Multi-grupo: un miembro de Lomeros con enlace válido puede crear su 2º grupo (el
  aterrizaje elige por membership más reciente; el chooser llega en la Tarea 3).

## 7. Fuera de alcance / siguientes

- **Tarea 2b — paridad completa del admin de grupo** (COMPROMETIDA con el usuario como
  siguiente ciclo tras la T2): lados + editar partido, notificaciones push, La Timba,
  premios/canjes, pozos/torneos, planificador bajo `/g/[slug]`.
- Tarea 3: conmutador de grupo del súper-admin + chooser multi-grupo.
- Revocación individual de enlaces, códigos de un solo uso, paywall (Fase 3), marca
  por grupo (Fase 3/4).

## 8. Testing (AGENTS.md: e2e obligatorio)

- **Unit:** `invite-token` (firma/verificación/caducidad/purpose), `slugFromName`
  (acentos, espacios, mayúsculas, vacíos), helper de decisión del callback,
  validación del form de creación.
- **e2e (`onboarding.spec.ts`,** con dev-login y cookies forjadas, sin Google real):
  1. `POST invite-link` como súper-admin → 200 con URL; como admin normal → 403.
  2. `/crear-grupo` sin token → sin formulario; con token → formulario.
  3. Crear grupo (token válido) → 201, membership admin, aterrizaje `/g/<slug>/admin`.
  4. Token caducado (firmado con exp pasado en el test) → 403.
  5. Slug duplicado/reservado → 400 inline.
  6. Alta de jugador con email bajo el grupo (UI nueva) → dev-login con ese email →
     **aterriza en `/g/<slug>/me` con su ficha** (reclamo implícito).
  7. Partido + resultado bajo el grupo (UI nueva) → aparece en la home del grupo.
  8. No-fuga: el grupo nuevo no lista jugadores/partidos de Lomeros ni viceversa.
- Regresión: suite completa existente verde (Lomeros idéntico).
