import { SkeletonBox, SkeletonText } from '@/components/shared/skeletons';

export default function PlayerLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando perfil de jugador" className="space-y-6">
      {/* Profile header — green gradient with stacked avatar+info on mobile */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 text-white shadow-2xl">
        <div className="relative p-5 sm:p-8 md:p-10">
          <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4 sm:gap-6">
            {/* Avatar */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/20 border-2 border-white/30 shrink-0" />
            {/* Info */}
            <div className="flex-1 min-w-0 w-full space-y-2">
              <div className="animate-pulse bg-green-800/50 rounded h-7 sm:h-9 md:h-10 w-3/4 mx-auto sm:mx-0" />
              <div className="animate-pulse bg-green-800/50 rounded h-4 w-1/3 mx-auto sm:mx-0" />
              <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                <div className="animate-pulse bg-green-800/50 rounded-full h-6 w-24" />
                <div className="animate-pulse bg-green-800/50 rounded-full h-6 w-32" />
              </div>
            </div>
          </div>

          {/* Stats row 2x2 / 4 cols */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/10">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="text-center space-y-1">
                <div className="animate-pulse bg-green-800/50 rounded h-8 sm:h-9 md:h-10 w-12 mx-auto" />
                <div className="animate-pulse bg-green-800/50 rounded h-3 w-16 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Win rate bar */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
        <div className="flex justify-between items-center">
          <SkeletonText className="w-20 h-4" />
          <SkeletonText className="w-12 h-6" />
        </div>
        <SkeletonBox className="h-3" />
      </div>

      {/* Recent form */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <SkeletonText className="w-32 h-3" />
        <div className="flex gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-xl bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>

      {/* Elo chart */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between">
          <SkeletonText className="w-40 h-4" />
          <SkeletonText className="w-24 h-4" />
        </div>
        <SkeletonBox className="h-48" />
      </div>

      {/* Match history */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <SkeletonText className="w-40 h-3" />
        </div>
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-gray-200 animate-pulse shrink-0" />
                <SkeletonText className="w-16 h-3 shrink-0" />
              </div>
              <SkeletonText className="w-32 max-w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
