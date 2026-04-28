type SideValue = string | null;

export interface TeamInput {
  p1Id: string;
  p2Id: string;
  p1Side: SideValue;
  p2Side: SideValue;
}

export interface PositionsInput {
  team1: TeamInput;
  team2: TeamInput;
}

export interface PositionedPlayer {
  playerId: string;
  label: 'D' | 'R' | null;
}

export interface CourtPositions {
  topLeft: PositionedPlayer;
  bottomLeft: PositionedPlayer;
  topRight: PositionedPlayer;
  bottomRight: PositionedPlayer;
}

function isValidSide(s: SideValue): s is 'drive' | 'reves' {
  return s === 'drive' || s === 'reves';
}

function teamHasValidSides(t: TeamInput): boolean {
  if (!isValidSide(t.p1Side) || !isValidSide(t.p2Side)) return false;
  // p1 and p2 must be on different sides for the data to make sense
  return t.p1Side !== t.p2Side;
}

export function resolveCourtPositions(input: PositionsInput): CourtPositions {
  const { team1, team2 } = input;

  // Team 1: drive goes top, revés goes bottom.
  let topLeft: PositionedPlayer;
  let bottomLeft: PositionedPlayer;
  if (teamHasValidSides(team1)) {
    if (team1.p1Side === 'drive') {
      topLeft = { playerId: team1.p1Id, label: 'D' };
      bottomLeft = { playerId: team1.p2Id, label: 'R' };
    } else {
      topLeft = { playerId: team1.p2Id, label: 'D' };
      bottomLeft = { playerId: team1.p1Id, label: 'R' };
    }
  } else {
    topLeft = { playerId: team1.p1Id, label: null };
    bottomLeft = { playerId: team1.p2Id, label: null };
  }

  // Team 2: revés goes top, drive goes bottom.
  let topRight: PositionedPlayer;
  let bottomRight: PositionedPlayer;
  if (teamHasValidSides(team2)) {
    if (team2.p1Side === 'reves') {
      topRight = { playerId: team2.p1Id, label: 'R' };
      bottomRight = { playerId: team2.p2Id, label: 'D' };
    } else {
      topRight = { playerId: team2.p2Id, label: 'R' };
      bottomRight = { playerId: team2.p1Id, label: 'D' };
    }
  } else {
    topRight = { playerId: team2.p1Id, label: null };
    bottomRight = { playerId: team2.p2Id, label: null };
  }

  return { topLeft, bottomLeft, topRight, bottomRight };
}
