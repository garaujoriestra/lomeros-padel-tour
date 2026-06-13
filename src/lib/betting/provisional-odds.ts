// Cuotas provisionales de pari-mutuel (solo display) + guía de favorito por Elo.
// El Elo NO determina el pago (eso lo hace el reparto del pool); solo orienta.

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Lo que multiplicarías tu apuesta si tu selección gana y el pool no cambiara.
// null cuando no hay base para una cuota (selección o pool vacíos).
export function provisionalMultiplier(totalPool: number, selectionPool: number): number | null {
  if (totalPool <= 0 || selectionPool <= 0) return null;
  return round1(totalPool / selectionPool);
}

// Guía: qué equipo es favorito según la media de Elo. 0 = parejo.
export function eloFavorite(team1Avg: number, team2Avg: number): 0 | 1 | 2 {
  if (Math.abs(team1Avg - team2Avg) <= 5) return 0;
  return team1Avg > team2Avg ? 1 : 2;
}
