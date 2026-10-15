import { Router } from 'express';
import multer from 'multer';
import { query } from '../../db.js';
import { wrap, notFound, badRequest, slugify } from '../../lib/http.js';
import { validate, z, uuid } from '../../lib/validate.js';
import { storeImage, deleteImage } from '../../lib/storage.js';
import { shapeCourse, shapeSite, shapePost } from '../public.js';

// courses, dive sites and blog posts: the same create/update/delete/image pattern
export const catalogRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

async function uniqueSlug(table, base, excludeId) {
  let slug = slugify(base);
  for (let i = 2; ; i++) {
    const { rows } = await query(`SELECT 1 FROM ${table} WHERE slug=$1 AND id IS DISTINCT FROM $2`, [slug, excludeId || null]);
    if (!rows.length) return slug;
    slug = `${slugify(base)}-${i}`;
  }
}

// ---------- courses ----------
const courseBody = z.object({
  name: z.string().trim().min(1).max(120), slug: z.string().trim().max(80).optional(),
  agencyId: z.coerce.number().int().nullable().optional(),
  category: z.enum(['recreational', 'technical', 'specialty', 'professional']).default('recreational'),
  level: z.enum(['beginner', 'intermediate', 'advanced', 'technical', 'professional']).default('beginner'),
  priceCents: z.coerce.number().int().min(0).default(0), duration: z.string().trim().max(60).default(''),
  summary: z.string().max(400).default(''), description: z.string().max(20000).default(''),
  prerequisites: z.string().max(5000).default(''), outcomes: z.string().max(5000).default(''),
  faq: z.array(z.object({ q: z.string().max(300), a: z.string().max(2000) })).max(30).default([]),
  featured: z.boolean().default(false), active: z.boolean().default(true), sort: z.coerce.number().int().default(100),
});
const COURSE_SQL = `SELECT c.*, a.code AS agency_code FROM courses c LEFT JOIN agencies a ON a.id=c.agency_id`;

catalogRouter.get('/courses', wrap(async (req, res) => {
  const { rows } = await query(`${COURSE_SQL} ORDER BY c.sort, c.name`);
  res.json(rows.map(shapeCourse));
}));
catalogRouter.post('/courses', wrap(async (req, res) => {
  const b = validate(courseBody, req.body);
  const slug = await uniqueSlug('courses', b.slug || b.name);
  const { rows: [c] } = await query(
    `INSERT INTO courses (slug, name, agency_id, category, level, price_cents, duration, summary, description, prerequisites, outcomes, faq, featured, active, sort)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [slug, b.name, b.agencyId ?? null, b.category, b.level, b.priceCents, b.duration, b.summary, b.description, b.prerequisites, b.outcomes, JSON.stringify(b.faq), b.featured, b.active, b.sort]);
  const { rows: [full] } = await query(`${COURSE_SQL} WHERE c.id=$1`, [c.id]);
  res.status(201).json(shapeCourse(full));
}));
catalogRouter.put('/courses/:id', wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  const b = validate(courseBody, req.body);
  const slug = await uniqueSlug('courses', b.slug || b.name, id);
  const { rows: [c] } = await query(
    `UPDATE courses SET slug=$1, name=$2, agency_id=$3, category=$4, level=$5, price_cents=$6, duration=$7, summary=$8, description=$9,
       prerequisites=$10, outcomes=$11, faq=$12, featured=$13, active=$14, sort=$15, updated_at=now() WHERE id=$16 RETURNING id`,
    [slug, b.name, b.agencyId ?? null, b.category, b.level, b.priceCents, b.duration, b.summary, b.description, b.prerequisites, b.outcomes, JSON.stringify(b.faq), b.featured, b.active, b.sort, id]);
  if (!c) throw notFound();
  const { rows: [full] } = await query(`${COURSE_SQL} WHERE c.id=$1`, [id]);
  res.json(shapeCourse(full));
}));
catalogRouter.delete('/courses/:id', wrap(async (req, res) => {
  const { rows: [c] } = await query('DELETE FROM courses WHERE id=$1 RETURNING image_key', [validate(uuid, req.params.id)]);
  if (!c) throw notFound();
  await deleteImage(c.image_key);
  res.json({ ok: true });
}));
catalogRouter.post('/courses/:id/image', upload.single('file'), wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  if (!req.file) throw badRequest('no file');
  const img = await storeImage('courses', req.file.buffer, req.file.mimetype);
  const { rows: [old] } = await query('UPDATE courses SET image_key=$1, updated_at=now() WHERE id=$2 RETURNING (SELECT image_key FROM courses WHERE id=$2) AS prev', [img.key, id]);
  if (!old) throw notFound();
  await deleteImage(old.prev);
  res.json({ imageKey: img.key });
}));

// ---------- dive sites ----------
const siteBody = z.object({
  name: z.string().trim().min(1).max(120), slug: z.string().trim().max(80).optional(), location: z.string().trim().max(200).default(''),
  description: z.string().max(10000).default(''), difficulty: z.enum(['all', 'beginner', 'intermediate', 'advanced', 'technical']).default('all'),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(), lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  active: z.boolean().default(true), sort: z.coerce.number().int().default(100),
});
catalogRouter.get('/dive-sites', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM dive_sites ORDER BY sort, name');
  res.json(rows.map(shapeSite));
}));
catalogRouter.post('/dive-sites', wrap(async (req, res) => {
  const b = validate(siteBody, req.body);
  const slug = await uniqueSlug('dive_sites', b.slug || b.name);
  const { rows: [d] } = await query(
    `INSERT INTO dive_sites (slug, name, location, description, difficulty, lat, lng, active, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [slug, b.name, b.location, b.description, b.difficulty, b.lat ?? null, b.lng ?? null, b.active, b.sort]);
  res.status(201).json(shapeSite(d));
}));
catalogRouter.put('/dive-sites/:id', wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  const b = validate(siteBody, req.body);
  const slug = await uniqueSlug('dive_sites', b.slug || b.name, id);
  const { rows: [d] } = await query(
    `UPDATE dive_sites SET slug=$1, name=$2, location=$3, description=$4, difficulty=$5, lat=$6, lng=$7, active=$8, sort=$9 WHERE id=$10 RETURNING *`,
    [slug, b.name, b.location, b.description, b.difficulty, b.lat ?? null, b.lng ?? null, b.active, b.sort, id]);
  if (!d) throw notFound();
  res.json(shapeSite(d));
}));
catalogRouter.delete('/dive-sites/:id', wrap(async (req, res) => {
  const { rows: [d] } = await query('DELETE FROM dive_sites WHERE id=$1 RETURNING image_key', [validate(uuid, req.params.id)]);
  if (!d) throw notFound();
  await deleteImage(d.image_key);
  res.json({ ok: true });
}));
catalogRouter.post('/dive-sites/:id/image', upload.single('file'), wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  if (!req.file) throw badRequest('no file');
  const img = await storeImage('sites', req.file.buffer, req.file.mimetype);
  const { rows: [old] } = await query('UPDATE dive_sites SET image_key=$1 WHERE id=$2 RETURNING (SELECT image_key FROM dive_sites WHERE id=$2) AS prev', [img.key, id]);
  if (!old) throw notFound();
  await deleteImage(old.prev);
  res.json({ imageKey: img.key });
}));

// ---------- posts ----------
const postBody = z.object({
  title: z.string().trim().min(1).max(200), slug: z.string().trim().max(80).optional(),
  category: z.enum(['news', 'training_tips', 'trip_reports', 'equipment', 'videos']).default('news'),
  excerpt: z.string().max(500).default(''), body: z.string().max(100000).default(''),
  publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
});
const POST_SQL = `SELECT p.*, u.first_name AS author_first, u.last_name AS author_last FROM posts p LEFT JOIN users u ON u.id=p.author_id`;

catalogRouter.get('/posts', wrap(async (req, res) => {
  const { rows } = await query(`${POST_SQL} ORDER BY COALESCE(p.published_at, p.created_at) DESC`);
  res.json(rows.map(shapePost));
}));
catalogRouter.post('/posts', wrap(async (req, res) => {
  const b = validate(postBody, req.body);
  const slug = await uniqueSlug('posts', b.slug || b.title);
  const { rows: [p] } = await query(
    `INSERT INTO posts (slug, title, category, excerpt, body, author_id, published_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [slug, b.title, b.category, b.excerpt, b.body, req.user.id, b.publishedAt ?? null]);
  const { rows: [full] } = await query(`${POST_SQL} WHERE p.id=$1`, [p.id]);
  res.status(201).json(shapePost(full));
}));
catalogRouter.put('/posts/:id', wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  const b = validate(postBody, req.body);
  const slug = await uniqueSlug('posts', b.slug || b.title, id);
  const { rows: [p] } = await query(
    `UPDATE posts SET slug=$1, title=$2, category=$3, excerpt=$4, body=$5, published_at=$6, updated_at=now() WHERE id=$7 RETURNING id`,
    [slug, b.title, b.category, b.excerpt, b.body, b.publishedAt ?? null, id]);
  if (!p) throw notFound();
  const { rows: [full] } = await query(`${POST_SQL} WHERE p.id=$1`, [id]);
  res.json(shapePost(full));
}));
catalogRouter.delete('/posts/:id', wrap(async (req, res) => {
  const { rows: [p] } = await query('DELETE FROM posts WHERE id=$1 RETURNING cover_key', [validate(uuid, req.params.id)]);
  if (!p) throw notFound();
  await deleteImage(p.cover_key);
  res.json({ ok: true });
}));
catalogRouter.post('/posts/:id/cover', upload.single('file'), wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  if (!req.file) throw badRequest('no file');
  const img = await storeImage('posts', req.file.buffer, req.file.mimetype);
  const { rows: [old] } = await query('UPDATE posts SET cover_key=$1, updated_at=now() WHERE id=$2 RETURNING (SELECT cover_key FROM posts WHERE id=$2) AS prev', [img.key, id]);
  if (!old) throw notFound();
  await deleteImage(old.prev);
  res.json({ coverKey: img.key });
}));

// images embedded inside markdown bodies (posts, course descriptions, about page)
catalogRouter.post('/images', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw badRequest('no file');
  const img = await storeImage('content', req.file.buffer, req.file.mimetype);
  res.status(201).json({ key: img.key, url: `/api/files/${img.key}`, width: img.width, height: img.height });
}));
