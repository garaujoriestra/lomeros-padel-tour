import { SkeletonText, SkeletonBox } from '@/components/shared/skeletons';

// Esqueleto del detalle de partido (migaja + marcador + sets). Hero propio, así
// que usamos bloques neutros. En flujo normal y con tokens de tema (sin overlay
// verde). Ver la nota en `(public)/loading.tsx`.
export default function MatchDetailLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando partido" className="space-y-6">
      <SkeletonText className="h-3 w-32" />
      <SkeletonBox className="h-48" />
      <SkeletonBox className="h-40" />
    </div>
  );
}
