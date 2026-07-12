import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { isSuperAdminEmail } from '@/lib/auth/group-context';
import { signInviteToken } from '@/lib/onboarding/invite-token';

// POST /api/onboarding/invite-link — genera un enlace de invitación para crear grupo
// (beta cerrada). SOLO súper-admin (allowlist por env, igual que el resto del sistema).
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!isSuperAdminEmail(session.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const token = await signInviteToken();
  const base = process.env.APP_URL || request.nextUrl.origin;
  return NextResponse.json({ url: `${base}/crear-grupo?t=${token}` });
}
