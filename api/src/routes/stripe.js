import { Router, raw } from 'express';
import { query } from '../db.js';
import { wrap, badRequest } from '../lib/http.js';
import { stripeClient } from '../lib/stripe.js';
import { getSetting } from '../lib/settings.js';

// Stripe calls this after checkout. Mounted BEFORE the JSON body parser so the
// signature can be verified against the raw bytes.
export const stripeWebhookRouter = Router();

stripeWebhookRouter.post('/webhook', raw({ type: 'application/json' }), wrap(async (req, res) => {
  const stripe = await stripeClient();
  const { webhookSecret } = await getSetting('stripe');
  if (!stripe || !webhookSecret) throw badRequest('stripe not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), webhookSecret);
  } catch (err) {
    throw badRequest(`webhook signature failed: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const enrollmentId = s.metadata?.enrollment_id;
    if (enrollmentId && s.payment_status === 'paid') {
      await query(`UPDATE enrollments SET paid_at=now(), paid_cents=$1, stripe_payment_intent=$2, updated_at=now()
                   WHERE id=$3 AND paid_at IS NULL`, [s.amount_total || 0, s.payment_intent, enrollmentId]);
    }
  }
  res.json({ received: true });
}));
