import { SkeletonHero, SkeletonBox } from '@/components/shared/skeletons';

export default function PublicLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando" className="space-y-6">
      <SkeletonHero tall />
      <SkeletonBox className="h-32" />
      <SkeletonBox className="h-32" />
      <SkeletonBox className="h-32" />
    </div>
  );
}
