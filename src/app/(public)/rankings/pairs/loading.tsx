import { SkeletonText, SkeletonBox } from '@/components/shared/skeletons';

// Esqueleto del ranking de parejas: esta página NO tiene hero, arranca con el
// título de sección y una lista de tarjetas. En flujo normal y con tokens de
// tema (sin overlay verde). Ver la nota en `(public)/loading.tsx`.
export default function PairsLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando parejas" className="space-y-4">
      <SkeletonText className="h-6 w-48" />
      <SkeletonText className="h-3 w-72 max-w-full" />
      <div className="space-y-2 pt-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBox key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}
