import { db } from '@/lib/db';
import { players, matches, matchSets, pairStats, ratingHistory } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  calculateDoublesElo,
  calculatePairElo,
  calculateSynergy,
  type PlayerForElo,
} from './elo';

type MatchInput = {
  id: string;
  date: string;
  location?: string | null;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  winnerTeam: 1 | 2;
  sets: { setNumber: number; team1Games: number; team2Games: number }[];
};

/**
 * Obtiene o crea la entrada pair_stats para una pareja (orden canónico: p1 < p2)
 */
async function getOrCreatePairStats(player1Id: string, player2Id: string) {
  // Orden canónico para evitar duplicados (A,B) y (B,A)
  const [p1, p2] = [player1Id, player2Id].sort();

  const existing = await db
    .select()
    .from(pairStats)
    .where(and(eq(pairStats.player1Id, p1), eq(pairStats.player2Id, p2)))
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(pairStats)
    .values({ player1Id: p1, player2Id: p2 })
    .returning();

  return created;
}

/**
 * Procesa un partido: actualiza Elos individuales, Elos de pareja y guarda historial.
 */
export async function processMatchRatings(match: MatchInput) {
  const playerIds = [
    match.team1Player1Id,
    match.team1Player2Id,
    match.team2Player1Id,
    match.team2Player2Id,
  ];

  // Obtener datos de los 4 jugadores
  const playersData = await Promise.all(
    playerIds.map((id) =>
      db.select().from(players).where(eq(players.id, id)).limit(1).then((r) => r[0])
    )
  );

  if (playersData.some((p) => !p)) throw new Error('Jugador no encontrado');

  const [t1p1, t1p2, t2p1, t2p2] = playersData as NonNullable<typeof playersData[0]>[];

  const team1: [PlayerForElo, PlayerForElo] = [
    { id: t1p1.id, eloRating: t1p1.eloRating, matchesPlayed: t1p1.matchesPlayed },
    { id: t1p2.id, eloRating: t1p2.eloRating, matchesPlayed: t1p2.matchesPlayed },
  ];
  const team2: [PlayerForElo, PlayerForElo] = [
    { id: t2p1.id, eloRating: t2p1.eloRating, matchesPlayed: t2p1.matchesPlayed },
    { id: t2p2.id, eloRating: t2p2.eloRating, matchesPlayed: t2p2.matchesPlayed },
  ];

  // Calcular nuevos Elos individuales
  const eloResults = calculateDoublesElo(team1, team2, match.winnerTeam);

  // Actualizar cada jugador
  for (const result of eloResults) {
    const isWinner =
      (match.winnerTeam === 1 &&
        (result.playerId === t1p1.id || result.playerId === t1p2.id)) ||
      (match.winnerTeam === 2 &&
        (result.playerId === t2p1.id || result.playerId === t2p2.id));

    const playerRow = playersData.find((p) => p?.id === result.playerId)!;
    await db
      .update(players)
      .set({
        eloRating: result.eloAfter,
        matchesPlayed: playerRow.matchesPlayed + 1,
        wins: isWinner ? playerRow.wins + 1 : playerRow.wins,
        losses: isWinner ? playerRow.losses : playerRow.losses + 1,
      })
      .where(eq(players.id, result.playerId));

    // Guardar historial de rating
    await db.insert(ratingHistory).values({
      playerId: result.playerId,
      matchId: match.id,
      eloBefore: result.eloBefore,
      eloAfter: result.eloAfter,
      eloChange: result.eloChange,
    });
  }

  // ── Actualizar stats de parejas ──────────────────────────────────────────
  const pairsToUpdate = [
    {
      ids: [match.team1Player1Id, match.team1Player2Id] as [string, string],
      won: match.winnerTeam === 1,
      opponentIds: [match.team2Player1Id, match.team2Player2Id] as [string, string],
    },
    {
      ids: [match.team2Player1Id, match.team2Player2Id] as [string, string],
      won: match.winnerTeam === 2,
      opponentIds: [match.team1Player1Id, match.team1Player2Id] as [string, string],
    },
  ];

  for (const pair of pairsToUpdate) {
    const pairRow = await getOrCreatePairStats(pair.ids[0], pair.ids[1]);
    const opponentPairRow = await getOrCreatePairStats(pair.opponentIds[0], pair.opponentIds[1]);

    const newPairElo = calculatePairElo(
      pairRow.pairElo,
      opponentPairRow.pairElo,
      pairRow.matchesPlayed,
      pair.won
    );

    const newWins = pair.won ? pairRow.wins + 1 : pairRow.wins;
    const newLosses = pair.won ? pairRow.losses : pairRow.losses + 1;
    const newMatches = pairRow.matchesPlayed + 1;

    // Calcular sinergia
    const [p1id, p2id] = [pair.ids[0], pair.ids[1]].sort();
    const p1data = playersData.find((p) => p?.id === p1id)!;
    const p2data = playersData.find((p) => p?.id === p2id)!;
    const p1WinRate = p1data.matchesPlayed > 0 ? p1data.wins / p1data.matchesPlayed : 0.5;
    const p2WinRate = p2data.matchesPlayed > 0 ? p2data.wins / p2data.matchesPlayed : 0.5;
    const synergy = calculateSynergy(newWins, newMatches, p1WinRate, p2WinRate);

    await db
      .update(pairStats)
      .set({
        pairElo: newPairElo,
        wins: newWins,
        losses: newLosses,
        matchesPlayed: newMatches,
        synergyScore: synergy,
        lastPlayed: match.date,
      })
      .where(
        and(eq(pairStats.player1Id, p1id), eq(pairStats.player2Id, p2id))
      );
  }
}
