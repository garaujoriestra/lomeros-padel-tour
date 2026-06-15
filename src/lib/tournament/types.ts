// Formato de partido configurable por bloque.
export type MatchFormat =
  | { kind: 'timed'; minutes: number; tieRule: 'golden_point' | 'allow_draw' }
  | { kind: 'first_to_set' }
  | { kind: 'games'; target: number }
  | { kind: 'best_of_3' };

// Referencia de un hueco de participante en un partido (se serializa a JSON en DB).
export type SlotRef =
  | { type: 'participant'; participantId: string }
  | { type: 'pair'; pairId: string }
  | { type: 'placeholder'; desc: string }
  | { type: 'matchWinner'; matchId: string }
  | { type: 'matchLoser'; matchId: string }
  | { type: 'bye' };
