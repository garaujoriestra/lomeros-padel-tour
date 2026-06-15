<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Testing

Toda funcionalidad nueva debe ir acompañada de **tests e2e de Playwright** que la verifiquen en el navegador (flujo real de usuario), además de los tests unitarios que correspondan. No des una feature por terminada sin su cobertura e2e.

- La suite vive en `e2e/` y se ejecuta con `npm run e2e` (Playwright arranca `next dev -p 3100` contra una DB SQLite de fichero aislada y cookies de sesión forjadas — no toca producción ni Google OAuth). Detalles en `e2e/README.md`.
- Patrón: usar la API para montar el estado (rápido y estable) y la UI para las aserciones de interacción real.
