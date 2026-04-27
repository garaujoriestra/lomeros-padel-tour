import { SkeletonBox } from '@/components/shared/skeletons';

export default function PublicLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando" className="space-y-10">
      {/* Home-shaped hero — green tall block with title, subtitle, and stats sub-row */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 p-5 sm:p-8 md:p-14 text-white shadow-2xl">
        <div className="relative text-center space-y-3">
          <div className="animate-pulse bg-green-800/50 rounded-full h-12 sm:h-14 md:h-20 w-12 sm:w-14 md:w-20 mx-auto" />
          <div className="animate-pulse bg-green-800/50 rounded h-8 sm:h-9 md:h-12 w-3/4 max-w-md mx-auto" />
          <div className="animate-pulse bg-green-800/40 rounded h-4 w-1/2 max-w-xs mx-auto" />
          <div className="flex justify-center gap-4 sm:gap-6 md:gap-16 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/10">
            {[0, 1, 2].map((i) => (
              <div key={i} className="text-center space-y-1">
                <div className="animate-pulse bg-green-800/50 rounded h-7 sm:h-9 md:h-12 w-12 mx-auto" />
                <div className="animate-pulse bg-green-800/40 rounded h-3 w-16 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Generic placeholder blocks for the rest of the home content (podium + match grids) */}
      <SkeletonBox className="h-48" />
      <SkeletonBox className="h-32" />
      <SkeletonBox className="h-32" />
    </div>
  );
}
