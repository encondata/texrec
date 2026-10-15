import { Router } from 'express';
import { query } from '../db.js';
import { wrap, notFound } from '../lib/http.js';
import { getContent } from '../lib/content.js';
import { listEvents, getEvent } from '../lib/events.js';
import { getSetting } from '../lib/settings.js';
import { validate, z } from '../lib/validate.js';

export const publicRouter = Router();

publicRouter.get('/content', wrap(async (req, res) => {
  const [content, reg, stripe] = await Promise.all([getContent(), getSetting('registration'), getSetting('stripe')]);
  res.json({ content, allowSelfRegister: reg.allowSelfRegister, paymentsEnabled: !!(stripe.enabled && stripe.publishableKey) });
}));

publicRouter.get('/agencies', wrap(async (req, res) => {
  const { rows } = await query('SELECT id, code, name, logo_key AS "logoKey" FROM agencies ORDER BY sort');
  res.json(rows);
}));

export const shapeCourse = (c) => ({
  id: c.id, slug: c.slug, name: c.name, agency: c.agency_code, agencyId: c.agency_id, category: c.category, level: c.level,
  priceCents: c.price_cents, duration: c.duration, summary: c.summary, description: c.description,
  prerequisites: c.prerequisites, outcomes: c.outcomes, faq: c.faq, imageKey: c.image_key,
  featured: c.featured, active: c.active, sort: c.sort,
});
const COURSE_SQL = `SELECT c.*, a.code AS agency_code FROM courses c LEFT JOIN agencies a ON a.id=c.agency_id`;

publicRouter.get('/courses', wrap(async (req, res) => {
  const { rows } = await query(`${COURSE_SQL} WHERE c.active ORDER BY c.sort, c.name`);
  res.json(rows.map(shapeCourse));
}));

publicRouter.get('/courses/:slug', wrap(async (req, res) => {
  const { rows: [c] } = await query(`${COURSE_SQL} WHERE c.slug=$1 AND c.active`, [req.params.slug]);
  if (!c) throw notFound();
  const events = await listEvents({ where: ['e.course_id=$1', 'e.published', 'e.ends_at > now()'], params: [c.id] });
  res.json({ ...shapeCourse(c), events });
}));

publicRouter.get('/staff', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.first_name, u.last_name, sp.title, sp.bio, sp.certifications, sp.agencies,
            COALESCE(sp.photo_key, u.avatar_key) AS photo_key
     FROM staff_profiles sp JOIN users u ON u.id=sp.user_id
     WHERE sp.public AND u.active ORDER BY sp.sort, u.first_name`);
  res.json(rows.map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, title: r.title, bio: r.bio,
    certifications: r.certifications, agencies: r.agencies, photoKey: r.photo_key })));
}));

publicRouter.get('/dive-sites', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM dive_sites WHERE active ORDER BY sort, name');
  res.json(rows.map(shapeSite));
}));
export const shapeSite = (d) => ({ id: d.id, slug: d.slug, name: d.name, location: d.location, description: d.description,
  difficulty: d.difficulty, lat: d.lat, lng: d.lng, imageKey: d.image_key, active: d.active, sort: d.sort });

const eventsQuery = z.object({
  from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  type: z.enum(['class', 'dive_trip', 'training_dive', 'pool_session', 'other']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  upcoming: z.coerce.boolean().optional(),
});

publicRouter.get('/events', wrap(async (req, res) => {
  const q = validate(eventsQuery, req.query);
  const where = ['e.published'];
  const params = [];
  if (q.from) { params.push(q.from); where.push(`e.ends_at >= $${params.length}`); }
  if (q.to) { params.push(q.to); where.push(`e.starts_at <= $${params.length}`); }
  if (q.type) { params.push(q.type); where.push(`e.type = $${params.length}`); }
  if (q.upcoming) where.push('e.ends_at > now()');
  res.json(await listEvents({ where, params, limit: q.limit }));
}));

publicRouter.get('/events/:id', wrap(async (req, res) => {
  const ev = await getEvent(validate(z.string().uuid(), req.params.id), { publishedOnly: true });
  if (!ev) throw notFound();
  res.json(ev);
}));

export const shapePost = (p) => ({ id: p.id, slug: p.slug, title: p.title, category: p.category, excerpt: p.excerpt,
  body: p.body, coverKey: p.cover_key, publishedAt: p.published_at, createdAt: p.created_at,
  author: p.author_first ? { firstName: p.author_first, lastName: p.author_last } : null });
const POST_SQL = `SELECT p.*, u.first_name AS author_first, u.last_name AS author_last FROM posts p LEFT JOIN users u ON u.id=p.author_id`;

publicRouter.get('/posts', wrap(async (req, res) => {
  const q = validate(z.object({ category: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }), req.query);
  const params = [];
  let where = 'p.published_at IS NOT NULL AND p.published_at <= now()';
  if (q.category) { params.push(q.category); where += ` AND p.category=$${params.length}`; }
  const { rows } = await query(`${POST_SQL} WHERE ${where} ORDER BY p.published_at DESC LIMIT ${q.limit}`, params);
  res.json(rows.map((p) => ({ ...shapePost(p), body: undefined })));
}));

publicRouter.get('/posts/:slug', wrap(async (req, res) => {
  const { rows: [p] } = await query(`${POST_SQL} WHERE p.slug=$1 AND p.published_at IS NOT NULL AND p.published_at <= now()`, [req.params.slug]);
  if (!p) throw notFound();
  res.json(shapePost(p));
}));

export const shapeMedia = (m) => ({ id: m.id, key: m.key, mime: m.mime, width: m.width, height: m.height, title: m.title,
  caption: m.caption, album: m.album, videoUrl: m.video_url, sort: m.sort, public: m.public, createdAt: m.created_at });

publicRouter.get('/media', wrap(async (req, res) => {
  const q = validate(z.object({ album: z.string().optional() }), req.query);
  const params = [];
  let where = 'public';
  if (q.album) { params.push(q.album); where += ` AND album=$${params.length}`; }
  const { rows } = await query(`SELECT * FROM media WHERE ${where} ORDER BY sort, created_at DESC`, params);
  res.json(rows.map(shapeMedia));
}));
