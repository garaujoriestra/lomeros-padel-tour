import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { resolvePageContext } from '@/lib/auth/page-context';
import { MeProfileForm } from '@/components/me/me-profile-form';

export const dynamic = 'force-dynamic';

export default async function GroupMeEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?from=/g/${slug}/me/edit`);
  const ctx = await resolvePageContext(slug);
  if (!ctx.player) redirect(`${ctx.basePath}/me`);

  const { name, nickname, avatarUrl, isLeftHanded } = ctx.player;
  return (
    <div className="space-y-6">
      <h1 className="sec-title">Mi perfil</h1>
      <MeProfileForm initial={{ name, nickname, avatarUrl, isLeftHanded }} groupSlug={slug} />
    </div>
  );
}
