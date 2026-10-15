import { query } from '../db.js';
import { config } from '../config.js';
import { randomToken, sha256 } from './crypto.js';
import { unauthorized, forbidden } from './http.js';

export const COOKIE = 'texrec_session';
const ROLE_RANK = { student: 1, staff: 2, admin: 3 };

export const publicUser = (u) => u && ({
  id: u.id, email: u.email, role: u.role, firstName: u.first_name, lastName: u.last_name,
  phone: u.phone, avatarKey: u.avatar_key, dob: u.dob, emergencyContact: u.emergency_contact,
  mustChangePassword: u.must_change_password, active: u.active, createdAt: u.created_at,
});

export async function createSession(res, userId, userAgent) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + config.sessionDays * 86400_000);
  await query('INSERT INTO sessions (user_id, token_hash, user_agent, expires_at) VALUES ($1,$2,$3,$4)',
    [userId, sha256(token), (userAgent || '').slice(0, 300), expires]);
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: config.publicUrl.startsWith('https://'), expires,
  });
}

export async function destroySession(req, res) {
  const token = req.cookies?.[COOKIE];
  if (token) await query('DELETE FROM sessions WHERE token_hash=$1', [sha256(token)]);
  res.clearCookie(COOKIE, { path: '/' });
}

// loads req.user from the session cookie, if any
export async function attachUser(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (token) {
      const { rows: [u] } = await query(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active`, [sha256(token)]);
      req.user = u || null;
    }
    next();
  } catch (e) { next(e); }
}

export const requireAuth = (req, res, next) => (req.user ? next() : next(unauthorized()));

// requireRole('staff') allows staff and admin
export const requireRole = (role) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (ROLE_RANK[req.user.role] < ROLE_RANK[role]) return next(forbidden());
  next();
};
export const isStaff = (u) => u && ROLE_RANK[u.role] >= ROLE_RANK.staff;

// CSRF guard: state-changing requests must come from our own origin
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin') || (req.get('referer') ? new URL(req.get('referer')).origin : null);
  if (!origin) return next(); // non-browser client (curl); cookie auth still needed
  const host = req.get('x-forwarded-host') || req.get('host');
  if (new URL(origin).host !== host) return next(forbidden('cross-site request blocked'));
  next();
}
