import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth/guard';

// POST /api/push/subscribe — guarda la suscripción del usuario actual.
// Body: { subscription: { endpoint, keys: { p256dh, auth } } }
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  try {
    const { subscription } = await request.json();
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const authKey = subscription?.keys?.auth;
    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 });
    }

    const userAgent = request.headers.get('user-agent') ?? null;

    // Upsert por endpoint: si ya existe, lo reasigna a este usuario.
    await db
      .insert(pushSubscriptions)
      .values({ userId: auth.session.userId, endpoint, p256dh, auth: authKey, userAgent })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: auth.session.userId, p256dh, auth: authKey, userAgent },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar suscripción' }, { status: 500 });
  }
}
