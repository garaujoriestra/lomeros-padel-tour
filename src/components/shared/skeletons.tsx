import { cn } from '@/lib/utils';

/**
 * Plain animated grey block. Used for any rectangular placeholder.
 * Pass `className` to control size (e.g. `className="h-32"`).
 */
export function SkeletonBox({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-surface-2 rounded-lg', className)} />;
}

/**
 * Animated grey line of text (default 16px tall). Use width via `className`.
 */
export function SkeletonText({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-surface-2 rounded h-4', className)} />;
}

/**
 * Reproduces the green-gradient hero shape used across pages.
 * `tall=false` matches the small heroes on rankings/matches/pairs (`md:p-10`).
 * `tall=true` matches the home/info hero (`md:p-14`).
 *
 * Note: the player-profile and match-detail heroes have custom internal
 * structure (avatar + stats grid / breadcrumb + score) and inline their
 * own hero block in their loading.tsx — they don't use this primitive.
 */
export function SkeletonHero({ tall = false }: { tall?: boolean }) {
  const padding = tall ? 'p-5 sm:p-8 md:p-14' : 'p-5 sm:p-7 md:p-10';
  return (
    <div className={`hero ${padding}`}>
      <div className="space-y-3">
        <div className="animate-pulse rounded h-8 sm:h-9 md:h-10 w-3/4 max-w-md" style={{ background: 'color-mix(in oklab, currentcolor 14%, transparent)' }} />
        <div className="animate-pulse rounded h-4 w-1/2 max-w-xs" style={{ background: 'color-mix(in oklab, currentcolor 10%, transparent)' }} />
      </div>
    </div>
  );
}
