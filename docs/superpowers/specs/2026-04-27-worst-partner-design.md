# Worst Partner (Feature G) — Lomeros Padel Tour

**Fecha:** 2026-04-27
**Estado:** Aprobado, pendiente de plan de implementación
**Alcance:** Añadir una card "Peor compañero" en el perfil del jugador, simétrica a la "Mejor compañero" existente. Pura UI sobre datos ya disponibles en `pairStats`.

---

## Contexto

El perfil del jugador ya muestra una card "🤝 Mejor compañero" — el partner con mayor win rate (filtrado a `matchesPlayed >= 2`). Esta feature añade su contraparte: "😬 Peor compañero" — el partner con menor win rate, mismo filtro.

"Mejor lado" ya está visualmente destacado dentro de la card "🎾 Lado de pista" (Feature C). No requiere cambios adicionales.

## Decisiones

**Mismo filtro:** sólo se consideran parejas con `matchesPlayed >= 2`. Esto es lo que hace `bestPartner` hoy. Mantengo coherencia.

**Edge case duplicado:** si el jugador solo tiene 1 partner con 2+ partidos juntos, "Mejor" y "Peor" serían el mismo. En ese caso solo se muestra "Mejor compañero" (la card de "Peor" no se renderiza). Para mostrar ambas cards: 2+ partners distintos con 2+ partidos cada uno.

**Layout:** grid de 2 columnas en desktop (`sm:grid-cols-2`), apiladas en móvil. Si solo se muestra "Mejor", la card ocupa el ancho completo igual que hoy — sin regresión visual.

**Componente extraído:** `<PartnerCard variant="best" | "worst" partner={...} />` para evitar duplicar las ~30 líneas de JSX. Mismo template, solo cambia: emoji headline, color del win rate, color de fondo del avatar (verde para best, rojo para worst).

## Cambios

### 1. Nuevo componente `src/components/shared/partner-card.tsx`

```tsx
import Link from 'next/link';
import type { Player } from '@/lib/db/schema';

interface PartnerCardProps {
  variant: 'best' | 'worst';
  partner: Player;
  pairStat: {
    matchesPlayed: number;
    wins: number;
    losses: number;
  };
}

export function PartnerCard({ variant, partner, pairStat }: PartnerCardProps) {
  const winRate = Math.round((pairStat.wins / pairStat.matchesPlayed) * 100);
  const isBest = variant === 'best';
  const headline = isBest ? '🤝 Mejor compañero' : '😬 Peor compañero';
  const avatarGradient = isBest
    ? 'from-green-400 to-green-600'
    : 'from-red-400 to-red-500';
  const winRateColor = isBest
    ? winRate >= 60 ? 'text-green-600' : 'text-gray-700'
    : winRate < 40 ? 'text-red-500' : 'text-gray-700';

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">{headline}</p>
      <Link href={`/players/${partner.id}`} className="flex items-center justify-between hover:opacity-80 transition-opacity">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white text-xl font-black shadow-sm`}>
            {partner.name.charAt(0)}
          </div>
          <div>
            <p className="font-black text-gray-800">{partner.name}</p>
            <p className="text-xs text-gray-400">{pairStat.matchesPlayed} partidos juntos</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-black tabular-nums ${winRateColor}`}>{winRate}%</p>
          <p className="text-xs text-gray-400">{pairStat.wins}V · {pairStat.losses}D</p>
        </div>
      </Link>
    </div>
  );
}
```

### 2. Modificar `src/app/(public)/players/[id]/page.tsx`

(a) Añadir import:
```tsx
import { PartnerCard } from '@/components/shared/partner-card';
```

(b) Después del cálculo actual de `bestPartner` y `bestPartnerPlayer`, añadir el cálculo simétrico para `worstPartner`:

```ts
const worstPartner = pairs
  .filter((p) => p.matchesPlayed >= 2)
  .sort((a, b) => (a.wins / a.matchesPlayed) - (b.wins / b.matchesPlayed))[0];
const worstPartnerPlayer = worstPartner
  ? playerMap[worstPartner.player1Id === id ? worstPartner.player2Id : worstPartner.player1Id]
  : null;

// Only show "worst" card if it's a DIFFERENT player from "best"
const showWorstCard =
  worstPartnerPlayer &&
  bestPartnerPlayer &&
  worstPartnerPlayer.id !== bestPartnerPlayer.id;
```

(c) Reemplazar la card actual de "Mejor compañero" (el bloque que arranca con `{bestPartnerPlayer && (...)}`) con el grid:

```tsx
{bestPartnerPlayer && (
  <div className={`grid gap-4 ${showWorstCard ? 'sm:grid-cols-2' : ''}`}>
    <PartnerCard variant="best" partner={bestPartnerPlayer} pairStat={bestPartner} />
    {showWorstCard && worstPartner && (
      <PartnerCard variant="worst" partner={worstPartnerPlayer} pairStat={worstPartner} />
    )}
  </div>
)}
```

### 3. Tests
Sin tests nuevos. La lógica de "worst" es exactamente "best" con sort invertido, totalmente derivada de los datos. Los 49 tests existentes siguen pasando.

## Verificación

- `npx tsc --noEmit && npm run lint && npm test` — clean, 49 tests.
- Manual post-deploy:
  1. Perfil con 0 partners ≥ 2 partidos → no se muestra ninguna card de partner.
  2. Perfil con 1 partner ≥ 2 partidos → solo se muestra "Mejor compañero" (ancho completo).
  3. Perfil con 2+ partners distintos ≥ 2 partidos cada uno → se muestran ambas cards en grid.
  4. Confirmar que worst.winRate ≤ best.winRate.
  5. Click en cualquiera de las 2 cards → navega al perfil de ese partner.

## Sin cambios

Schema, API, migración, lógica de Elo, recommend-pairs, recommend-sides, side-stats, head-to-head, otras páginas.

## Archivos afectados

**Creados (1):**
- `src/components/shared/partner-card.tsx`

**Modificados (1):**
- `src/app/(public)/players/[id]/page.tsx`
