# Share Scheduled Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar el botón "Compartir por WhatsApp" en partidos programados (hoy solo en completed) y rediseñar la OG image scheduled como una "convocatoria" con 4 avatares en orden alfabético, sin pista ni división por equipos.

**Architecture:** Dos archivos modificados, sin nuevos archivos, sin DB / schema / API / migración. (1) Quitar el `match.status === 'completed' &&` del bloque del botón en la match detail page. (2) Bifurcar el branch scheduled dentro del existing `opengraph-image.tsx` para reemplazar la pista por un layout simple de avatares + nombres ordenados alfabéticamente.

**Tech Stack:** Next 16 file convention `opengraph-image.tsx`, `next/og` `ImageResponse`, React 19 server component, Drizzle, libsql.

**Verification model:** No automated tests (UI + image generation, no logic). Después de cada tarea: `npx tsc --noEmit && npm run lint && npm test` (49 tests existentes deben seguir pasando). Verificación visual manual al final.

**Background:** spec en `docs/superpowers/specs/2026-04-29-share-scheduled-match-design.md`. Leer antes de empezar.

---

## Pre-flight

- [ ] **Step 0a: Confirmar branch**

Run: `git branch --show-current`
Expected: una branch dedicada (p.ej. `feature/share-scheduled-match`). Si estás en `main`, crear branch antes de continuar:

```bash
git checkout -b feature/share-scheduled-match
```

- [ ] **Step 0b: Confirmar baseline checks pasan**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 49 tests pass.

---

## Task 1: Habilitar el botón Compartir en scheduled

**Files:**
- Modify: `src/app/(public)/matches/[id]/page.tsx` (líneas 415-420)

El componente `ShareMatchButton` ya existe y funciona genéricamente con cualquier URL. Solo hay que quitar el guard que lo restringía a completed.

- [ ] **Step 1: Editar el conditional**

En `src/app/(public)/matches/[id]/page.tsx`, reemplazar este bloque:

```tsx
      {/* Share button — only for completed matches */}
      {match.status === 'completed' && (
        <div className="flex justify-end">
          <ShareMatchButton url={matchUrl} />
        </div>
      )}
```

por:

```tsx
      {/* Share button — both completed and scheduled */}
      <div className="flex justify-end">
        <ShareMatchButton url={matchUrl} />
      </div>
```

- [ ] **Step 2: Verificar checks**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 49 tests pass.

- [ ] **Step 3: Verificación manual**

```bash
npm run dev
```

Visitar en el navegador la URL de un partido programado (`/matches/<id>` con `status='scheduled'`). Confirmar:
- El botón verde "Compartir por WhatsApp" aparece debajo del hero, alineado a la derecha (mismo lugar y estilo que en partidos completados).
- Al hacer click se abre `https://wa.me/?text=<URL_del_partido>` en una nueva pestaña.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(public\)/matches/\[id\]/page.tsx
git commit -m "feat(share): show WhatsApp share button on scheduled matches"
```

---

## Task 2: Rediseñar OG image para scheduled

**Files:**
- Modify: `src/app/(public)/matches/[id]/opengraph-image.tsx`

El archivo actual siempre renderiza la pista con los 4 `PlayerSlot` posicionados según `resolveCourtPositions`. Vamos a:
1. Calcular una lista `fourPlayers` ordenada alfabéticamente solo para el caso scheduled.
2. Bifurcar el contenido del div central: si `match.status === 'completed'` → la pista actual sin cambios; si no → el nuevo layout de convocatoria.
3. Footer: ya es transparent + vacío cuando `winnerNames` es null (que solo aplica a completed), así que no requiere cambios.

- [ ] **Step 1: Agregar el cálculo de `fourPlayers` ordenado**

En `src/app/(public)/matches/[id]/opengraph-image.tsx`, después de la línea que define `pMap` (≈ línea 150) y antes del `resolveCourtPositions`, agregar:

```tsx
  const fourPlayers = [
    match.team1Player1Id,
    match.team1Player2Id,
    match.team2Player1Id,
    match.team2Player2Id,
  ]
    .map((pid) => pMap[pid])
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
```

Esto produce un array de 4 (o menos, si algún jugador desaparece de la DB) ordenado alfabéticamente sin distinguir teams.

- [ ] **Step 2: Bifurcar el div de la pista**

En el mismo archivo, reemplazar el bloque del "Court area" (el `<div>` que envuelve la pista, aproximadamente líneas 226-362, desde:

```tsx
        {/* Court area (placeholder for Tasks 7–9) */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 60px',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: 1080,
              height: 440,
              ...
```

hasta el cierre del `</div>` de la pista en la línea ≈ 362) por la siguiente bifurcación. **Importante:** mantener exactamente el bloque de la pista existente dentro de la rama `match.status === 'completed' ?`. Solo hay que envolverlo y agregar la rama `else` con el layout de convocatoria:

```tsx
        {/* Central area: completed → pista + score; scheduled → convocatoria */}
        {match.status === 'completed' ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 60px',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: 1080,
                height: 440,
                borderRadius: 16,
                background: 'linear-gradient(135deg, #14532d 0%, #064e3b 100%)',
                border: '4px solid white',
                display: 'flex',
              }}
            >
              {/* Net (vertical line center) */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  bottom: 0,
                  width: 4,
                  marginLeft: -2,
                  background: 'white',
                }}
              />
              {/* Service line — left half */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  width: '50%',
                  top: '33%',
                  height: 2,
                  background: 'rgba(255,255,255,0.85)',
                }}
              />
              {/* Service line — right half */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  width: '50%',
                  top: '33%',
                  height: 2,
                  background: 'rgba(255,255,255,0.85)',
                }}
              />
              <PlayerSlot position="topLeft" pos={positions.topLeft} pMap={pMap} />
              <PlayerSlot position="bottomLeft" pos={positions.bottomLeft} pMap={pMap} />
              <PlayerSlot position="topRight" pos={positions.topRight} pMap={pMap} />
              <PlayerSlot position="bottomRight" pos={positions.bottomRight} pMap={pMap} />
              {/* Score / VS over the net */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {showVs ? (
                  <span
                    style={{
                      fontSize: 96,
                      fontWeight: 900,
                      color: 'white',
                      textShadow: '0 4px 20px rgba(0,0,0,0.7)',
                      letterSpacing: 4,
                    }}
                  >
                    VS
                  </span>
                ) : scoreText ? (
                  <span
                    style={{
                      fontSize: 78,
                      fontWeight: 900,
                      fontFamily: 'monospace',
                      color: 'white',
                      background: 'rgba(0,0,0,0.55)',
                      padding: '12px 32px',
                      borderRadius: 16,
                      textShadow: '0 4px 12px rgba(0,0,0,0.5)',
                      letterSpacing: 2,
                    }}
                  >
                    {scoreText}
                  </span>
                ) : null}
              </div>
              {/* Winner overlay — only when match is completed and a winner exists */}
              {match.status === 'completed' && match.winnerTeam === 1 ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '50%',
                    background: 'rgba(74, 222, 128, 0.28)',
                    border: '6px solid #4ade80',
                    borderRadius: '12px 0 0 12px',
                    pointerEvents: 'none',
                    display: 'flex',
                  }}
                />
              ) : null}
              {match.status === 'completed' && match.winnerTeam === 2 ? (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '50%',
                    background: 'rgba(74, 222, 128, 0.28)',
                    border: '6px solid #4ade80',
                    borderRadius: '0 12px 12px 0',
                    pointerEvents: 'none',
                    display: 'flex',
                  }}
                />
              ) : null}
            </div>
          </div>
        ) : (
          /* Scheduled layout — convocatoria */
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 48,
              padding: '0 60px',
            }}
          >
            <span
              style={{
                fontSize: 64,
                fontWeight: 900,
                color: '#86efac',
                letterSpacing: 4,
                textTransform: 'uppercase',
              }}
            >
              Próximo partido
            </span>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 40 }}>
              {fourPlayers.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  {p.avatarUrl ? (
                    <img
                      src={p.avatarUrl}
                      alt={p.name}
                      width={140}
                      height={140}
                      style={{
                        width: 140,
                        height: 140,
                        borderRadius: 70,
                        objectFit: 'cover',
                        border: '4px solid rgba(255,255,255,0.9)',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 140,
                        height: 140,
                        borderRadius: 70,
                        background: 'linear-gradient(135deg, #4ade80 0%, #14532d 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: 72,
                        fontWeight: 900,
                        border: '4px solid rgba(255,255,255,0.9)',
                      }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span
                    style={{
                      color: 'white',
                      fontSize: 28,
                      fontWeight: 800,
                      textShadow: '0 2px 6px rgba(0,0,0,0.6)',
                    }}
                  >
                    {p.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
```

Notas para el implementor:
- El bloque de la pista en la rama `completed` debe quedar **idéntico** al existente (no tocar nada de su estilo, posicionamiento o lógica). Si hay diff visual en completed, es un bug de copia.
- `resolveCourtPositions` se sigue usando solo para completed pero la llamada `const positions = resolveCourtPositions(...)` ya está antes de este bloque y se puede dejar como está — calcular positions para scheduled es trabajo desperdiciado pero no incorrecto y no vale la pena el refactor adicional. Si el lint advierte de variable no usada en scheduled, mover la asignación de `positions` dentro de la rama `match.status === 'completed'`.
- El footer del archivo (después del cierre de este bloque, líneas ≈ 364-390) no se toca. Para scheduled `winnerNames` es null y por tanto el footer ya queda transparent + vacío.

- [ ] **Step 3: Verificar checks**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 49 tests pass.

- [ ] **Step 4: Verificación manual — scheduled**

```bash
npm run dev
```

Abrir en el navegador `http://localhost:3000/matches/<id>/opengraph-image` para un partido scheduled. Confirmar:
- Header strip arriba: logo "🎾 Lomeros Padel Tour" a la izquierda, fecha + ubicación a la derecha (sin cambios).
- Sección central: título grande "PRÓXIMO PARTIDO" en verde claro arriba, y debajo una fila horizontal con 4 avatares circulares (cada uno con el nombre del jugador debajo). Sin pista, sin red, sin "VS".
- Los 4 nombres aparecen en **orden alfabético** (no en orden de schema).
- Footer: vacío (sin franja verde).

- [ ] **Step 5: Verificación manual — completed (regresión)**

Abrir `http://localhost:3000/matches/<id>/opengraph-image` para un partido completado. Confirmar:
- Layout idéntico al de antes del cambio: pista con red, 4 jugadores en sus posiciones, score grande sobre la red, winner overlay verde sobre el lado del ganador, footer "X & Y ganan" con fondo verde.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(public\)/matches/\[id\]/opengraph-image.tsx
git commit -m "feat(og): convocatoria layout for scheduled match OG image"
```

---

## Final verification

- [ ] **Step 1: Suite completa**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 49 tests pass.

- [ ] **Step 2: Checklist manual end-to-end (post-deploy preferentemente, o local)**

1. Abrir un partido programado → confirmar botón "Compartir por WhatsApp" visible bajo el hero (alineado derecha, mismo estilo que en completed).
2. Click en el botón → abre `wa.me/?text=<URL_del_partido>` en nueva pestaña.
3. Pegar la URL del partido programado en un chat de WhatsApp (test, no enviar) → preview muestra: header LPT con fecha + ubicación, "PRÓXIMO PARTIDO", los 4 avatares en fila orden alfabético, footer vacío.
4. Para un partido completado, repetir 1-3 → botón sigue funcionando, preview muestra el layout de pista + score + ganador (sin regresión visual).
5. Abrir directamente `<URL_del_partido>/opengraph-image` en el navegador → ver la imagen renderizada coincide con lo descrito.

- [ ] **Step 3: Merge a main (cuando ya esté validado)**

```bash
git checkout main
git merge --no-ff feature/share-scheduled-match
```
