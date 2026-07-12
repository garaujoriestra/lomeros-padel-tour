# Fase 3 — Marca propia + Pase de Temporada (paywall apagado)

**Fecha:** 2026-07-12 · **Estado:** brainstormeado y aprobado por el usuario en sesión. Ancla: estrategia de comercialización (`2026-06-14-comercializacion-estrategia.md` §1-2, fila "Fase 3" del roadmap). Prerrequisitos ya en main: Fase 2 completa (slug routing, onboarding PR #27, conmutador PR #26).

## 1. Decisiones del usuario (2026-07-12)

1. **Alcance: todo, con el paywall APAGADO.** Se construye el branding completo Y la integración Stripe entera, pero el cobro queda tras un flag (`BILLING_ENABLED`) apagado: mientras tanto **todo grupo cuenta como de pago** (beta gratis a 3-5 grupos, como manda la estrategia). Encender la caja = poner una env var, sin deploy de código nuevo.
2. **Branding = logo + UN color de acento.** El nombre ya existe (gratis, de Tarea 2). El resto del design system (dark/light, tipografía, superficies) queda fijo: imposible romper la estética.
3. **El Pase de Temporada compra identidad visual, nada funcional:** logo + color + quitar la atribución "hecho con Lomeros Padel Tour" + badge ⭐ Tour Oficial. La función (Timba, logros, torneos, push, historial) es gratis para siempre — línea roja de la estrategia.
4. **Stripe Checkout de pago único** (~20 €/año): webhook → `paid_until = +1 año`. Renovar = volver a pagar. Sin suscripciones, sin portal de cliente, sin facturación manual.

## 2. Datos

- Columnas nuevas en `groups`: `logo_url TEXT` (null = sin logo), `accent_color TEXT` (hex `#rrggbb`, null = acento por defecto), `paid_until TEXT` (ISO date, null = nunca pagó).
- Migración idempotente `/api/migrate-branding` (ALTER TABLE ADD COLUMN, patrón `migrate-multitenant`; extraída a `src/lib/db/migrations/` y añadida a `ensureAuxTables`/orden del e2e global-setup si aplica).
- Helper puro `isPaidGroup(group, now)` en `src/lib/billing/`: `BILLING_ENABLED !== 'true'` → **true para todos**; encendido → `paid_until > now`. Único punto de verdad del gating.
- `GroupRow` (DAL `src/lib/groups/queries.ts`) amplía a `logoUrl/accentColor/paidUntil` — llega ya a layouts vía `resolvePageContext().group`.

## 3. Dónde se aplica (solo `/g/[slug]`; la raíz de Lomeros NO se toca)

- **Navbar de grupo** (`g/[slug]/layout`): la marca pasa a ser **nombre del grupo** (gratis, para todos los grupos — hoy muestra "Lomeros Padel Tour", que era atribución provisional del MVP). Si `isPaidGroup`: su **logo** (sustituye al Crest) y **⭐** junto al nombre. Si NO de pago: Crest por defecto + atribución discreta "hecho con Lomeros Padel Tour" en un footer del layout de grupo (elemento nuevo, solo bajo `/g/`).
- **Color de acento**: el layout de grupo inyecta el override de `--acc` (y sus derivadas `--on-acc`/`--acc-text`, que en `globals.css` se computan con `color-mix` en `:root` y NO se recalculan solas al sobreescribir `--acc` en un wrapper — hay que redeclararlas juntas en el wrapper) vía `style` en el contenedor del layout. Solo si `isPaidGroup` y hay `accent_color`.
- **OG image**: ya lee `group.name` (1D); se añade la ⭐ si `isPaidGroup`. Nada más.
- El branding guardado **no se borra al expirar el pase**: simplemente deja de aplicarse (vuelve acento por defecto, sin logo/⭐, con atribución).

## 4. Admin de grupo: sección "Marca"

- Nueva página `/g/[slug]/admin/marca` (+ entrada en `AdminSidebar` bajo grupo):
  - **Logo**: subida a Blob calcando `/api/upload` de avatares (validación imagen + 2MB), key `logos/{groupId}/{uuid}.{ext}` (helper junto a `buildAvatarKey`), pero **solo admin del grupo** (`requireGroupAdmin`, no `requireSession`) — endpoint propio `POST /api/upload/logo` con `body.g`.
  - **Color de acento**: `<input type="color">` + preview; validación hex en servidor.
  - **Pase de Temporada**: estado ("activo hasta X" / "tu grupo usa la marca por defecto") y botón "Conseguir el Pase" → Checkout. Con `BILLING_ENABLED` apagado, la sección de pago muestra "incluido durante la beta" (sin botón de pago).
- `PUT /api/groups/branding` (requireGroupAdmin + `body.g`): guarda `logo_url`/`accent_color`. La raíz (Lomeros) no tiene esta página — es el grupo por defecto y su marca es la del producto.

## 5. Stripe (dormido tras `BILLING_ENABLED`)

- `POST /api/billing/checkout` (requireGroupAdmin + `body.g`): crea Checkout Session de pago único (`STRIPE_PRICE_ID`), `metadata.groupId`, success/cancel → `/g/<slug>/admin/marca`. 503/"beta" si `BILLING_ENABLED` apagado.
- `POST /api/billing/webhook`: verifica firma (`STRIPE_WEBHOOK_SECRET`), maneja `checkout.session.completed` → `paid_until = max(hoy, paid_until) + 1 año` (extiende, no pisa). Idempotente por `event.id` (log tabla o UPDATE condicionado). Handler puro separado del transporte para unit-testearlo sin Stripe.
- Env nuevas: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `BILLING_ENABLED` (las tres primeras solo hacen falta cuando se encienda; el código no debe romper sin ellas mientras esté apagado).
- SDK oficial `stripe` (server-only). El webhook necesita el body RAW (no JSON parseado) para la firma.

## 6. Testing

- **Unit:** `isPaidGroup` (flag off → siempre true; on → por fecha), validación de hex, handler del webhook (completed → extiende paid_until; firma/evento desconocido → no-op), key del logo.
- **e2e** (`e2e/group-branding.spec.ts`): (1) admin de grupo guarda color+nombre vía API y la home `/g/grupo-test` aplica el acento y muestra su nombre en el navbar; (2) `PUT /api/groups/branding` cross-grupo (admin de Lomeros) → 403; (3) webhook con firma de test activa `paid_until` (flag on en un server-env de test o handler unit); (4) con flag on y grupo sin pase: sin ⭐, con atribución, acento por defecto. El detalle de cómo encender el flag solo para ciertos tests se resuelve en el plan (probablemente: flag on en el webServer e2e + grupo-test con `paid_until` sembrado, y un grupo extra sin pase).
- Guard `check:db-access` intacto (todo pasa por DAL).

## 7. No-rotura y coordinación

- Raíz de Lomeros: cero diff visual (todo lo nuevo vive bajo `/g/` y en admin de grupo).
- **Cambio visible aceptado** en `/g/<slug>`: el navbar de grupo pasa de "Lomeros Padel Tour" a nombre del grupo + atribución. Es la intención del producto (era provisional del MVP de paridad).
- Con `BILLING_ENABLED` apagado (default), Stripe no se toca en runtime: sin claves configuradas nada rompe.
- ⚠️ **Tarea 2b corre en paralelo** (otra sesión) y toca `AdminSidebar`/admin de grupo → conflicto esperado y pequeño en el rebase de esta rama; resolver al mergear.
