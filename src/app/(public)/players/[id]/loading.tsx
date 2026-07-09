import { SkeletonBox } from '@/components/shared/skeletons';

// Esqueleto de la ficha de jugador (hero de perfil con avatar+stats, luego
// bloques). Hero propio, así que usamos bloques neutros. En flujo normal y con
// tokens de tema (sin overlay verde). Ver la nota en `(public)/loading.tsx`.
export default function PlayerDetailLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando jugador" className="space-y-6">
      <SkeletonBox className="h-52" />
      <div className="grid gap-3 sm:grid-cols-2">
        <SkeletonBox className="h-32" />
        <SkeletonBox className="h-32" />
      </div>
      <SkeletonBox className="h-40" />
    </div>
  );
}
