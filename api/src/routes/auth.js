import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { wrap, badRequest, unauthorized, forbidden } from '../lib/http.js';
import { validate, z, email, password } from '../lib/validate.js';
import { hashPassword, verifyPassword, randomToken, sha256 } from '../lib/crypto.js';
import { createSession, destroySession, publicUser, requireAuth } from '../lib/auth.js';
import { sendEmail, templates } from '../lib/email.js';
import { getSetting } from '../lib/settings.js';

export const authRouter = Router();

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'too many attempts, try again later' } });

authRouter.post('/register', limiter, wrap(async (req, res) => {
  const reg = await getSetting('registration');
  if (!reg.allowSelfRegister) throw forbidden('registration is closed; contact the shop');
  const b = validate(z.object({
    email, password, firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(40).optional().default(''),
  }), req.body);
  const { rows: [exists] } = await query('SELECT 1 FROM users WHERE lower(email)=$1', [b.email]);
  if (exists) throw badRequest('an account with that email already exists', { email: 'already registered' });
  const { rows: [u] } = await query(
    `INSERT INTO users (email, password_hash, role, first_name, last_name, phone) VALUES ($1,$2,'student',$3,$4,$5) RETURNING *`,
    [b.email, await hashPassword(b.password), b.firstName, b.lastName, b.phone]);
  await createSession(res, u.id, req.get('user-agent'));
  sendEmail({ to: u.email, ...templates.welcome(u.first_name) }).catch((e) => console.error('welcome email failed', e.message));
  res.status(201).json({ user: publicUser(u) });
}));

authRouter.post('/login', limiter, wrap(async (req, res) => {
  const b = validate(z.object({ email, password: z.string().min(1).max(200) }), req.body);
  const { rows: [u] } = await query('SELECT * FROM users WHERE lower(email)=$1', [b.email]);
  if (!u || !u.active || !(await verifyPassword(b.password, u.password_hash))) throw unauthorized('incorrect email or password');
  await createSession(res, u.id, req.get('user-agent'));
  res.json({ user: publicUser(u) });
}));

authRouter.post('/logout', wrap(async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
}));

authRouter.get('/me', (req, res) => res.json({ user: publicUser(req.user) || null }));

authRouter.post('/change-password', requireAuth, wrap(async (req, res) => {
  const b = validate(z.object({ currentPassword: z.string().max(200).optional(), newPassword: password }), req.body);
  // a forced change (temporary password) does not need the current one re-entered
  if (!req.user.must_change_password && !(await verifyPassword(b.currentPassword || '', req.user.password_hash))) {
    throw badRequest('current password is incorrect', { currentPassword: 'incorrect' });
  }
  await query('UPDATE users SET password_hash=$1, must_change_password=false, updated_at=now() WHERE id=$2',
    [await hashPassword(b.newPassword), req.user.id]);
  // sign out every other device
  await query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [req.user.id, sha256(req.cookies.texrec_session)]);
  res.json({ ok: true });
}));

authRouter.post('/forgot', limiter, wrap(async (req, res) => {
  const b = validate(z.object({ email }), req.body);
  const { rows: [u] } = await query('SELECT * FROM users WHERE lower(email)=$1 AND active', [b.email]);
  if (u) {
    const token = randomToken(32);
    await query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2,now() + interval \'1 hour\')', [u.id, sha256(token)]);
    try { await sendEmail({ to: u.email, ...templates.passwordReset(token) }); }
    catch (e) { console.error('reset email failed', e.message); }
  }
  // same response either way so the endpoint can't be used to probe for accounts
  res.json({ ok: true });
}));

authRouter.post('/reset', limiter, wrap(async (req, res) => {
  const b = validate(z.object({ token: z.string().min(10), password }), req.body);
  const { rows: [r] } = await query(
    'SELECT * FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()', [sha256(b.token)]);
  if (!r) throw badRequest('this reset link is invalid or has expired');
  await query('UPDATE users SET password_hash=$1, must_change_password=false, updated_at=now() WHERE id=$2', [await hashPassword(b.password), r.user_id]);
  await query('UPDATE password_resets SET used_at=now() WHERE id=$1', [r.id]);
  await query('DELETE FROM sessions WHERE user_id=$1', [r.user_id]);
  res.json({ ok: true });
}));
