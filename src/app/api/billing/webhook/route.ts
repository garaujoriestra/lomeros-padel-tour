import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripeForWebhooks } from '@/lib/billing/stripe';
import { recordBillingEvent } from '@/lib/billing/events';
import { extendGroupPass } from '@/lib/groups/queries';

// Stripe.webhooks.constructEvent es SÍNCRONO y usa el crypto de Node.
export const runtime = 'nodejs';

// POST /api/billing/webhook — único escritor de groups.paid_until.
// Firma verificada con STRIPE_WEBHOOK_SECRET sobre el body RAW; idempotente por
// event.id (billing_events). Siempre 200 a eventos válidos aunque no nos interesen.
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook no configurado' }, { status: 503 });

  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = getStripeForWebhooks().webhooks.constructEvent(payload, signature, secret);
  } catch (e) {
    // Sin volcar payload ni secret: solo el mensaje, para ver reintentos fallidos.
    console.warn('Firma de webhook inválida', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    // En mode:'payment' el evento puede llegar con payment_status:'unpaid' (métodos
    // diferidos): solo concedemos el Pase cuando el pago está confirmado ('paid').
    const session = event.data.object as Stripe.Checkout.Session;
    const groupId = session.metadata?.groupId;
    if (groupId && session.payment_status === 'paid') {
      // Registrar ANTES de aplicar (idempotencia: reintentos del mismo event.id no
      // reaplican el efecto). extendGroupPass es una UPDATE atómica (cierra la carrera
      // de dos pagos concurrentes distintos: no hay read-modify-write intermedio).
      const fresh = await recordBillingEvent(event.id, groupId, event.type);
      if (fresh) await extendGroupPass(groupId);
    }
  }

  return NextResponse.json({ received: true });
}
