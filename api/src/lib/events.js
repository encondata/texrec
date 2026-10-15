import { query } from '../db.js';

// Shared event query: joins course + dive site, counts taken spots and lists instructors.
// `where` fragments reference the alias `e`; params are appended after any caller params.
export async function listEvents({ where = [], params = [], order = 'e.starts_at ASC', limit } = {}) {
  const sql = `
    SELECT e.*, c.slug AS course_slug, c.name AS course_name, c.image_key AS course_image_key,
           c.price_cents AS course_price_cents, c.level AS course_level, c.category AS course_category,
           a.code AS agency_code,
           d.name AS dive_site_name, d.slug AS dive_site_slug,
           COALESCE(en.taken, 0)::int AS taken,
           COALESCE(en.waitlisted, 0)::int AS waitlisted,
           COALESCE(ins.instructors, '[]'::json) AS instructors
    FROM events e
    LEFT JOIN courses c ON c.id = e.course_id
    LEFT JOIN agencies a ON a.id = c.agency_id
    LEFT JOIN dive_sites d ON d.id = e.dive_site_id
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE status IN ('reserved','completed')) AS taken,
             count(*) FILTER (WHERE status = 'waitlisted') AS waitlisted
      FROM enrollments WHERE event_id = e.id) en ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', u.id, 'firstName', u.first_name, 'lastName', u.last_name,
                                        'avatarKey', COALESCE(sp.photo_key, u.avatar_key)) ORDER BY u.first_name) AS instructors
      FROM event_instructors ei JOIN users u ON u.id = ei.user_id
      LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE ei.event_id = e.id) ins ON true
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${order}
    ${limit ? `LIMIT ${Number(limit)}` : ''}`;
  const { rows } = await query(sql, params);
  return rows.map(shapeEvent);
}

export async function getEvent(id, { publishedOnly = false } = {}) {
  const where = ['e.id = $1'];
  if (publishedOnly) where.push('e.published');
  const [ev] = await listEvents({ where, params: [id] });
  return ev || null;
}

export function shapeEvent(r) {
  const price = r.price_cents ?? r.course_price_cents ?? 0;
  return {
    id: r.id, type: r.type, title: r.title, description: r.description, location: r.location,
    startsAt: r.starts_at, endsAt: r.ends_at, capacity: r.capacity, taken: r.taken, waitlisted: r.waitlisted,
    spotsLeft: Math.max(0, r.capacity - r.taken), priceCents: price, published: r.published,
    allowWaitlist: r.allow_waitlist, instructors: r.instructors,
    course: r.course_id ? { id: r.course_id, slug: r.course_slug, name: r.course_name, imageKey: r.course_image_key,
      level: r.course_level, category: r.course_category, agency: r.agency_code } : null,
    diveSite: r.dive_site_id ? { id: r.dive_site_id, slug: r.dive_site_slug, name: r.dive_site_name } : null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
