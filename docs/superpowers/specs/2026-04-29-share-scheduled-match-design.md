# Share Scheduled Match — Lomeros Padel Tour

**Fecha:** 2026-04-29
**Estado:** Aprobado, pendiente de plan de implementación
**Alcance:** Habilitar el botón "Compartir por WhatsApp" en la página de detalle de partidos programados (hoy solo aparece en completed) y rediseñar la OG image para scheduled de forma que no sugiera parejas ni posiciones que aún no están decididas.

---

## Contexto

Hoy el botón de compartir solo aparece en partidos completados (Feature H, spec del 2026-04-27). Para un partido programado el flujo natural es "avisar al grupo del próximo partido", así que tiene sentido habilitar el mismo botón.

Sin embargo, la OG image actual para scheduled es engañosa: muestra a los 4 jugadores ya colocados en una pista, divididos en team1 vs team2 según el orden del schema, y en posiciones drive/revés según los campos `team1Player1Side` / `team1Player2Side` / etc. En la práctica esos campos son tentativos para un partido programado — las parejas y posiciones se deciden recién en la cancha. Compartir un preview que afirma "P1 y P2 contra P3 y P4 en estas posiciones" antes de jugar genera confusión.

## Decisiones

**Botón visible para scheduled.** Mismo componente, mismo lugar, misma estética. Sin cambios al componente `ShareMatchButton` — la URL es lo único que se comparte y WhatsApp se encarga del preview vía OG.

**OG image scheduled rediseñada como "convocatoria".** Sin pista, sin red, sin división por equipos, sin posiciones. 4 avatares en fila con nombre debajo, en orden alfabético, bajo un título grande "PRÓXIMO PARTIDO". La fecha y ubicación quedan en el header strip (donde ya están hoy), sin duplicarse en el centro. El completed se mantiene exactamente igual.

**Orden alfabético de los 4 jugadores.** Si mantenemos el orden del schema (P1, P2, P3, P4), la gente lee "los dos de la izquierda van juntos". Alfabético rompe esa lectura — comunica "estos cuatro están convocados, las parejas se sortean en la cancha".

**`generateMetadata` sin cambios.** El title (`"P1/P2 vs P3/P4 · 2026-04-30 — LPT"`) mantiene la división por equipos del schema. Bajo impacto: solo se ve en el `<title>` del navegador y en plataformas que muestran title sin imagen. La OG image — que es lo que ven los usuarios en WhatsApp — sí refleja la decisión correcta.

## Cambios

### 1. OG image — bifurcar branch scheduled

`src/app/(public)/matches/[id]/opengraph-image.tsx`:

Hoy el archivo siempre renderiza la pista con los 4 `PlayerSlot` posicionados según `resolveCourtPositions`. La bifurcación queda:

- **Si `match.status === 'completed'`:** todo el código actual sin cambios (header strip, court area con `PlayerSlot` × 4, score overlay, winner overlay, footer con "X & Y ganan").
- **Si `match.status !== 'completed'`:** nuevo layout de convocatoria.

**Layout scheduled (1200×630):**

- **Header strip:** idéntico al actual (logo + fecha + ubicación). Reutilizar.
- **Sección central** (reemplaza la pista):
  - Padding consistente con el resto.
  - Título grande: **"PRÓXIMO PARTIDO"** — fontSize 64, color `#86efac`, fontWeight 900, letterSpacing 4, textTransform uppercase.
  - Sin subtítulo de fecha/ubicación en el centro: ya aparecen en el header strip y duplicarlas resta jerarquía.
  - Fila horizontal con los 4 jugadores:
    - Avatar de ~140×140 (mismo estilo que `PlayerSlot`: borde blanco, fallback con inicial sobre gradiente verde si no hay `avatarUrl`).
    - Nombre debajo del avatar (fontSize ~28, fontWeight 800, color blanco).
    - Sin badges de drive/revés.
    - Gap horizontal generoso entre avatares (~40px) para que respire.
  - **Orden de los 4:** alfabético por `player.name` (case-insensitive, locale `es`).
- **Footer:** dejar la altura para preservar el balance visual del completed, pero vacío (sin la franja verde de "ganador").

**Implementación práctica:**

```tsx
const showScheduledLayout = match.status !== 'completed';

const fourPlayers = [
  match.team1Player1Id,
  match.team1Player2Id,
  match.team2Player1Id,
  match.team2Player2Id,
]
  .map((pid) => pMap[pid])
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));
```

Dentro del JSX, donde hoy está el bloque `<div>` con la pista (~líneas 236-361 del archivo actual):

```tsx
{showScheduledLayout ? (
  <div style={{
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
    padding: '0 60px',
  }}>
    <span style={{
      fontSize: 64,
      fontWeight: 900,
      color: '#86efac',
      letterSpacing: 4,
      textTransform: 'uppercase',
    }}>
      Próximo partido
    </span>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 40 }}>
      {fourPlayers.map((p) => (
        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {p.avatarUrl ? (
            <img src={p.avatarUrl} alt={p.name} width={140} height={140} style={{
              width: 140, height: 140, borderRadius: 70, objectFit: 'cover',
              border: '4px solid rgba(255,255,255,0.9)',
            }} />
          ) : (
            <div style={{
              width: 140, height: 140, borderRadius: 70,
              background: 'linear-gradient(135deg, #4ade80 0%, #14532d 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 72, fontWeight: 900,
              border: '4px solid rgba(255,255,255,0.9)',
            }}>{p.name.charAt(0).toUpperCase()}</div>
          )}
          <span style={{
            color: 'white', fontSize: 28, fontWeight: 800,
            textShadow: '0 2px 6px rgba(0,0,0,0.6)',
          }}>{p.name}</span>
        </div>
      ))}
    </div>
  </div>
) : (
  /* completed: court area existente sin cambios */
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 60px' }}>
    {/* ... bloque actual con la pista, PlayerSlots, score, winner overlay ... */}
  </div>
)}
```

El footer del completed (con "X & Y ganan") queda envuelto en `match.status === 'completed' &&` o equivalente — para scheduled queda vacío manteniendo la altura.

### 2. Botón Compartir en match detail page

`src/app/(public)/matches/[id]/page.tsx`, líneas 415-420:

**Antes:**
```tsx
{/* Share button — only for completed matches */}
{match.status === 'completed' && (
  <div className="flex justify-end">
    <ShareMatchButton url={matchUrl} />
  </div>
)}
```

**Después:**
```tsx
{/* Share button — both completed and scheduled */}
<div className="flex justify-end">
  <ShareMatchButton url={matchUrl} />
</div>
```

### Sin cambios

- `src/components/shared/share-match-button.tsx` — el componente ya funciona genéricamente con cualquier URL.
- `generateMetadata` en `page.tsx` — el title ya cubre el caso scheduled (con la salvedad anotada arriba sobre la división por equipos en el texto).
- Listados de partidos (`/matches`, dashboard, etc.) — el botón no se agrega en cards. Solo en detalle.
- Lógica de Elo, schema, API, migraciones, otros forms.

## Verificación

- `npx tsc --noEmit && npm run lint && npm test` — todo verde.
- Manual post-deploy:
  1. Abrir un partido programado → confirmar botón "Compartir por WhatsApp" visible bajo el hero (alineado a la derecha, mismo estilo que en completed).
  2. Click → abre `wa.me/?text=<URL_del_partido>`.
  3. Pegar la URL del partido programado en WhatsApp manualmente → debe aparecer el preview con: header LPT + fecha + ubicación arriba; "PRÓXIMO PARTIDO"; los 4 avatares en fila orden alfabético; footer vacío.
  4. Abrir directamente `<URL_del_partido>/opengraph-image` en el navegador → ver la imagen scheduled renderizada.
  5. Verificar que un partido completado mantiene su OG image actual sin cambios (pista, score, winner overlay, footer "X & Y ganan").

## Archivos afectados

**Modificados (2):**
- `src/app/(public)/matches/[id]/opengraph-image.tsx`
- `src/app/(public)/matches/[id]/page.tsx`

## Notas / edge cases

- Si algún jugador no existe en `pMap` (`.filter(Boolean)`), simplemente se omite del listado de 4 — degradación silenciosa, mismo criterio que el resto del archivo.
- Si los 4 nombres son muy largos, podrían acercarse entre sí. Para v1 asumimos nombres de tamaño normal en el grupo (mismo supuesto que ya teníamos en el spec original Feature H).
- `localeCompare(name, 'es')` para que la "ñ" y los acentos ordenen correctamente.
- El completed no toca nada de su layout — cero riesgo de regresión visual sobre OG images ya generadas que se hayan cacheado en plataformas externas.
