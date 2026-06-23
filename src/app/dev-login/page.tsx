import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, memberships, groups } from '@/lib/db/schema';
import { isDevToolingEnabled } from '@/lib/auth/dev-login';
import { DevLoginForm } from './dev-login-form';

export const dynamic = 'force-dynamic';

export default async function DevLoginPage() {
  if (!isDevToolingEnabled()) notFound();

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      role: memberships.role,
      groupName: groups.name,
    })
    .from(users)
    .leftJoin(memberships, eq(memberships.userId, users.id))
    .leftJoin(groups, eq(groups.id, memberships.groupId));

  return <DevLoginForm users={rows} />;
}
