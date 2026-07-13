# Lomeros Padel Tour (LPT)

Ranking oficial de una peña de pádel: **Elo 2vs2**, historial de partidos, torneos y
pozos, apuestas internas con fichas (**La Timba**), logros, planificador semanal de
disponibilidad y notificaciones push. Estética de **retransmisión deportiva** (ver
[`PRODUCT.md`](./PRODUCT.md) y [`DESIGN.md`](./DESIGN.md)). PWA instalable, primero móvil,
UI íntegramente en español (es-ES, Europe/Madrid).

La app nació como el tour privado de los «Lomeros» y hoy es **multi-tenant de punta a
punta**: puede alojar varios grupos aislados entre sí. La comercialización a otros grupos
es una estrategia activa (ver `docs/superpowers/specs/2026-06-14-comercializacion-estrategia.md`).

> Nota: el `name` de `package.json` sigue siendo `prueba_copilot` (resto del scaffold; es
> un paquete `private`, no afecta a nada).

---

## Estado del proyecto (2026-07)

Fases del plan multi-tenant + marca, todas **mergeadas a `main` y en producción**:

| Fase | Qué es | Estado |
|------|--------|--------|
| **Fase 1 (1A–1D)** | Datos, roles y transversales scopeados por grupo (fontanería invisible, un solo tenant). | ✅ En prod |
| **Fase 2** | Routing por slug `/g/[slug]`, onboarding self-service (beta cerrada), conmutador de grupos, **paridad completa** de páginas y admin bajo `/g/[slug]`. | ✅ En prod |
| **Fase 3** | **Marca por grupo** (logo + color de acento + ⭐ atribución) y **Pase de Temporada** (Stripe, pago único + webhook idempotente). | ✅ Mergeada, **dormida** tras `BILLING_ENABLED` |

**Qué está vivo vs. dormido en prod:**

- **Vivo:** todo el producto para el grupo Lomeros en la raíz (`/`, `/admin`, `/me`,
  `/planificador`). El motor multi-tenant está enchufado pero, como solo existe un grupo,
  `/g/[slug]` y el conmutador son invisibles.
- **Dormido:** el paywall del Pase (`BILLING_ENABLED` apagado → durante la beta todos los
  grupos cuentan como «de pago»: marca activa, sin atribución, sin pase real). Onboarding
  self-service (enlaces firmados) apagado hasta abrir la beta.

**Próximos pasos:** ver la sección [Roadmap](#roadmap--próximos-pasos).

---

## Stack

- **Next.js 16.2** (App Router) · **React 19.2** · **TypeScript 5**.
  ⚠️ Esta versión de Next tiene *breaking changes* respecto al conocimiento habitual —
  p. ej. el `middleware` se llama ahora **`proxy`** (`src/proxy.ts`). Consulta
  `node_modules/next/dist/docs/` antes de escribir código (regla de [`AGENTS.md`](./AGENTS.md)).
- **DB:** Drizzle ORM 0.45 sobre **Turso / libSQL** (`@libsql/client`). SQLite en dev/e2e.
- **Auth:** Google OAuth hecho a mano + sesión **JWT HS256** con `jose` (sin NextAuth).
- **UI:** Tailwind v4, shadcn, `@base-ui/react`, `lucide-react`, `next-themes`, `sonner`.
- **Forms:** `react-hook-form` + `zod`.
- **Infra:** `@vercel/blob` (avatares, fotos de partido, logos), `web-push` (notificaciones),
  Stripe (vía `fetch`, sin SDK) para el Pase.
- **Tests:** Vitest (unit) + Playwright (e2e).

Scripts (`package.json`): `dev`, `build`, `start`, `test` (vitest), `lint`,
`check:db-access` (guard, ver [Testing](#testing)), `e2e` / `e2e:ui`, `db:init`,
`db:generate` / `db:migrate`.

---

## Arquitectura

### Rutas (`src/app`)

- **Públicas** (`(public)/`, grupo por defecto): `/` (landing tipo jornada + feed +
  preview de rankings), `/rankings` · `/rankings/pairs` · `/rankings/tokens`, `/matches` ·
  `/matches/[id]`, `/players/[id]`, `/pozos/[id]`, `/torneos/[id]`, `/eventos`, `/info`.
- **Admin** (`admin/`, gating server-side): jugadores, partidos (crear/editar/resultado/lados),
  pozos, torneos, premios, canjes, La Timba, notificaciones.
- **Jugador** (`me/`): `/me`, `/me/edit`, `/me/tokens`.
- **Planificador:** `/planificador`.
- **Multi-tenant** (`g/[slug]/`): home, `me`, `planificador` y `admin` (dashboard,
  matches, players) — envoltorios finos que delegan en componentes compartidos
  `src/components/pages/*-body.tsx`.
- **Auth/misc:** `/login`, `/dev-login` (solo no-prod), `/unauthorized`, `/offline`.
- **API** (`api/`): `auth/{login,callback,logout,dev-login}`, `players`, `matches`
  (+ `result`/`sides`/`abandon`), `rankings`, `me`, `bets`, `timba/entry`, `rewards`,
  `redemptions`, `pairings/preview`, `planner`, `tournaments` (+ `generate`/`matches`/`pairs`),
  `push` (`subscribe`/`unsubscribe`/`broadcast`), `upload` (+ `match-photo`/`logo`),
  `billing/{checkout,webhook}`, `groups/branding`, `cron/match-reminders`, `dev/seed-staging`,
  y los endpoints de migración (ver [Migraciones](#migraciones)).

### Lógica de dominio (`src/lib`)

Cada dominio expone su DAL en `queries.ts`; **el código de `src/app` nunca accede a Drizzle
directamente** para las tablas raíz (lo impide el guard `check:db-access`).

- **rating/** — motor **Elo 2vs2** (`elo.ts`: rating de equipo = media de 2, K 40/32/24 por
  nº de partidos, `projectDoublesElo` para proyectar partidos programados sin persistir),
  `process-match.ts` persiste Elo individual + de pareja + `rating_history` y redetecta logros.
- **betting/** — **La Timba v2** pari-mutuel: `parimutuel.ts` (reparto puro del bote),
  `bank.ts` (débito/crédito atómico de fichas), `settle.ts`, `match-odds.ts`, `config.ts`.
- **groups/** — helpers de tenant: `resolve-slug.ts`, `constants.ts`
  (`LOMEROS_GROUP_ID='lomeros'`, `RESERVED_SLUGS`), `queries.ts` (incl. branding).
- **billing/** — Fase 3: `paid.ts` (`isPaidGroup`/`hasSeasonPass`), `pass.ts`, `stripe.ts`.
- **tournament/** — motor pozo/torneo (fixed_pairs · americano · single_elim · groups_elim):
  generación, seeding, scheduler, run/view engines, `schema-ddl.ts`.
- **planner/** — disponibilidad semanal (slots pintables, solape/coincidencias, validación).
- **players/ · matches/ · rewards/ · rankings/** — DALs scopeados por grupo + lógica de vista.
- **auth/** — sesión JWT, Google OAuth, contexto de grupo, guards, dev-login.
- **achievements/ · feed/ · push/ · og/ · format/ · upload/** — logros, feed de actividad,
  notificaciones, imágenes OG de partido, tiempo relativo, rutas de Blob.
- **db/** — cliente Drizzle (`index.ts`), `schema.ts`, `bootstrap.ts` (tablas aux para e2e/staging).

### Modelo multi-tenant

- **Ancla:** Lomeros es el tenant raíz (`groupId='lomeros'`, `DEFAULT_GROUP_SLUG` por env).
- **Slug routing:** `src/proxy.ts` valida el slug (`getGroupBySlug`) → **404 antes de
  streamear**, y redirige (308) el slug del grupo por defecto a `/` (canónico en la raíz).
- **Contexto de página:** `resolvePageContext(slug?)` → `{ groupId, group, role, player,
  isSuperAdmin, basePath }`; `basePath` es `''` para el grupo por defecto o `/g/<slug>`.
- **Súper-admin invisible por env:** `SUPER_ADMIN_EMAILS` (lista). Un súper-admin sin
  membership obtiene rol sintético `super_admin` = **solo lectura en cualquier grupo**
  (`requireGroupAdmin` lo rechaza para escrituras; `requireGroupSession` lo acepta).
- **Roles:** viven en `memberships.role` (`admin`/`player`) por grupo. El JWT de sesión
  lleva **solo `{ userId }`**; el rol se resuelve fresco desde `memberships` en cada request.
- **Aislamiento:** verificado por la familia de e2e `no-fuga-*` (ningún grupo lee/escribe
  datos de otro) y el guard `check:db-access`.

### Base de datos (`src/lib/db/schema.ts`)

Tablas principales (las de tenant llevan `group_id` con `DEFAULT 'lomeros'` de backstop):
`groups` (+ `logo_url`/`accent_color`/`paid_until` de Fase 3), `players`, `users` (identidad
global solo-email), `memberships` (rol + enlace user↔player por grupo), `matches` + `match_sets`,
`pair_stats`, `rating_history`, `player_achievements`, `push_subscriptions`, `notification_log`,
`bets` + `token_ledger`, `rewards` + `redemptions` + `penalties`, `tournaments` + `tournament_*`
(courts/participants/groups/pairs/matches), `courts` + `planner_slots`, `billing_events`.

---

## Desarrollo local

```bash
npm install
npm run dev            # http://localhost:3000
```

**Ojo (env):** `npm run dev` necesita `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`. Los
previews y el dev local apuntan a una **BBDD de staging aislada** (no a producción); ver
[`docs/dev-staging.md`](./docs/dev-staging.md). `AUTH_SECRET` es *sensitive* y hay que
ponerlo a mano en `.env.local` tras `vercel env pull`.

**Entrar sin Google:** `/dev-login` (solo cuando `VERCEL_ENV !== 'production'`) forja una
sesión por email. En prod la página da 404 y el endpoint 403 (guard `isDevToolingEnabled()`).

---

## Testing

Regla del repo ([`AGENTS.md`](./AGENTS.md)): **ninguna feature se da por terminada sin sus
tests e2e de Playwright**, además de los unitarios que correspondan.

- **Unit (Vitest):** `npm test`. ~62 ficheros `*.test.ts` co-localizados con el código
  (fuerte en `tournament/`, `betting/`, `rating/`, `auth/`, `planner/`, `billing/`).
- **E2E (Playwright):** `npm run e2e`. ~36 specs contra una DB SQLite de fichero aislada y
  cookies de sesión forjadas (no toca prod ni Google). Detalles y mapa de cobertura en
  [`e2e/README.md`](./e2e/README.md).
- **Guard `check:db-access`** (`scripts/check-direct-db-access.mjs`): prohíbe el acceso
  directo a Drizzle sobre las tablas raíz (`players`, `matches`, `rewards`, `tournaments`)
  desde `src/app/**` — todo debe pasar por `src/lib/<dominio>/queries.ts`. Se ejecuta en CI.

---

## Despliegue

- **Vercel.** Deploy automático al hacer push a `main` (Vercel lo despliega solo).
- **Crons** (`vercel.json`): `/api/cron/match-reminders?kind=day` a las 07:00 y `?kind=eve`
  a las 16:00 (auth por `Authorization: Bearer $CRON_SECRET`; deduplica vía `notification_log`).
- **Staging aislada** para previews (Fase 2 · Tarea 0): ver [`docs/dev-staging.md`](./docs/dev-staging.md).

### Migraciones

La ruta operativa **no** es `drizzle-kit migrate`, sino **endpoints HTTP POST idempotentes**
que se curlean tras el deploy (`init-db` crea las tablas base; el resto añaden/migran):
`migrate-auth`, `migrate-db`, `migrate-avatars`, `migrate-push`, `migrate-planner`,
`migrate-bets-odds-nullable`, `migrate-timba-v2`, `migrate-tournaments`,
`migrate-tournaments-v2` (destructiva), `migrate-multitenant`, `migrate-branding`.

> **Gotcha (Fase 3):** el build prerenderiza lecturas, así que hay que **migrar prod ANTES
> de desplegar** el código que usa columnas nuevas (branding), no después.

---

## Roadmap / próximos pasos

Con Fases 1–3 en prod, lo natural que queda pendiente (acordado en sesiones previas; ver
`docs/superpowers/specs/2026-06-23-multitenant-fase2-arranque.md` §2 y la estrategia de
comercialización):

- **Fase 4 — pulido para terceros:** empty states, sustituir los **literales «Lomeros»**
  de UI hardcodeados (una decena, dejados a propósito en Fase 1D), textos legales.
- **Encender la beta:** activar onboarding self-service y, más adelante, `BILLING_ENABLED`.
- **Higiene de mejoras acordadas:** security-review → auditoría `/impeccable` → revisión live.

---

## Documentación

- [`PRODUCT.md`](./PRODUCT.md) — usuarios, propósito, personalidad de marca, principios.
- [`DESIGN.md`](./DESIGN.md) — sistema de diseño (color, tipografía, componentes, reglas).
- [`AGENTS.md`](./AGENTS.md) / [`CLAUDE.md`](./CLAUDE.md) — reglas para agentes (Next 16, testing).
- [`e2e/README.md`](./e2e/README.md) — suite e2e y cobertura.
- [`docs/dev-staging.md`](./docs/dev-staging.md) — entorno de staging y dev tooling.
- [`docs/superpowers/`](./docs/superpowers/) — specs y planes históricos de cada feature
  (registro por fecha; son foto del momento, no docs mantenidos).
