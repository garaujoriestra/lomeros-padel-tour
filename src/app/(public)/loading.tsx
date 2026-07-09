import { SkeletonHero, SkeletonBox } from '@/components/shared/skeletons';

// Fallback de carga de las rutas públicas (transicionadas con View Transitions):
// un esqueleto con la FORMA de la pantalla, en flujo normal y con tokens de
// tema. NO es el loader verde a pantalla completa a propósito: ese overlay fijo
// chocaba con el deslizamiento de la transición (se veían los dos a la vez). El
// loader de marca queda para el arranque en frío (splash del layout) y para las
// rutas no transicionadas (/admin, /me, /login vía el loading.tsx raíz).
export default function HomeLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando" className="space-y-6">
      <SkeletonHero tall />
      <SkeletonBox className="h-56" />
      <div className="grid gap-3 sm:grid-cols-2">
        <SkeletonBox className="h-28" />
        <SkeletonBox className="h-28" />
      </div>
    </div>
  );
}
