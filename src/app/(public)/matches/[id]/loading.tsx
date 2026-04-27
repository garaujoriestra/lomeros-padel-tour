import { SkeletonBox, SkeletonText } from '@/components/shared/skeletons';

export default function MatchDetailLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando detalle de partido" className="space-y-8">
      {/* Custom hero — tall green block with breadcrumb + 2 teams + score */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 text-white shadow-2xl">
        <div className="relative p-5 sm:p-8 md:p-10 space-y-4 sm:space-y-6">
          {/* Breadcrumb */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="animate-pulse bg-green-800/50 rounded h-4 w-20" />
              <div className="animate-pulse bg-green-800/50 rounded h-4 w-24" />
            </div>
            <div className="self-start sm:ml-auto animate-pulse bg-green-800/50 rounded-full h-6 w-28" />
          </div>

          {/* Mobile stacked */}
          <div className="sm:hidden space-y-4">
            <div className="space-y-1">
              <div className="animate-pulse bg-green-800/50 rounded h-5 w-32" />
              <div className="animate-pulse bg-green-800/50 rounded h-5 w-28" />
            </div>
            <div className="flex items-center justify-center gap-3">
              <div className="animate-pulse bg-green-800/50 rounded h-10 w-8" />
              <div className="animate-pulse bg-green-800/50 rounded h-6 w-3" />
              <div className="animate-pulse bg-green-800/50 rounded h-10 w-8" />
            </div>
            <div className="space-y-1">
              <div className="animate-pulse bg-green-800/50 rounded h-5 w-32" />
              <div className="animate-pulse bg-green-800/50 rounded h-5 w-28" />
            </div>
          </div>

          {/* Desktop horizontal */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-6 items-center">
            <div className="space-y-2">
              <div className="animate-pulse bg-green-800/50 rounded h-6 w-40" />
              <div className="animate-pulse bg-green-800/50 rounded h-6 w-36" />
            </div>
            <div className="flex items-center gap-3">
              <div className="animate-pulse bg-green-800/50 rounded h-12 w-10" />
              <div className="animate-pulse bg-green-800/50 rounded h-6 w-3" />
              <div className="animate-pulse bg-green-800/50 rounded h-12 w-10" />
            </div>
            <div className="space-y-2 text-right">
              <div className="animate-pulse bg-green-800/50 rounded h-6 w-40 ml-auto" />
              <div className="animate-pulse bg-green-800/50 rounded h-6 w-36 ml-auto" />
            </div>
          </div>
        </div>
      </div>

      {/* Secondary section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <SkeletonText className="w-48 h-5" />
        </div>
        <SkeletonBox className="h-40" />
        <SkeletonBox className="h-40" />
      </div>
    </div>
  );
}
