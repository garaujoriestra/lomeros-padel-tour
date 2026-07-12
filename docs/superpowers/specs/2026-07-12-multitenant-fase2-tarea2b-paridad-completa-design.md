# Fase 2 · Tarea 2b — Paridad completa bajo `/g/[slug]` (admin + públicas + me + navegación)

**Fecha:** 2026-07-12 · **Estado:** diseño validado con el usuario. Continúa la Tarea 2
(onboarding, PR #27): un grupo nuevo ya se crea, invita y juega el bucle básico; esta
tarea le da TODO lo demás, dejando la app de un grupo indistinguible de Lomeros
(salvo la home bespoke de la raíz y el branding, que son Fase 3/4).

## 0. Decisiones del usuario (2026-07-12)

- **Alcance A+B en un ciclo:** admin restante + páginas públicas de detalle. Corrige de
  paso el **404 vivo**: la home de grupo ya enlaza `${basePath}/matches/<id>` sin que la
  ruta exista.
- **Paridad de navegación:** nav-tabs + bottom-nav también bajo grupo (adiós chrome mínimo).
- **`/me` completo bajo grupo:** cartera (`me/tokens`, exigida por La Timba) y editar
  perfil (`me/edit`).
- **Enfoque C (híbrido):** cuerpo compartido (`XxxBody({ctx})`, patrón MeBody/AdminPlayersBody)
  para páginas con lógica/markup grande; copia-parametrizada (patrón T10/T11) para
  wrappers finos; forms client con prop `groupSlug` (convención establecida).

**Ya resuelto, fuera de alcance:** planificador (página `/g/[slug]/planificador` y API
group-aware existen); conmutador (Tarea 3, en main); onboarding (Tarea 2).

## 1. Páginas públicas nuevas bajo `/g/[slug]` (cuerpos compartidos)

Para cada una: extraer el cuerpo de la página raíz a `src/components/pages/<x>-body.tsx`
driven por `PageContext` (la raíz lo renderiza con `resolvePageContext()`, el grupo con
`resolvePageContext(slug)`); la página raíz queda como wrapper fino. Lomeros byte-idéntico.

| Ruta de grupo | Cuerpo | Notas |
|---|---|---|
| `matches/[id]` | `MatchDetailBody` | Detalle completo: sets, Elo en juego, proyección, La Timba. **Fix transversal:** `BetsSummary` y `NotificationReminderGate` hoy llaman `resolvePageContext()` SIN slug (bajo grupo resolverían el grupo por defecto — bug latente): pasan a recibir `ctx`/`player` por props desde el cuerpo. `BettingCard` ya recibe props; el POST de apuestas (`/api/bets`) es group-aware (B2) → el form de apuesta manda `g` cuando hay slug. `generateMetadata`/OG usa el grupo de la URL (1D ya lee group.name). |
| `players/[id]` | reutiliza `PlayerProfileView` | Sus enlaces internos (`/matches/:id`, `/players/:id`) pasan a prop `basePath` (cierra la limitación anotada del Paso 2 en me-body). `loadPlayerProfile` ya scopea por groupId. |
| `rankings` | `RankingsBody` | Podio + tabla + sparklines, scopeado a `ctx.groupId`; `myPlayerId` de `ctx.player`. |
| `eventos` | `EventosBody` | Lista pública de pozos/torneos del grupo (`listEventSummaries` ya recibe groupId). |
| `pozos/[id]` y `torneos/[id]` | `PozoPublicBody` / `TorneoPublicBody` | Gate `getTournamentInGroup(ctx.groupId, id)` (existe); "tu próximo partido" con `ctx.player`. |

- Los 404 de detalle ajeno se comprueban por CONTENIDO (gotcha conocido: `notFound()`
  devuelve 200 vía request.get en esta versión de Next).
- Enlaces emitidos por los cuerpos: SIEMPRE `${basePath}/...` (en raíz `basePath=''`).

## 2. `/me` bajo grupo

- **`/g/[slug]/me/tokens`** — cuerpo compartido `TokensBody({ctx})` (cartera, apuestas
  abiertas, premios canjeables, ledger): datos por `ctx.player`/`ctx.groupId` (la página
  raíz ya migró a `resolvePageContext` en el Paso C; extraer el cuerpo es directo).
  `RedeemButton` manda `g` (API redemptions group-aware, B2).
- **`/g/[slug]/me/edit`** — wrapper fino + `MeProfileForm` con prop `groupSlug` (`PUT
  /api/me` con `body.g`; API group-aware de B2 — verificar el shape exacto en el plan).
- El matcher del proxy ya cubre `/g/:slug/me/:path*` (Paso 2). MeBody: los enlaces a
  tokens/edit dejan de estar gateados a raíz y usan `basePath`.

## 3. Navegación (paridad)

- `src/components/shared/nav-links.ts`: `navLinks(basePath)` (o equivalente) para que
  navbar y bottom-nav emitan hrefs con prefijo; **`isNavActive` se arregla** para
  reconocer rutas `/g/<slug>/...` (deuda anotada del Paso 1: hoy no es basePath-aware).
- `g/[slug]/layout.tsx`: pasa de `links={[]}` a los links reales + `<BottomNav basePath>`.
- Raíz: `basePath=''` → hrefs idénticos, cero cambio visible.

## 4. Admin restante bajo `/g/[slug]/admin`

- **Sidebar completo:** fuera el filtro `GROUP_MVP_LINKS` de `admin-sidebar.tsx` (todas
  las secciones con `basePath`).
- **Pozos y Torneos** (APIs group-aware desde B3): páginas de grupo para lista, `new` y
  panel `[id]`; `event-form`, `event-panel` y botones (generate/pairs/delete/share) con
  prop `groupSlug` → `?g=`/`body.g`; roster del grupo (las páginas raíz ya usan
  `listPlayersByElo(groupId)` — el cuerpo compartido o la copia usa `ctx.groupId`).
- **Avisos** (`notifications`): cuerpo compartido (la página raíz ya usa `resolvePageContext`
  del Paso C); `broadcast-form` con `groupSlug` → `body.g` (API ya lo acepta, Paso C).
  Destinatarios = memberships del grupo (query ya scopeada por groupId en la página).
- **Premios/Canjes/Timba:** cuerpos compartidos + `rewards-manager`/`redemptions-manager`/
  `timba-entries` con `groupSlug` (APIs B2).
- **Partidos editar + lados:** wrappers finos copiados (patrón T11 result) +
  `edit-result-form`/`match-sides-form` con `groupSlug` (PATCH/PUT ya group-aware).
- Los botones/enlaces gateados con `isRoot` en `admin-matches-body` (Lados/Editar) se
  des-gatean con `basePath`.

## 5. Principios y bordes

- **Lomeros idéntico**: extraer cuerpo = mover markup sin cambiar comportamiento; la
  suite e2e existente es la red. Sin cambios de API (todo quedó group-aware en B1-B3+C).
- Convención de mutaciones: `body.g` / lecturas `?g=` — SIEMPRE solo cuando hay slug.
- super_admin: solo-lectura también en las secciones nuevas (los guards ya lo rechazan
  en escrituras; el banner del conmutador de T3 ya existe en el admin de grupo).
- Server components compartidos NUNCA llaman `resolvePageContext()` sin slug si pueden
  renderizarse bajo grupo: el contexto viaja por props (regla nueva del repo, nace del
  fix de BetsSummary).

## 6. Testing (e2e obligatorio, AGENTS.md)

`e2e/group-parity.spec.ts` (+ ajustes puntuales de specs existentes si cambian gates):

1. **Jugador de grupo** (gt-player): abre detalle de partido del grupo desde la home,
   ve La Timba, apuesta (saldo baja), consulta su cartera, edita su apodo.
2. **Admin de grupo** (gt-admin): crea pozo desde `/g/.../admin/pozos/new`, genera,
   registra un resultado; crea premio, jugador lo canjea, admin lo marca entregado;
   envía aviso (200); edita partido y asigna lados.
3. **No-fuga:** detalle de partido/jugador/pozo de grupo-test no revela contenido a
   Lomeros ni viceversa (por contenido); rankings del grupo no listan a `Jugador 1`.
4. **Navegación:** tabs visibles bajo grupo con hrefs `/g/<slug>/...` y estado activo
   correcto; bottom-nav presente; raíz sin cambios (suite existente).
5. Unit: `isNavActive` basePath-aware (casos raíz/grupo/anidadas).
- Regresión: suite completa verde desde limpio.

## 7. Fuera de alcance

- Branding/tema por grupo, paywall (Fase 3); sustituir literales "Lomeros" (Fase 4).
- Home bespoke de la raíz (el grupo mantiene su GroupHomeBody lean).
- Backlog que sigue vivo: cuentas huérfanas de onboarding abandonado; blob de avatares
  keyed al grupo-hogar del que sube (cosmético).
