# TexRec — Scuba Instruction (Burleson, TX)

Website, class scheduling, student portal and admin portal for Tex Rec Scuba Training
(SDI / TDI / RAID). Work happens on the `Dev` branch.

## Stack (Docker Compose)

| Service   | Image                      | Role                                                          | Exposed                      |
|-----------|----------------------------|---------------------------------------------------------------|------------------------------|
| `web`     | `nginx:1.27-alpine`        | Serves the React SPA (`web/`), proxies `/api/*` to `api`      | `${BIND_IP}:${HOST_PORT}`    |
| `api`     | `node:22-alpine`           | Express API (`api/src`)                                       | internal only                |
| `db`      | `postgres:17-alpine`       | PostgreSQL, data in `pgdata` volume                           | internal only                |
| `minio`   | built from source (Alpine) | S3-compatible object storage, data in `miniodata` volume      | console `127.0.0.1:9001`     |
| `mailpit` | `axllent/mailpit`          | Dev mail catcher (every outgoing email lands in its inbox)    | UI `127.0.0.1:8025`          |

## Run

```bash
cp .env.example .env     # set APP_SECRET, DB/MinIO passwords, first admin login
docker compose up -d --build
```

Then open `http://localhost` (or `HOST_PORT`). First boot applies the schema, creates the
admin from `BOOTSTRAP_ADMIN_*` (you'll be asked to pick a new password on first sign-in),
and — if `SEED_DEMO=1` — loads demo courses, staff, events, posts and students
(see `api/src/seed.js` for their logins). Set `SEED_DEMO=0` for a production install.

Health: `curl http://localhost/api/health` → `{"status":"ok","db":"ok","storage":"ok"}`

## What's in the app

**Public site** — home (editable hero, feature cards, featured classes, next event), training
catalog with agency/level filters and course detail pages (overview, prerequisites, what you'll
learn, schedule, FAQ), calendar (month/list, filter by type, "x of y spots"), instructor bios,
blog/newsletter, photo + video gallery, about. Fully responsive down to portrait phones.

**Student portal** (`/portal`) — dashboard, enroll/waitlist/cancel on events, my classes,
calendar, profile + photo, private documents (waivers, medical forms), certifications, logbook.

**Admin portal** (`/admin`, staff + admin roles) — dashboard, students (profiles, enrollments,
certifications, documents, password resets), classes & events (create/edit/duplicate, assign
instructors, roster with status/payment/notes, waitlist auto-promotion), courses, instructor
bios, dive sites, blog posts (Markdown with image upload), media gallery, **Site Content**
(every headline/blurb/image on the public site), and **Settings** (admin only).

### Settings → Email
Choose a provider in the admin UI and enter credentials; secrets are encrypted with
`APP_SECRET` before they're stored.
- **SMTP** — Mailpit (default in dev), Google Workspace (`smtp.gmail.com:587` + app password),
  Microsoft 365 (`smtp.office365.com:587`, SMTP AUTH enabled), or any other SMTP server.
- **SendGrid / Postmark / Resend** — paste an API key.
- "Send test" button verifies delivery.

### Settings → Payments (Stripe)
Reservations are held without payment by default. Enter your Stripe publishable + secret keys,
add a webhook for `checkout.session.completed` pointing at `https://your-domain/api/stripe/webhook`,
paste the signing secret, and tick "Accept card payments". Students are then sent to Stripe
Checkout right after reserving a paid class; the webhook marks the enrollment paid.

## Layout

```
api/src/
  server.js        express app, middleware, route mounting
  db.js            pg pool + migrations runner (src/migrations/*.sql)
  bootstrap.js     first admin + optional demo seed
  lib/             auth (cookie sessions, roles, CSRF), settings (encrypted), storage (MinIO +
                   sharp image pipeline), email providers, stripe, content schema, event queries
  routes/          public, auth, me (student), files (MinIO streaming), stripe webhook, admin/*
web/src/
  pages/public     home, training, calendar, instructors, blog, media, about, auth
  pages/portal     student portal
  pages/admin      admin portal
  components/      layout shells, UI primitives, event/calendar components
  lib/             api client, auth context, content hook, formatting, types
```

## Security notes
- Passwords hashed with scrypt; sessions are random tokens stored hashed, in httpOnly
  SameSite=Lax cookies; state-changing requests are origin-checked.
- Only `web` is published. MinIO, Postgres and the API are reachable only on the compose network.
- Uploaded images are re-encoded to WebP (strips metadata); documents are served only to their
  owner or staff. nginx sets CSP, X-Frame-Options and friends.
- Login/registration/reset endpoints are rate limited.

## Brand rules
- Training agencies are **TDI-SDI and RAID** — never reference PADI.
- Always feature: small classes (6 students max per instructor) and private classes for every course.
- Logos live in `web/public/img/`. Design references are in `Pitch Deck/`.
