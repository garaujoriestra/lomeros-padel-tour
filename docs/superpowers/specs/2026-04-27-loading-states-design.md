# Loading States — Lomeros Padel Tour

**Fecha:** 2026-04-27
**Estado:** Aprobado, pendiente de plan de implementación
**Alcance:** Añadir feedback visual instantáneo al navegar entre páginas públicas para resolver la queja "tarda en cambiar de pantalla y no veo nada hasta que aparece la nueva".

---

## Contexto y problema

El usuario reporta que al hacer click en un link, la página actual se queda congelada unos segundos sin ninguna pista visual de que algo está pasando, hasta que finalmente aparece la nueva página. Es la sintomatología clásica de Next.js App Router cuando faltan archivos `loading.tsx`: las server components se generan en el servidor antes de poder renderizarse, y durante esos segundos el usuario no recibe feedback.

La solución es añadir `loading.tsx` por ruta — Next muestra ese contenido **al instante** durante la transición, mientras el servidor genera la nueva página. Bien diseñados, los skeletons reproducen la silueta del contenido final, así que la transición se percibe fluida (no hay "salto" cuando llega el contenido real).

## Decisión de diseño

**Patrón elegido (Enfoque 2):** Skeletons que imitan el layout real de cada ruta.

- Cada `loading.tsx` reproduce el hero verde, los podios, las tablas, las match cards, etc. con bloques grises animados de las mismas dimensiones que el contenido real.
- Sin librería externa: solo `animate-pulse` de Tailwind v4 sobre `bg-gray-200` (y `bg-green-800/40` dentro de los heroes verdes).
- Cuatro primitivas reusables (`SkeletonBox`, `SkeletonText`, `SkeletonHero`, `SkeletonMatchCard`) para no repetir markup.

Alternativas descartadas:
- **Enfoque 1 (skeletons grises mínimos):** más rápido de implementar pero produce un "salto" visual notable cuando llega el contenido real.
- **Enfoque 3 (Streaming/Suspense por sección):** demasiado coste arquitectónico para la ganancia incremental sobre el 2 — Turso ya responde rápido, el bottleneck percibido es el feedback de navegación, no el tiempo de query.

## Alcance

Reciben `loading.tsx` las rutas públicas que (a) consultan la DB y (b) tienen tráfico relevante:

```
src/app/(public)/
├── loading.tsx              fallback genérico
├── rankings/
│   ├── loading.tsx
│   └── pairs/
│       └── loading.tsx
├── matches/
│   ├── loading.tsx
│   └── [id]/
│       └── loading.tsx
└── players/
    └── [id]/
        └── loading.tsx
```

**Sin loading.tsx:**
- `/info` — página estática, no consulta DB.
- `/admin/*` — uso interno, fuera del alcance v1.
- `/login` — instantáneo, no necesita.

## Arquitectura

### Primitivas compartidas

**Nuevo archivo:** `src/components/shared/skeletons.tsx`

```tsx
import { cn } from '@/lib/utils';

export function SkeletonBox({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-gray-200 rounded-lg', className)} />;
}

export function SkeletonText({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-gray-200 rounded h-4', className)} />;
}

export function SkeletonHero({ tall = false }: { tall?: boolean }) {
  // Reproduce el hero verde (rounded-xl sm:rounded-2xl bg-gradient-to-r ... p-5 sm:p-7 md:p-10).
  // tall=true → padding mayor (matches home/info/players[id]).
  // tall=false → padding estándar (matches rankings/matches/pairs).
  // Internamente: bloques bg-green-800/40 simulando título y subtítulo.
}

export function SkeletonMatchCard() {
  // Reproduce <MatchCard> en su variante mobile-stacked y desktop-horizontal.
  // Usa los mismos breakpoints (sm:hidden / hidden sm:grid) y dimensiones que el componente real.
}
```

### Skeletons compuestos por ruta

Cada `loading.tsx` es un componente sin props que combina primitivas para reproducir el layout de su ruta correspondiente.

| Ruta | Estructura del skeleton |
|---|---|
| `(public)/loading.tsx` | `<SkeletonHero />` + 3 `<SkeletonBox>` rectangulares (~120px alto) |
| `rankings/loading.tsx` | `<SkeletonHero />` + Podium shape (3 cards: silver-gold-bronze con gold más alta) + 8 filas de tabla (cada fila: avatar circular + 2 líneas de texto + número ELO) |
| `rankings/pairs/loading.tsx` | `<SkeletonHero />` + grid de 3 cards de pareja (cada card: medalla circular + 2 jugadores apilados + stats row 4 columnas) + 6 filas de tabla |
| `matches/loading.tsx` | `<SkeletonHero />` + 4 `<SkeletonMatchCard>` apiladas con `space-y-4` |
| `matches/[id]/loading.tsx` | Hero apilado (breadcrumb + 2 nombres equipo 1 + score block + 2 nombres equipo 2) + bloque `<SkeletonBox>` para sección secundaria |
| `players/[id]/loading.tsx` | `<SkeletonHero tall />` con avatar cuadrado + nombre + badges → grid 2x2 sm:4 cols de stats → `<SkeletonBox className="h-3" />` win rate bar → `<SkeletonBox className="h-48" />` chart → 5 filas de historial |

## Detalles de implementación

**Animación:** Tailwind v4 ya incluye `animate-pulse` (palpita opacidad 1 → 0.5 → 1 cada 2s). No requiere config.

**Paleta:**
- Fuera de heroes: `bg-gray-200`.
- Dentro del hero verde: `bg-green-800/40` para mantener legibilidad sobre el fondo gradiente.

**Sin estado, sin client-side JS:** todos los `loading.tsx` son server components puros — Next los streamea al instante sin pasar por React.

**Dimensiones:** cada skeleton replica las clases responsive del componente real (`p-5 sm:p-7 md:p-10`, `text-2xl sm:text-3xl md:text-4xl`, etc.) para que la silueta sea idéntica antes y después de la carga.

**Sin overlay de "Cargando…":** el skeleton ya comunica que algo está cargando. Añadir un texto explícito sería ruido.

## Verificación

- `npx tsc --noEmit` y `npm run lint` deben pasar.
- `npm test` (los 23 tests de Elo) deben seguir pasando.
- Verificación manual visual: con `npm run dev`, en Chrome DevTools mobile mode, throttle Network a "Slow 3G" → click entre páginas y confirmar que:
  1. El skeleton aparece **al instante** al hacer click (sin pantalla blanca intermedia).
  2. El skeleton tiene aproximadamente la silueta de la página final (no hay un "salto" notable cuando llega el contenido real).
  3. La animación `animate-pulse` se ve suave.

## Archivos afectados

**Nuevos (7):**
- `src/components/shared/skeletons.tsx` (primitivas)
- `src/app/(public)/loading.tsx` (fallback)
- `src/app/(public)/rankings/loading.tsx`
- `src/app/(public)/rankings/pairs/loading.tsx`
- `src/app/(public)/matches/loading.tsx`
- `src/app/(public)/matches/[id]/loading.tsx`
- `src/app/(public)/players/[id]/loading.tsx`

**Modificados:** ninguno. Es feature aditiva pura.

**Sin tocar:** `/info`, `/login`, `/admin/*`, schema de DB, lógica de Elo, componentes existentes.
