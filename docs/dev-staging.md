# Entorno de staging y dev tooling (Fase 2 · Tarea 0)

Aísla los previews y el dev local de la base de Lomeros (PRO). Ver el diseño en
`docs/superpowers/specs/2026-06-23-multitenant-fase2-tarea0-design.md`.

## Setup (una vez, en las cuentas del owner)
1. `turso db create lomeros-staging` → obtener URL y token.
2. `vercel env add TURSO_DATABASE_URL preview` / `... development` → URL de staging.
   `vercel env add TURSO_AUTH_TOKEN preview` / `... development` → token de staging.
   (NO tocar el scope Production.)
3. Secretos propios en Preview: `AUTH_SECRET`, `CRON_SECRET`, claves VAPID, token de Blob
   (idealmente un store de Blob separado para no mezclar avatares con PRO).

## Montar/resetear el esquema de staging
- Montar: `curl -X POST https://<preview-url>/api/dev/seed-staging` (idempotente: corre
  init-db + migrate-auth + migrate-tournaments + migrate-multitenant + tablas auxiliares y
  siembra el "Grupo Demo").
- Reset: recrear la DB Turso de staging y volver a hacer el POST.

## Dev-login (probar sin Google)
- Página: `/dev-login` (solo si `VERCEL_ENV !== 'production'`; en prod da 404).
- Botones para entrar como un usuario existente, o un campo para "entrar como nuevo"
  (crea un usuario sin membership = estado de onboarding).
- Endpoint subyacente: `POST /api/auth/dev-login { email }`.

## Dev local contra staging
Tras el paso 2, `vercel env pull .env.local` baja la URL/token de staging (no-sensitive).
`AUTH_SECRET` sigue siendo *sensitive*: ponlo a mano en `.env.local`. Luego `npm run dev` y
usa `/dev-login`.

## Guard (cómo se bloquea en producción)
Tanto `/dev-login` (página) como `/api/auth/dev-login` y `/api/dev/seed-staging` (endpoints)
comparten el guard `isDevToolingEnabled()` (`src/lib/auth/dev-login.ts`): `VERCEL_ENV !== 'production'`.
En producción Vercel fija `VERCEL_ENV='production'` → la página da 404 y los endpoints 403.
Es un check de entorno, no un flag: no se puede activar por error en prod.
