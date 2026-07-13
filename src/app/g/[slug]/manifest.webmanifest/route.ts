import { getGroupBySlug } from '@/lib/groups/resolve-slug';
import { isPaidGroup } from '@/lib/billing/paid';
import { buildGroupManifest } from '@/lib/groups/manifest';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  if (!group) return new Response('Not found', { status: 404 });
  const manifest = buildGroupManifest({
    brand: group,
    basePath: `/g/${slug}`,
    paid: isPaidGroup(group),
  });
  return Response.json(manifest, { headers: { 'content-type': 'application/manifest+json' } });
}
