import { SkeletonHero, SkeletonText } from '@/components/shared/skeletons';

export default function PairsLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando parejas" className="space-y-8">
      <SkeletonHero />

      {/* Top-3 cards */}
      <div className="space-y-3">
        <div className="flex justify-center">
          <SkeletonText className="w-32 h-3" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-gradient-to-br from-gray-50 to-gray-100 border border-line rounded-2xl p-4 sm:p-5 shadow-md space-y-3">
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-full bg-surface-2 animate-pulse" />
                <div className="text-right space-y-1">
                  <div className="animate-pulse bg-surface-2 rounded h-7 w-14" />
                  <div className="animate-pulse bg-surface-2 rounded h-3 w-16" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-surface-2 animate-pulse shrink-0" />
                  <SkeletonText className="w-24" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-surface-2 animate-pulse shrink-0" />
                  <SkeletonText className="w-28" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-1 sm:gap-2 pt-3 border-t border-black/5">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="text-center min-w-0 space-y-1">
                    <div className="animate-pulse bg-surface-2 rounded h-5 w-8 mx-auto" />
                    <div className="animate-pulse bg-surface-2 rounded h-3 w-12 mx-auto" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl shadow-md overflow-hidden border-0">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b">
          <SkeletonText className="w-48 h-3" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 sm:px-6 py-3">
              <SkeletonText className="w-4 h-4 shrink-0" />
              <div className="flex-1 space-y-1 min-w-0">
                <SkeletonText className="w-24" />
                <SkeletonText className="w-28" />
              </div>
              <SkeletonText className="w-12 h-5" />
              <SkeletonText className="w-10 h-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
