import { SkeletonHero, SkeletonText } from '@/components/shared/skeletons';

export default function RankingsLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando ranking" className="space-y-8">
      <SkeletonHero />

      {/* Podium */}
      <div className="space-y-3">
        <div className="flex justify-center">
          <SkeletonText className="w-12 h-3" />
        </div>
        <div className="flex items-end justify-center gap-2 sm:gap-3 md:gap-6">
          {/* Silver */}
          <div className="flex-1 max-w-[185px] min-w-0 bg-gradient-to-b from-slate-200 via-slate-300 to-slate-500 rounded-2xl px-3 sm:px-4 pt-4 sm:pt-5 pb-0 shadow-xl flex flex-col items-center gap-1.5 sm:gap-2">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/40" />
            <div className="animate-pulse bg-white/50 rounded h-3 w-16" />
            <div className="animate-pulse bg-white/50 rounded h-7 w-12" />
            <div className="w-full h-8 bg-slate-600 rounded-b-xl" />
          </div>
          {/* Gold (taller) */}
          <div className="flex-1 max-w-[215px] min-w-0 -mb-3 bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 rounded-2xl px-3 sm:px-5 pt-5 sm:pt-7 pb-0 shadow-2xl flex flex-col items-center gap-1.5 sm:gap-2 ring-2 ring-amber-400/40">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/40" />
            <div className="animate-pulse bg-amber-900/30 rounded h-4 w-20" />
            <div className="animate-pulse bg-amber-900/30 rounded h-8 w-14" />
            <div className="w-full h-10 bg-amber-700 rounded-b-xl" />
          </div>
          {/* Bronze */}
          <div className="flex-1 max-w-[165px] min-w-0 mt-6 sm:mt-8 bg-gradient-to-b from-orange-200 via-orange-400 to-orange-600 rounded-2xl px-3 sm:px-4 pt-3 sm:pt-4 pb-0 shadow-xl flex flex-col items-center gap-1 sm:gap-1.5">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/40" />
            <div className="animate-pulse bg-orange-900/30 rounded h-3 w-14" />
            <div className="animate-pulse bg-orange-900/30 rounded h-6 w-10" />
            <div className="w-full h-7 bg-orange-700 rounded-b-xl" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-md overflow-hidden border-0">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b">
          <SkeletonText className="w-48 h-3" />
        </div>
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 sm:px-6 py-3">
              <SkeletonText className="w-4 h-4 shrink-0" />
              <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse shrink-0" />
              <SkeletonText className="flex-1 max-w-32" />
              <SkeletonText className="w-12 h-5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
