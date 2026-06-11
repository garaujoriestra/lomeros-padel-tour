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

/**
 * Reproduces a <MatchCard /> placeholder in both mobile-stacked and
 * desktop-horizontal layouts. Mirrors the exact breakpoints and dimensions
 * of the real component so the visual swap is silent.
 */
export function SkeletonMatchCard() {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      {/* Header strip */}
      <div className="px-4 sm:px-5 py-2.5 border-b bg-gray-50/80 flex justify-between items-center">
        <SkeletonText className="w-20 h-3" />
        <SkeletonText className="w-16 h-3" />
      </div>
      <div className="p-4 sm:p-6">
        {/* Mobile (<sm): stacked */}
        <div className="sm:hidden space-y-3">
          <SkeletonTeamRow side="left" />
          <div className="flex items-center justify-center">
            <SkeletonBox className="h-8 w-24" />
          </div>
          <SkeletonTeamRow side="right" />
        </div>
        {/* Desktop (≥sm): horizontal grid */}
        <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
          <SkeletonTeamRow side="left" />
          <SkeletonBox className="h-12 w-20" />
          <SkeletonTeamRow side="right" />
        </div>
      </div>
    </div>
  );
}

function SkeletonTeamRow({ side }: { side: 'left' | 'right' }) {
  const justify = side === 'right' ? 'justify-end' : '';
  const dot = <div className="w-2 h-2 rounded-full bg-gray-200 shrink-0" />;
  return (
    <div className={`space-y-1.5 ${side === 'right' ? 'text-right' : ''}`}>
      <div className={`flex items-center gap-2 ${justify}`}>
        {side === 'left' && dot}
        <SkeletonText className="w-32 max-w-full" />
        {side === 'right' && dot}
      </div>
      <div className={`flex items-center gap-2 ${justify}`}>
        {side === 'left' && dot}
        <SkeletonText className="w-28 max-w-full" />
        {side === 'right' && dot}
      </div>
    </div>
  );
}
