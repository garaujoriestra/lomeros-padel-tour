import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripeForWebhooks } from '@/lib/billing/stripe';
import { recordBillingEvent } from '@/lib/billing/events';
import { extendedPaidUntil } from '@/lib/billing/pass';
import { getGroupById, setGroupPaidUntil } from '@/lib/groups/queries';

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
  } catch {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const groupId = (event.data.object as Stripe.Checkout.Session).metadata?.groupId;
    if (groupId) {
      const fresh = await recordBillingEvent(event.id, groupId, event.type);
      if (fresh) {
        const group = await getGroupById(groupId);
        if (group) await setGroupPaidUntil(groupId, extendedPaidUntil(group.paidUntil));
      }
    }
  }

  return NextResponse.json({ received: true });
}
