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

// --- Modelo de evento (un formato por evento) ---
export type EventKind = 'pozo' | 'torneo';

export type PozoFormat = 'fixed_pairs' | 'americano';
export type TorneoFormat = 'single_elim' | 'groups_elim';

// Config persistida en tournaments.config (JSON) según kind/format.
export interface PozoConfig {
  rounds: number;                 // nº de rondas del pozo
  matchFormat: MatchFormat;       // formato por ronda (por defecto timed/golden_point)
}

export interface TorneoConfig {
  matchFormat: MatchFormat;       // formato del cuadro
  thirdPlace: boolean;            // partido 3er/4º puesto (default false)
  // solo groups_elim:
  numGroups?: number;
  advancePerGroup?: number;       // default 2
}

export type EventConfig = PozoConfig | TorneoConfig;
