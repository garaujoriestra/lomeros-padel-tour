# Share Match (Feature H) — Lomeros Padel Tour

**Fecha:** 2026-04-27
**Estado:** Aprobado, pendiente de plan de implementación
**Alcance:** Generar una OpenGraph image dinámica para cada match detail page (vía la convención de Next 16) y añadir un botón "Compartir" en partidos completados que dispara `navigator.share` con fallback a WhatsApp click-to-chat.

---

## Contexto

Cuando los usuarios comparten la URL de un partido en WhatsApp/Telegram/Twitter, queremos que aparezca un preview rico (imagen + título). Hoy WhatsApp solo muestra el dominio. Con `next/og` (ya usado en Feature 5 PWA para iconos) podemos generar una PNG bonita por partido. Adicionalmente, un botón de "Compartir" facilita el primer click — `navigator.share` o un link a `wa.me/?text=URL`.

Alcance acordado: solo en match detail page, solo para partidos completados.

## Decisiones

**OG image siempre disponible** (también para scheduled): la convención de Next 16 genera la imagen desde la URL del partido. Si alguien comparte manualmente la URL de un scheduled match, la preview muestra "VS" en lugar de marcador. Cero coste extra, mejor UX.

**Botón solo en completed**: la entry point estandarizada para "compartir mi resultado" es solo cuando hay resultado.

**Web Share API + fallback `wa.me`**:
- `navigator.share` está disponible en iOS Safari, Android Chrome, parte de desktop (Edge, Safari macOS). En desktop Chrome/Firefox típico → no.
- Si no está disponible: `window.open('https://wa.me/?text=' + encodeURIComponent(text))` abre WhatsApp web/app con texto y URL pre-cargados. WhatsApp luego fetcha la URL y renderiza la OG image automáticamente.

**Texto del share** (cuando se invoca):
```
🎾 [Equipo 1 - nombres] vs [Equipo 2 - nombres] · 6-3 / 4-6 / 6-2 · LPT
[URL del partido]
```

Usamos los marcadores set-by-set en el texto (más informativo que solo "2-1") porque cabe sin problema y es lo que un padelista quiere leer.

## Cambios

### 1. OG image dinámica

Crear `src/app/(public)/matches/[id]/opengraph-image.tsx` siguiendo la convención de Next 16.

```tsx
import { ImageResponse } from 'next/og';
import { db } from '@/lib/db';
import { matches, matchSets, players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Resultado del partido';

export default async function Image({ params }: { params: { id: string } }) {
  const [match] = await db.select().from(matches).where(eq(matches.id, params.id));
  if (!match) {
    return new ImageResponse(<div>Partido no encontrado</div>, { ...size });
  }

  const allPlayers = await db.select().from(players);
  const pMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const sets = match.status === 'completed'
    ? await db.select().from(matchSets).where(eq(matchSets.matchId, params.id)).then((s) => s.sort((a, b) => a.setNumber - b.setNumber))
    : [];

  const t1Sets = sets.filter((s) => s.team1Games > s.team2Games).length;
  const t2Sets = sets.filter((s) => s.team2Games > s.team1Games).length;

  const t1Names = `${pMap[match.team1Player1Id]?.name ?? '?'} / ${pMap[match.team1Player2Id]?.name ?? '?'}`;
  const t2Names = `${pMap[match.team2Player1Id]?.name ?? '?'} / ${pMap[match.team2Player2Id]?.name ?? '?'}`;

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #052e16 0%, #14532d 50%, #064e3b 100%)',
        color: 'white',
        padding: '60px 80px',
        fontFamily: 'sans-serif',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 28, color: '#86efac', fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 40 }}>🎾</span>
            <span>Lomeros Padel Tour</span>
          </div>
          <span style={{ color: '#bbf7d0' }}>{match.date}</span>
        </div>

        {/* Center: teams + score */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, fontSize: 44, fontWeight: 800, color: match.winnerTeam === 1 ? '#4ade80' : 'white', opacity: match.winnerTeam === 2 ? 0.5 : 1 }}>
            <span>{pMap[match.team1Player1Id]?.name ?? '?'}</span>
            <span>{pMap[match.team1Player2Id]?.name ?? '?'}</span>
            {match.winnerTeam === 1 && <span style={{ fontSize: 24, color: '#4ade80', marginTop: 8 }}>🏆 Ganador</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            {match.status === 'completed' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 110, fontWeight: 900 }}>
                  <span style={{ color: match.winnerTeam === 1 ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>{t1Sets}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 80 }}>—</span>
                  <span style={{ color: match.winnerTeam === 2 ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>{t2Sets}</span>
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 28, fontFamily: 'monospace', color: '#a7f3d0' }}>
                  {sets.map((s) => (
                    <span key={s.setNumber}>{s.team1Games}-{s.team2Games}</span>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 80, fontWeight: 900, color: '#86efac' }}>VS</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, alignItems: 'flex-end', textAlign: 'right', fontSize: 44, fontWeight: 800, color: match.winnerTeam === 2 ? '#4ade80' : 'white', opacity: match.winnerTeam === 1 ? 0.5 : 1 }}>
            <span>{pMap[match.team2Player1Id]?.name ?? '?'}</span>
            <span>{pMap[match.team2Player2Id]?.name ?? '?'}</span>
            {match.winnerTeam === 2 && <span style={{ fontSize: 24, color: '#4ade80', marginTop: 8 }}>🏆 Ganador</span>}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'center', fontSize: 24, color: '#86efac' }}>
          {match.location ? `📍 ${match.location}` : ' '}
        </div>
      </div>
    ),
    { ...size },
  );
}
```

(Sí, JSX en un endpoint — `next/og` lo soporta vía `ImageResponse`. Mismo patrón que `app/icon.tsx` y `app/apple-icon.tsx` ya en uso.)

### 2. Componente cliente `<ShareMatchButton>`

Crear `src/components/shared/share-match-button.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface ShareMatchButtonProps {
  url: string;     // absolute URL of the match detail page
  title: string;   // page title for share sheet
  text: string;    // text body for the share (without the URL — APIs add it separately)
}

export function ShareMatchButton({ url, title, text }: ShareMatchButtonProps) {
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    setSharing(true);
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share({ title, text, url });
      } else {
        // Fallback: open WhatsApp click-to-chat with prefilled text + url
        const fullText = `${text}\n${url}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, '_blank');
      }
    } catch (e) {
      // User canceled the share sheet — ignore silently.
      // Other errors (e.g. permission denied) — show toast.
      if (e instanceof Error && e.name !== 'AbortError') {
        toast.error('No se pudo compartir');
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={handleShare}
      disabled={sharing}
      className="min-h-[40px] px-4 text-sm bg-green-600 hover:bg-green-700 text-white font-bold"
    >
      📤 {sharing ? 'Compartiendo...' : 'Compartir resultado'}
    </Button>
  );
}
```

### 3. Renderizar en match detail page

`src/app/(public)/matches/[id]/page.tsx`:

(a) Importar:
```tsx
import { ShareMatchButton } from '@/components/shared/share-match-button';
import { headers } from 'next/headers';
```

(b) Calcular la URL absoluta para pasar al botón. Next no expone request URL en server components fácilmente, pero podemos derivarla de `headers()`:

```ts
const headersList = await headers();
const host = headersList.get('host') ?? 'lomeros-padel-tour.vercel.app';
const proto = host.includes('localhost') ? 'http' : 'https';
const matchUrl = `${proto}://${host}/matches/${match.id}`;
```

(c) Construir el texto del share (solo si match.status === 'completed'):

```ts
const t1NamesShort = `${t1p1?.name ?? '?'} / ${t1p2?.name ?? '?'}`;
const t2NamesShort = `${t2p1?.name ?? '?'} / ${t2p2?.name ?? '?'}`;
const setsString = sets.map((s) => `${s.team1Games}-${s.team2Games}`).join(' / ');
const shareText = match.status === 'completed'
  ? `🎾 ${t1NamesShort} vs ${t2NamesShort} · ${setsString} · LPT`
  : '';
```

(d) Renderizar el botón después del cierre del hero `</div>` y antes de la sección recommender. Solo para completed:

```tsx
{match.status === 'completed' && (
  <div className="flex justify-end">
    <ShareMatchButton
      url={matchUrl}
      title="Resultado del partido — LPT"
      text={shareText}
    />
  </div>
)}
```

### Sin metadata.openGraph manual

Next 16 genera automáticamente las meta-tags `og:image` para una ruta cuando hay un archivo `opengraph-image.tsx` en el mismo segmento. No requiere código adicional en `generateMetadata`.

## Verificación

- `npx tsc --noEmit && npm run lint && npm test` — todo verde, 49 tests.
- Manual post-deploy:
  1. Abrir un match completado → confirmar botón "📤 Compartir resultado" visible bajo el hero.
  2. Click → en mobile, sheet del SO; en desktop, abre WhatsApp web con texto pre-rellenado.
  3. Pegar la URL del partido en WhatsApp manualmente → debe aparecer la OG image como preview.
  4. Abrir directamente `<URL_DEL_PARTIDO>/opengraph-image` en el navegador → ver la imagen renderizada con jugadores + marcador.
  5. Match scheduled: no aparece el botón de compartir, pero la URL/og-image sigue funcionando si alguien la comparte manualmente (muestra "VS" en lugar de marcador).

## Sin cambios

Schema, API, migración, otras páginas, lógica de Elo, helpers de rating, otros forms/admin.

## Archivos afectados

**Creados (2):**
- `src/app/(public)/matches/[id]/opengraph-image.tsx`
- `src/components/shared/share-match-button.tsx`

**Modificados (1):**
- `src/app/(public)/matches/[id]/page.tsx`

## Notas / edge cases

- Si los nombres de los jugadores son muy largos, la OG image puede desbordar. Para v1, asumo nombres < 25 caracteres (es un grupo de amigos, controlado por admin).
- `headers()` en server components requiere `await` en Next 16 — incluido arriba.
- El fallback `wa.me` no soporta enviar imágenes vía URL; pero como WhatsApp renderiza la OG image automáticamente cuando ve la URL, no hace falta.
- Si `navigator.share` lanza `AbortError` (usuario canceló la sheet), no mostramos toast — es UX normal.
