import Stripe from 'stripe';

// Cliente para CREAR sesiones de checkout: exige la clave real.
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY no configurada');
  return new Stripe(key);
}

// La verificación de firma del webhook solo usa STRIPE_WEBHOOK_SECRET, no la API key
// (así el webhook es testeable en e2e sin clave real).
export function getStripeForWebhooks(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy');
}
