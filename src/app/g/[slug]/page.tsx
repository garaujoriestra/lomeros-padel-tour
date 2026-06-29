import { resolvePageContext } from '@/lib/auth/page-context';
import { GroupHomeBody } from '@/components/pages/group-home-body';

export const dynamic = 'force-dynamic';

export default async function GroupHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  return (
    <GroupHomeBody groupId={ctx.groupId} groupName={ctx.group.name} basePath={ctx.basePath} />
  );
}
