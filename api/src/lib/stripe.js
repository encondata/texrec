import Stripe from 'stripe';
import { getSetting } from './settings.js';
import { config } from '../config.js';

export async function stripeClient() {
  const s = await getSetting('stripe');
  if (!s.enabled || !s.secretKey) return null;
  return new Stripe(s.secretKey);
}

// Create a Checkout Session for an enrollment; returns the redirect URL
export async function createCheckout(stripe, { enrollment, event, user }) {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: user.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: enrollment.amount_cents,
        product_data: { name: event.title, description: `TexRec — ${new Date(event.starts_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}` },
      },
    }],
    metadata: { enrollment_id: enrollment.id, user_id: user.id },
    success_url: `${config.publicUrl}/portal/classes?paid=1`,
    cancel_url: `${config.publicUrl}/portal/classes?paid=0`,
  });
  return session;
}
