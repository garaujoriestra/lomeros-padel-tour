import { SkeletonHero, SkeletonMatchCard } from '@/components/shared/skeletons';

export default function MatchesLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando partidos" className="space-y-8">
      <SkeletonHero />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonMatchCard key={i} />
        ))}
      </div>
    </div>
  );
}
