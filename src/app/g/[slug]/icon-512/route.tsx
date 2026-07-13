import { renderGroupIcon } from '@/lib/og/group-icon';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return renderGroupIcon(slug, 512);
}
