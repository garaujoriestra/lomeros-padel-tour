import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { getGroupById } from '@/lib/groups/queries';
import { getStripe } from '@/lib/billing/stripe';

// POST /api/billing/checkout — crea la sesión de pago del Pase de Temporada
// (pago único anual; admin DEL grupo; body.g). Dormido tras BILLING_ENABLED.
export async function POST(request: NextRequest) {
  if (process.env.BILLING_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'El Pase de Temporada está incluido durante la beta' },
      { status: 503 },
    );
  }
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;

  const group = await getGroupById(auth.ctx.groupId);
  if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });

  try {
    const back = `${request.nextUrl.origin}/g/${group.slug}/admin/marca`;
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      metadata: { groupId: group.id },
      success_url: `${back}?pase=ok`,
      cancel_url: back,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('Stripe checkout error:', e);
    return NextResponse.json({ error: 'No se pudo iniciar el pago' }, { status: 500 });
  }
}
