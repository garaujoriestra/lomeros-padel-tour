import type { Match } from '@/lib/db/schema';

export type MatchWithSide = Pick<Match,
  | 'team1Player1Id' | 'team1Player2Id' | 'team2Player1Id' | 'team2Player2Id'
  | 'team1Player1Side' | 'team1Player2Side' | 'team2Player1Side' | 'team2Player2Side'
  | 'winnerTeam'
>;

export type CourtSide = 'drive' | 'reves';

export function coerceSide(value: unknown): CourtSide | null {
  return value === 'drive' || value === 'reves' ? value : null;
}

export interface SideStats {
  drive: { matches: number; wins: number; losses: number; winRate: number };
  reves: { matches: number; wins: number; losses: number; winRate: number };
}

interface SlotInfo {
  team: 1 | 2;
  side: 'drive' | 'reves';
}

function findPlayerSlot(playerId: string, m: MatchWithSide): SlotInfo | null {
  if (m.team1Player1Id === playerId && (m.team1Player1Side === 'drive' || m.team1Player1Side === 'reves')) return { team: 1, side: m.team1Player1Side };
  if (m.team1Player2Id === playerId && (m.team1Player2Side === 'drive' || m.team1Player2Side === 'reves')) return { team: 1, side: m.team1Player2Side };
  if (m.team2Player1Id === playerId && (m.team2Player1Side === 'drive' || m.team2Player1Side === 'reves')) return { team: 2, side: m.team2Player1Side };
  if (m.team2Player2Id === playerId && (m.team2Player2Side === 'drive' || m.team2Player2Side === 'reves')) return { team: 2, side: m.team2Player2Side };
  return null;
}

export function computeSideStats(playerId: string, matches: MatchWithSide[]): SideStats {
  const drive = { matches: 0, wins: 0, losses: 0 };
  const reves = { matches: 0, wins: 0, losses: 0 };

  for (const m of matches) {
    if (m.winnerTeam === null) continue;
    const slot = findPlayerSlot(playerId, m);
    if (!slot) continue;

    const bucket = slot.side === 'drive' ? drive : reves;
    bucket.matches += 1;
    if (m.winnerTeam === slot.team) bucket.wins += 1;
    else bucket.losses += 1;
  }

  return {
    drive: { ...drive, winRate: drive.matches > 0 ? drive.wins / drive.matches : 0 },
    reves: { ...reves, winRate: reves.matches > 0 ? reves.wins / reves.matches : 0 },
  };
}
