import { test, expect, type Page } from '@playwright/test';

// Tokens de motion (DESIGN.md §5): la escala existe, resuelve, y los
// componentes la CONSUMEN de verdad (no basta con declararla en :root).

const DUR = { '--dur-1': '100ms', '--dur-2': '150ms', '--dur-3': '260ms', '--dur-4': '420ms', '--dur-5': '700ms' };
const EASE = {
  '--ease-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
  '--ease-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
  '--ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
  '--ease-linear': 'linear',
};

const tokenValue = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

/** ms de una duración CSS. El build (Lightning CSS) minifica `100ms` → `.1s`,
 *  así que comparar cadenas es frágil: se compara el valor. */
function ms(v: string): number {
  const t = v.trim();
  if (t.endsWith('ms')) return parseFloat(t);
  if (t.endsWith('s')) return parseFloat(t) * 1000;
  return NaN;
}

/** Curva CSS normalizada: sin espacios y sin el cero inicial que borra el
 *  minificador (`cubic-bezier(0.22, 1…)` → `cubic-bezier(.22,1…)`). */
const curva = (v: string) => v.replace(/\s+/g, '').replace(/\b0\./g, '.');

test.describe('tokens de motion', () => {
  test('la escala está definida en :root y resuelve a los valores de DESIGN.md', async ({ page }) => {
    await page.goto('/bandejazo');
    for (const [name, valor] of Object.entries(DUR)) {
      expect(ms(await tokenValue(page, name)), name).toBe(ms(valor));
    }
    for (const [name, valor] of Object.entries(EASE)) {
      // El minificador también quita el cero inicial (`0.22` → `.22`).
      expect(curva(await tokenValue(page, name)), name).toBe(curva(valor));
    }
  });

  test('los tokens de View Transitions son alias de la escala (no valores sueltos)', async ({ page }) => {
    await page.goto('/bandejazo');
    // --duration-exit sigue valiendo 150ms como antes; enter/move se alinean.
    expect(ms(await tokenValue(page, '--duration-exit'))).toBe(ms(DUR['--dur-2']));
    expect(ms(await tokenValue(page, '--duration-enter'))).toBe(ms(DUR['--dur-3']));
    expect(ms(await tokenValue(page, '--duration-move'))).toBe(ms(DUR['--dur-4']));
  });

  test('los componentes CONSUMEN la escala: el deslizante del Seg y las tarjetas', async ({ page }) => {
    await page.goto('/bandejazo');
    // Sonda: un nodo con las mismas reglas que el Seg y que .lpt-card.clickable.
    const medido = await page.evaluate(() => {
      const wrap = document.createElement('div');
      wrap.innerHTML =
        '<div class="seg has-ind"><span class="seg-ind"></span><button class="on">a</button></div>' +
        '<div class="lpt-card clickable"></div>';
      document.body.appendChild(wrap);
      const cs = (sel: string) => {
        const s = getComputedStyle(wrap.querySelector(sel)!);
        return { dur: s.transitionDuration, ease: s.transitionTimingFunction };
      };
      const out = { ind: cs('.seg-ind'), card: cs('.lpt-card.clickable') };
      wrap.remove();
      return out;
    });
    // El deslizante: 150ms (--dur-2) en transform y width, con --ease-out.
    expect(medido.ind.dur.split(',').map((d) => ms(d))).toEqual([150, 150]);
    expect(curva(medido.ind.ease)).toContain(curva(EASE['--ease-out']));
    // La tarjeta pulsable también sale de la escala.
    const escala = Object.values(DUR).map(ms);
    expect(medido.card.dur.split(',').every((d) => escala.includes(ms(d)))).toBe(true);
    expect(curva(medido.card.ease)).toContain(curva(EASE['--ease-out']));
  });

  // Guarda anti-deriva sobre el CÓDIGO, no sobre el runtime: Tailwind trae sus
  // propias curvas en las utilidades (`cubic-bezier(.4,0,.2,1)` es su
  // ease-in-out), así que mirar `document.styleSheets` no distingue las
  // nuestras de las suyas. Lo que se vigila es que NUESTRO código no vuelva a
  // meter una curva a pelo — la regla Token-o-Nada de DESIGN.md §5.
  test('nuestro código no reintroduce curvas ni duraciones a pelo', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');

    const ficheros: string[] = ['src/app/globals.css'];
    const recorre = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) recorre(p);
        else if (p.endsWith('.tsx') || p.endsWith('.ts')) ficheros.push(p);
      }
    };
    recorre('src/components');

    /** Blanquea comentarios (conservando los saltos, para no perder el nº de
     *  línea): hablar de una curva en un comentario no es usarla. */
    const sinComentarios = (s: string) =>
      s
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

    // La curva del sistema es la ÚNICA cubic-bezier admitida como literal: es
    // la definición del token en :root. El resto debe usar var(--ease-*).
    const DEFINICION = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const infracciones: string[] = [];
    let todo = '';
    for (const f of ficheros) {
      const limpio = sinComentarios(readFileSync(f, 'utf8'));
      todo += limpio + '\n';
      limpio.split('\n').forEach((linea, i) => {
        if (!/cubic-bezier/.test(linea)) return;
        // Las 3 definiciones de token en :root son legítimas.
        if (/--ease-(out|in|in-out):/.test(linea)) return;
        infracciones.push(`${f}:${i + 1}  ${linea.trim().slice(0, 100)}`);
      });
    }
    expect(infracciones, `curvas a pelo fuera del sistema (usa var(--ease-*)):\n${infracciones.join('\n')}`)
      .toEqual([]);
    // Y la curva casi-duplicada que se unificó no vuelve.
    expect(todo).not.toContain('cubic-bezier(0.23, 1, 0.32, 1)');
    expect(todo.split(DEFINICION).length - 1, 'la definición del token debe ser única').toBe(1);
  });

  test('con prefers-reduced-motion la escala sigue neutralizada', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/bandejazo');
    const dur = await page.evaluate(() => {
      const d = document.createElement('div');
      d.className = 'lpt-card clickable';
      document.body.appendChild(d);
      const v = getComputedStyle(d).transitionDuration;
      d.remove();
      return v;
    });
    // El kill global lo deja en 0.01ms pese a que la regla use var(--dur-*).
    expect(dur.split(',').every((v) => ms(v) <= 1)).toBe(true);
  });
});
