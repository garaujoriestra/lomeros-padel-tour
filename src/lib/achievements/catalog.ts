export type AchievementCategory = 'milestones' | 'wins' | 'elo' | 'situational';
export type AchievementTier = 'common' | 'rare' | 'mythic';

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
}

export const ACHIEVEMENTS: Achievement[] = [
  // Milestones
  { id: 'first_match',  name: 'Primer partido',   icon: '🎾', description: '1 partido jugado',     category: 'milestones',  tier: 'common' },
  { id: 'matches_10',   name: 'Decena',           icon: '🔟', description: '10 partidos jugados',  category: 'milestones',  tier: 'common' },
  { id: 'matches_50',   name: 'Cincuentón',       icon: '🎯', description: '50 partidos jugados',  category: 'milestones',  tier: 'rare'   },
  { id: 'matches_100',  name: 'El siglo',         icon: '💯', description: '100 partidos jugados', category: 'milestones',  tier: 'mythic' },
  // Wins & streaks
  { id: 'first_win',    name: 'Primera victoria', icon: '🥇', description: 'Primera victoria',         category: 'wins', tier: 'common' },
  { id: 'wins_25',      name: 'Veterano',         icon: '🏆', description: '25 victorias',             category: 'wins', tier: 'rare'   },
  { id: 'streak_3',     name: 'Racha de 3',       icon: '🔥', description: '3 victorias seguidas',     category: 'wins', tier: 'common' },
  { id: 'streak_5',     name: 'Racha de 5',       icon: '🚀', description: '5 victorias seguidas',     category: 'wins', tier: 'rare'   },
  { id: 'streak_10',    name: 'Racha de 10',      icon: '⚡', description: '10 victorias seguidas',    category: 'wins', tier: 'mythic' },
  // ELO & ranking
  { id: 'elo_1600',     name: '1600+',            icon: '📈', description: 'Cruzar 1600 ELO',          category: 'elo',  tier: 'common' },
  { id: 'elo_1800',     name: '1800+',            icon: '💎', description: 'Cruzar 1800 ELO',          category: 'elo',  tier: 'rare'   },
  { id: 'rank_1',       name: '#1 del LPT',       icon: '👑', description: 'Llegar al #1 del ranking', category: 'elo',  tier: 'rare'   },
  // Situational
  { id: 'bagel',        name: 'Bagel',            icon: '🍩', description: 'Ganar un set 6-0',         category: 'situational', tier: 'common' },
  { id: 'double_bagel', name: 'Doble bagel',      icon: '🥶', description: 'Ganar 6-0 / 6-0',          category: 'situational', tier: 'mythic' },
];

export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
