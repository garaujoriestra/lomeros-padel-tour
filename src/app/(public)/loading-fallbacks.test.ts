import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Las rutas públicas van envueltas en View Transitions. Su loading.tsx NO debe
// ser el ScreenLoader (overlay verde FIJO a pantalla completa, `.screen-loader`):
// ese overlay se solapaba con el deslizamiento de la transición ("se veía el
// loading y la transición a la vez"). Debe ser un skeleton en flujo normal. El
// loader verde queda para el arranque en frío (splash) y las rutas no
// transicionadas (/admin, /me, /login vía el loading.tsx raíz).
import HomeLoading from './loading';
import RankingsLoading from './rankings/loading';
import PairsLoading from './rankings/pairs/loading';
import MatchesLoading from './matches/loading';
import MatchDetailLoading from './matches/[id]/loading';
import PlayerDetailLoading from './players/[id]/loading';

const FALLBACKS = [
  ['home', HomeLoading],
  ['rankings', RankingsLoading],
  ['parejas', PairsLoading],
  ['partidos', MatchesLoading],
  ['detalle de partido', MatchDetailLoading],
  ['ficha de jugador', PlayerDetailLoading],
] as const;

describe('fallbacks de carga de rutas públicas (View Transitions)', () => {
  for (const [name, Component] of FALLBACKS) {
    const html = renderToStaticMarkup(createElement(Component));

    it(`${name}: es un skeleton en flujo normal`, () => {
      expect(html).toContain('animate-pulse'); // primitivas de skeleton
      expect(html).toContain('aria-busy="true"');
    });

    it(`${name}: NO es el overlay verde a pantalla completa (choca con la transición)`, () => {
      expect(html).not.toContain('screen-loader');
    });
  }
});
