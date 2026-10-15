import { Router } from 'express';
import { query, tx } from '../../db.js';
import { wrap, notFound, badRequest } from '../../lib/http.js';
import { validate, z, uuid } from '../../lib/validate.js';
import { listEvents, getEvent } from '../../lib/events.js';
import { publicUser } from '../../lib/auth.js';
import { sendEmail, templates } from '../../lib/email.js';
import { promoteWaitlist, shapeEnrollment } from '../me.js';

export const eventsRouter = Router();

const eventBody = z.object({
  type: z.enum(['class', 'dive_trip', 'training_dive', 'pool_session', 'other']).default('class'),
  courseId: uuid.nullable().optional(), diveSiteId: uuid.nullable().optional(),
  title: z.string().trim().min(1).max(200), description: z.string().max(10000).default(''), location: z.string().trim().max(200).default(''),
  startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }),
  capacity: z.coerce.number().int().min(0).max(500).default(6), priceCents: z.coerce.number().int().min(0).nullable().optional(),
  published: z.boolean().default(true), allowWaitlist: z.boolean().default(true),
  instructorIds: z.array(uuid).max(20).default([]),
}).refine((b) => new Date(b.endsAt) > new Date(b.startsAt), { message: 'end must be after start', path: ['endsAt'] });

eventsRouter.get('/', wrap(async (req, res) => {
  const q = validate(z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), past: z.coerce.boolean().optional() }), req.query);
  const where = []; const params = [];
  if (q.from) { params.push(q.from); where.push(`e.ends_at >= $${params.length}`); }
  if (q.to) { params.push(q.to); where.push(`e.starts_at <= $${params.length}`); }
  if (!q.from && !q.to && !q.past) where.push('e.ends_at > now() - interval \'7 days\'');
  res.json(await listEvents({ where, params }));
}));

eventsRouter.post('/', wrap(async (req, res) => {
  const b = validate(eventBody, req.body);
  const id = await tx(async (client) => {
    const { rows: [e] } = await client.query(
      `INSERT INTO events (type, course_id, dive_site_id, title, description, location, starts_at, ends_at, capacity, price_cents, published, allow_waitlist)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [b.type, b.courseId ?? null, b.diveSiteId ?? null, b.title, b.description, b.location, b.startsAt, b.endsAt, b.capacity, b.priceCents ?? null, b.published, b.allowWaitlist]);
    await setInstructors(client, e.id, b.instructorIds);
    return e.id;
  });
  res.status(201).json(await getEvent(id));
}));

eventsRouter.put('/:id', wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  const b = validate(eventBody, req.body);
  const found = await tx(async (client) => {
    const { rows: [e] } = await client.query(
      `UPDATE events SET type=$1, course_id=$2, dive_site_id=$3, title=$4, description=$5, location=$6, starts_at=$7, ends_at=$8, capacity=$9,
         price_cents=$10, published=$11, allow_waitlist=$12, updated_at=now() WHERE id=$13 RETURNING id`,
      [b.type, b.courseId ?? null, b.diveSiteId ?? null, b.title, b.description, b.location, b.startsAt, b.endsAt, b.capacity, b.priceCents ?? null, b.published, b.allowWaitlist, id]);
    if (!e) return false;
    await setInstructors(client, id, b.instructorIds);
    return true;
  });
  if (!found) throw notFound();
  await promoteWaitlist(id); // capacity may have grown
  res.json(await getEvent(id));
}));

async function setInstructors(client, eventId, ids) {
  await client.query('DELETE FROM event_instructors WHERE event_id=$1', [eventId]);
  for (const uid of new Set(ids)) {
    await client.query(`INSERT INTO event_instructors (event_id, user_id) SELECT $1, id FROM users WHERE id=$2 AND role IN ('staff','admin')`, [eventId, uid]);
  }
}

eventsRouter.delete('/:id', wrap(async (req, res) => {
  const { rowCount } = await query('DELETE FROM events WHERE id=$1', [validate(uuid, req.params.id)]);
  if (!rowCount) throw notFound();
  res.json({ ok: true });
}));

// duplicate an event (same course/instructors) to a new date
eventsRouter.post('/:id/duplicate', wrap(async (req, res) => {
  const id = validate(uuid, req.params.id);
  const b = validate(z.object({ startsAt: z.string().datetime({ offset: true }) }), req.body);
  const newId = await tx(async (client) => {
    const { rows: [e] } = await client.query('SELECT * FROM events WHERE id=$1', [id]);
    if (!e) throw notFound();
    const shift = new Date(b.startsAt) - new Date(e.starts_at);
    const { rows: [n] } = await client.query(
      `INSERT INTO events (type, course_id, dive_site_id, title, description, location, starts_at, ends_at, capacity, price_cents, published, allow_waitlist)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11) RETURNING id`,
      [e.type, e.course_id, e.dive_site_id, e.title, e.description, e.location, b.startsAt, new Date(new Date(e.ends_at).getTime() + shift), e.capacity, e.price_cents, e.allow_waitlist]);
    await client.query('INSERT INTO event_instructors (event_id, user_id) SELECT $1, user_id FROM event_instructors WHERE event_id=$2', [n.id, id]);
    return n.id;
  });
  res.status(201).json(await getEvent(newId));
}));

// ---- roster ----
eventsRouter.get('/:id/enrollments', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT en.*, row_to_json(u.*) AS u FROM enrollments en JOIN users u ON u.id=en.user_id WHERE en.event_id=$1
     ORDER BY CASE en.status WHEN 'reserved' THEN 0 WHEN 'completed' THEN 1 WHEN 'waitlisted' THEN 2 ELSE 3 END, en.created_at`,
    [validate(uuid, req.params.id)]);
  res.json(rows.map((r) => ({ ...shapeEnrollment(r), user: publicUser(r.u) })));
}));

// staff adds a student to an event directly
eventsRouter.post('/:id/enrollments', wrap(async (req, res) => {
  const eventId = validate(uuid, req.params.id);
  const b = validate(z.object({ userId: uuid, status: z.enum(['reserved', 'waitlisted']).default('reserved'), notes: z.string().max(1000).default('') }), req.body);
  const { rows: [ev] } = await query('SELECT e.*, COALESCE(e.price_cents, c.price_cents, 0) AS price FROM events e LEFT JOIN courses c ON c.id=e.course_id WHERE e.id=$1', [eventId]);
  if (!ev) throw notFound();
  const { rows: [en] } = await query(
    `INSERT INTO enrollments (event_id, user_id, status, amount_cents, notes) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (event_id, user_id) DO UPDATE SET status=$3, notes=$5, updated_at=now() RETURNING *`,
    [eventId, b.userId, b.status, ev.price, b.notes]);
  const { rows: [u] } = await query('SELECT * FROM users WHERE id=$1', [b.userId]);
  if (u) sendEmail({ to: u.email, ...templates.enrollment(u.first_name, ev, b.status) }).catch(() => {});
  res.status(201).json({ ...shapeEnrollment(en), user: publicUser(u) });
}));

eventsRouter.put('/enrollments/:eid', wrap(async (req, res) => {
  const id = validate(uuid, req.params.eid);
  const b = validate(z.object({
    status: z.enum(['reserved', 'waitlisted', 'cancelled', 'completed', 'no_show']).optional(),
    paid: z.boolean().optional(), paidCents: z.coerce.number().int().min(0).optional(), notes: z.string().max(1000).optional(),
  }), req.body);
  const { rows: [cur] } = await query('SELECT * FROM enrollments WHERE id=$1', [id]);
  if (!cur) throw notFound();
  const status = b.status ?? cur.status;
  const paidAt = b.paid === undefined ? cur.paid_at : (b.paid ? (cur.paid_at || new Date()) : null);
  const paidCents = b.paid === false ? 0 : (b.paidCents ?? (b.paid && !cur.paid_at ? cur.amount_cents : cur.paid_cents));
  const { rows: [en] } = await query(
    `UPDATE enrollments SET status=$1, paid_at=$2, paid_cents=$3, notes=$4, updated_at=now() WHERE id=$5 RETURNING *`,
    [status, paidAt, paidCents, b.notes ?? cur.notes, id]);
  if (['cancelled', 'no_show'].includes(status) && cur.status === 'reserved') await promoteWaitlist(cur.event_id);
  res.json(shapeEnrollment(en));
}));

eventsRouter.delete('/enrollments/:eid', wrap(async (req, res) => {
  const { rows: [en] } = await query('DELETE FROM enrollments WHERE id=$1 RETURNING *', [validate(uuid, req.params.eid)]);
  if (!en) throw notFound();
  if (en.status === 'reserved') await promoteWaitlist(en.event_id);
  res.json({ ok: true });
}));
