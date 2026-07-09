import { SkeletonHero, SkeletonBox } from '@/components/shared/skeletons';

// Esqueleto del ranking (hero + podio + filas de tabla). En flujo normal y con
// tokens de tema para deslizarse limpio con la View Transition, sin el overlay
// verde a pantalla completa. Ver la nota en `(public)/loading.tsx`.
export default function RankingsLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando ranking" className="space-y-6">
      <SkeletonHero />
      <SkeletonBox className="h-40" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBox key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}
