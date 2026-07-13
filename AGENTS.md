<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Arquitectura y reglas del repo

Foto completa del proyecto en [`README.md`](./README.md) (estado, stack, rutas, modelo
multi-tenant, esquema de BD, roadmap). Reglas que **no** son negociables al escribir código:

- **Acceso a BD:** `src/app/**` NUNCA usa Drizzle directamente sobre las tablas raíz
  (`players`, `matches`, `rewards`, `tournaments`). Todo pasa por el DAL del dominio en
  `src/lib/<dominio>/queries.ts`. Lo verifica el guard `npm run check:db-access` (en CI).
- **Multi-tenant:** la app es multi-tenant. Las tablas de tenant llevan `group_id`. Las
  escrituras van tras `requireGroupAdmin(targetGroupId)` / `requireGroupSession(...)`; nunca
  filtres datos entre grupos (hay e2e `no-fuga-*` que lo vigilan). El `middleware` de Next
  se llama aquí **`proxy`** (`src/proxy.ts`).
- **Migraciones:** no se usa `drizzle-kit migrate` en prod, sino **endpoints HTTP POST
  idempotentes** (`/api/init-db`, `/api/migrate-*`). Si añades columnas nuevas, **migra prod
  ANTES de desplegar** el código que las lee (el build prerenderiza lecturas).
- **Al terminar:** commit + push a `main` sin preguntar (Vercel auto-despliega).

# Testing

Toda funcionalidad nueva debe ir acompañada de **tests e2e de Playwright** que la verifiquen en el navegador (flujo real de usuario), además de los tests unitarios que correspondan. No des una feature por terminada sin su cobertura e2e.

- La suite vive en `e2e/` y se ejecuta con `npm run e2e` (Playwright arranca `next dev -p 3100` contra una DB SQLite de fichero aislada y cookies de sesión forjadas — no toca producción ni Google OAuth). Detalles en `e2e/README.md`.
- Patrón: usar la API para montar el estado (rápido y estable) y la UI para las aserciones de interacción real.
