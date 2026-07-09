import { SkeletonHero, SkeletonBox } from '@/components/shared/skeletons';

// Esqueleto del listado de partidos (hero + lista de tarjetas). En flujo normal
// y con tokens de tema (sin overlay verde). Ver la nota en `(public)/loading.tsx`.
export default function MatchesLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando partidos" className="space-y-6">
      <SkeletonHero />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBox key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
