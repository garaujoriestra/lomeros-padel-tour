# Fase 2 (multi-tenant) — Documento de arranque

**Fecha:** 2026-06-23
**Estado:** Fase 1 COMPLETA y en prod (origin/main, 1A+1B+1C+1D). Este documento NO es todavía un
spec brainstormeado ni un plan de implementación: es la **groundwork** de Fase 2 y, sobre todo, fija
la **Tarea 0** (entornos de preview con BBDD aislada) como el primer trabajo a hacer, antes de tocar
nada de onboarding. El alcance funcional de Fase 2 (§2) se cerrará con un `brainstorming` propio
cuando arranquemos.

**Decisión del usuario (2026-06-23):** **empezar Fase 2 por la Tarea 0.** Antes de escribir la
primera línea de onboarding, montar previews que no toquen producción.

---

## 0. Por qué esto va PRIMERO

Las Fases 1A–1D eran "fontanería invisible": migraciones **idempotentes** sobre un único tenant
(Lomeros), sin crear datos nuevos → trabajar con cuidado sobre PRO era asumible.

**Fase 2 es distinta:** crea **grupos nuevos, flujos de onboarding, usuarios que reclaman ficha,
routing por slug**. Es decir, vas a **generar datos de prueba** (p. ej. un "Grupo Test" con su
admin y jugadores) que **no deben ensuciar la base de Lomeros real**. Por eso el aislamiento de
entornos deja de ser opcional y se convierte en el cimiento sobre el que se construye el resto.

**Hallazgo clave (buena noticia):** aislar PRO **no requiere ningún cambio de código**. El cliente
de DB lee la conexión directamente de variables de entorno:

```ts
// src/lib/db/index.ts:5-8
export const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});
```

No hay nada hardcodeado ni lógica por entorno. Por tanto, **aislar es puramente cuestión de a qué
apunta `TURSO_DATABASE_URL` en cada scope de Vercel.**

---

## 1. TAREA 0 — Entornos de preview con BBDD aislada de PRO

### 1.1 Situación de partida

- **Una sola BBDD** (Turso de producción).
- Las `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` solo están en el scope **Production** de Vercel
  (ver memoria `local-dev-db-env`). Los previews ni siquiera tienen credenciales (o, si las
  heredaran, pegarían a PRO).

### 1.2 Montaje recomendado (80/20, sin sobre-ingeniería)

Una **única BBDD de staging compartida** por todos los previews + dev local. Aísla de PRO, que es lo
que de verdad importa. DBs efímeras *por-PR* son posibles pero **overkill** para un side project
low-maintenance; descartadas por ahora.

1. **Crear una 2ª BBDD Turso** de staging:
   ```bash
   turso db create lomeros-staging
   turso db show lomeros-staging --url        # → TURSO_DATABASE_URL de staging
   turso db tokens create lomeros-staging     # → TURSO_AUTH_TOKEN de staging
   ```
2. **Apuntar los scopes Preview y Development de Vercel** a esa staging (NO tocar Production):
   ```bash
   vercel env add TURSO_DATABASE_URL preview        # pega la URL de staging
   vercel env add TURSO_AUTH_TOKEN  preview         # pega el token de staging
   vercel env add TURSO_DATABASE_URL development     # misma staging para `vercel env pull` local
   vercel env add TURSO_AUTH_TOKEN  development
   ```
   Vercel separa las env vars por entorno (Production / Preview / Development) — esto es nativo.
3. **Resultado:** cada preview deploy (cada rama/PR) y tu `npm run dev` local (tras
   `vercel env pull`) pegan a **staging**; PRO queda intacta. Puedes crear "Grupo Test", probar
   onboarding, romper cosas y resetear sin miedo.
4. **Montar el esquema en la staging fresca** = correr una vez los endpoints idempotentes
   `/api/init-db` + `/api/migrate-*` contra el deploy de staging (mismo patrón que usa el
   global-setup de e2e). Reset = recrear la DB Turso y volver a tirar de esos endpoints. Barato.

### 1.3 Tres gotchas que Fase 2 va a tocar (resolver dentro de la Tarea 0)

- **Login con Google en previews = el incómodo.** Google exige registrar las *redirect URIs*, y las
  URLs de preview son dinámicas (`...-git-rama-...vercel.app`) → el login se rompe en previews. Dos
  salidas:
  - (a) Asignar un **dominio estable** al branch de staging (alias fijo en Vercel, p. ej.
    `staging.lomeros…`) y registrar su callback en la consola de Google.
  - (b) **[RECOMENDADO para Fase 2]** un **dev-login detrás de un guard** (solo cuando
    `process.env.VERCEL_ENV !== 'production'`) que **forje la sesión** como ya hace e2e, para probar
    onboarding sin pasar por Google. La maquinaria ya existe: `e2e/global-setup.ts` firma un JWT de
    sesión con `jose`/`AUTH_SECRET`. **OJO post-1C:** el JWT de sesión lleva **solo `userId`** (el
    rol sale de `memberships`), así que el dev-login firma `{ userId }` y el usuario necesita una
    **membership** en el grupo objetivo para tener rol. El guard DEBE impedir que exista en
    producción (no es solo un flag: comprobar `VERCEL_ENV`).
- **Otros secretos en el scope Preview:** `AUTH_SECRET`, `CRON_SECRET`, claves **VAPID**, y el token
  de **Blob**. Convendrá un set propio para Preview. En particular el **Blob**: mejor un *store
  separado* para no mezclar avatares de staging con los de PRO (los avatares ya van namespaceados
  `avatars/{groupId}/…` desde 1D, pero apuntan al mismo store si comparten token).
- **Reset/seed:** trivial gracias a que el esquema se monta por endpoints idempotentes (§1.2.4).

### 1.4 Endpoints de bootstrap para una staging fresca

Son idempotentes (re-ejecutarlos es seguro). `init-db` crea las tablas base; `migrate-multitenant`
necesita que existan las tablas raíz antes. Referencia probada del orden mínimo:
`e2e/global-setup.ts` (corre `init-db → migrate-auth → migrate-tournaments → migrate-multitenant` y
crea a mano algunas tablas de infra). Endpoints disponibles hoy:

```
init-db
migrate-db
migrate-auth
migrate-avatars
migrate-push
migrate-bets-odds-nullable
migrate-timba-v2
migrate-tournaments
migrate-tournaments-v2
migrate-multitenant
```

Un **script de seed de staging** (a preparar) que los recorra en orden + siembre un "Grupo Test"
demo cierra la Tarea 0.

### 1.5 Reparto de trabajo

- **El usuario (interactivo, en sus cuentas):**
  - `turso db create lomeros-staging` (+ url/token).
  - `vercel env add …` en scope Preview/Development.
  - Registro en la consola de Google (solo si se elige la opción 1.3.a; con la opción 1.3.b no hace
    falta tocar Google).
  - (Opcional) crear un store de Blob separado para staging.
- **Claude prepara (código/preparación, sin tocar cuentas):**
  - El **dev-login guardado** (opción 1.3.b) con su test e2e.
  - El **script de seed de staging** que tira de los `/api/migrate-*` y siembra un "Grupo Test".
  - Actualizar el doc de dev local (`local-dev-*` en memoria) para apuntar a staging.

### 1.6 Checklist de la Tarea 0

- [ ] `turso db create lomeros-staging` + obtener URL y token.
- [ ] `vercel env add TURSO_DATABASE_URL/TURSO_AUTH_TOKEN` en **preview** y **development** → staging.
- [ ] Verificar que un preview deploy levanta contra staging (no contra PRO).
- [ ] Set de secretos propios en Preview (`AUTH_SECRET`, `CRON_SECRET`, VAPID, Blob).
- [ ] Dev-login guardado (`VERCEL_ENV !== 'production'`) que forje `{ userId }` + e2e.
- [ ] Script de seed de staging (migrate-\* + "Grupo Test" demo).
- [ ] `vercel env pull` local apunta a staging → `npm run dev` funciona sin tocar PRO.
- [ ] Doc/memoria de dev local actualizada.

---

## 2. Resto del alcance de Fase 2 (encuadre — pendiente de brainstorming)

Tras la Tarea 0, Fase 2 es el **onboarding self-service + routing por slug + UX cross-grupo**
(ver el spec de Fase 1 `docs/superpowers/specs/2026-06-18-multitenant-fase1-design.md` §11 y la
estrategia de comercialización). Es la primera fase con **cambios visibles**. Piezas previstas:

- **Routing por slug `/g/[slug]`** — meter el grupo en la URL. El resolutor `getGroupContext` ya
  acepta `targetGroupId` (preparado en 1B-0), así que aquí se "activa" lo que quedó enchufado. Aquí
  se resuelve también la deuda conocida de `requireAdmin` (que hoy resuelve el rol sobre el grupo
  por defecto; pasará a resolverlo sobre el grupo de la URL).
- **Onboarding self-service** — crear grupo → quien lo crea es admin (su `membership(admin)`) →
  invitar por link/código → cada jugador reclama su ficha. Es lo que convierte la app de tour
  privado en producto.
- **Conmutador de grupo del súper-admin** — UI para saltar entre grupos en **solo-lectura**. El
  contexto `super_admin` existe desde 1B-0 (allowlist `SUPER_ADMIN_EMAILS`), pero sin UI.

**Importante:** este alcance NO está aún brainstormeado ni planificado. El flujo del proyecto es
`brainstorming` → `writing-plans` → implementación por subagentes → revisión → push. La Tarea 0
puede arrancar ya (es infra acotada); el resto espera a su brainstorming.

Fases posteriores (referencia): Fase 3 (marca configurable nombre/logo/colores + Stripe "Pase de
Temporada"), Fase 4 (pulido para terceros: empty states, sustituir los ~13 literales "Lomeros" que
1D dejó a propósito, legal).
</content>
