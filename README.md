# TexRec — Scuba Instruction (DFW, Texas)

Marketing site + class calendar + online registration + admin portal.

## Stack
- **Frontend:** static HTML/CSS/JS in `public/` (no build step). Brand built on the diver-down flag — red `#d22030` on white, ink-navy accents. Anton + Barlow type.
- **Motion:** GSAP + ScrollTrigger (staggered reveals, stat count-ups, parallax) and three.js r149 (rising bubble fields in hero panels) via CDN, all in `public/js/fx.js`. Every effect degrades gracefully and respects `prefers-reduced-motion`.
- **API:** Node + Express in `server/server.js`
- **DB:** PostgreSQL (`texrec` database, `texrec`/`texrec` role — local dev only)

## Brand rules
- Training agencies are **TDI-SDI and RAID** — never reference PADI.
- Always feature: small classes (6 students max per instructor) and private classes for every course.

## Run (local dev)
```bash
npm install
npm start        # http://localhost:3000 (uses local Postgres, db "texrec")
```
(`npm run seed` restores DEMO data and drops all tables — do not run against real data.)

## Deploy with Docker

### One-shot installer (easiest)
On any host with Docker + git, run:
```bash
curl -fsSL https://raw.githubusercontent.com/encondata/texrec/main/install.sh | bash
```
It clones the repo, prompts for each setting (blank passwords auto-generate a
strong value), writes `.env`, then builds and starts the stack — and prints the
URL and admin login when it's done.

### Manual
Everything ships as one folder: app container + Postgres container + named
volumes (`pgdata`, `media`, `uploads`) so data survives updates.

```bash
# on the server (any host with docker + compose):
cp .env.example .env      # set real DB + first-admin passwords
docker compose up -d      # builds, boots Postgres, creates schema + first admin
```
First boot runs `server/bootstrap.js`: creates the schema on an empty database
and a first admin account from `BOOTSTRAP_ADMIN_*` (only if no admins exist).
It is idempotent — it never touches an initialized database.

**Updating**: copy/pull the new code onto the server, then
```bash
docker compose up -d --build
```
The image rebuilds and restarts; the database and all uploaded files live in
volumes and are untouched. (Schema changes need their `ALTER TABLE`s applied:
`docker compose exec db psql -U texrec -d texrec`.)

**Migrating your current local data into the container**:
```bash
pg_dump -U texrec -d texrec --no-owner > texrec.sql          # on this Mac
docker compose exec -T db psql -U texrec -d texrec < texrec.sql   # on the server
# then copy the media/uploads files:
docker compose cp ./media/. app:/app/media/
docker compose cp ./public/uploads/. app:/app/public/uploads/
```

**Backups**: `docker compose exec -T db pg_dump -U texrec -d texrec > backup.sql`
plus the `media` and `uploads` volumes.

Before real production traffic: set `CORS_ORIGIN` in `.env` to the real
domain(s) instead of `*`, and put TLS in front (Caddy/nginx/Traefik on the same
host, or `HOST_PORT` behind an existing reverse proxy).

### Serving on a dedicated host IP
To reach the app on its own address (e.g. `10.10.48.7`) instead of the host's
main IP, assign that IP to the host and set `BIND_IP` so the container publishes
only on it. On the Docker host:

```bash
# 1) add the IP to the NIC (replace eth0 with your interface; /24 = your subnet)
sudo ip addr add 10.10.48.7/24 dev eth0
#    make it persistent (Ubuntu/netplan example: add it under the interface's
#    "addresses:" list in /etc/netplan/*.yaml, then: sudo netplan apply)

# 2) in the app's .env:
#      BIND_IP=10.10.48.7
#      HOST_PORT=80
docker compose up -d
```
Now the site answers at `http://10.10.48.7`. The IP must exist on the host
before `up` — Docker can only bind a port to an address the host already owns.

## Pages
| URL | Purpose |
|---|---|
| `/` | Home |
| `/courses` | Course catalog (from DB) |
| `/calendar` | Month calendar of class sessions + registration modal |
| `/trips` | Upcoming dive trips |
| `/sites` | Training sites — blurb, website link, on-site services (from DB) |
| `/gallery` | Photo gallery — cycling carousel + Leaflet dive map with photo pins |
| `/staff` | Instructor bios |
| `/about` | Story, hours, contact |
| `/admin` | Staff portal — role-scoped: inbox, registrations, classes, courses, customers, staff, photos, sites, accounts, profile |
| `/account` | Customer portal — my classes, certifications & notes, private class photos/files |

## Roles & permissions
Portal accounts have one of four roles (`admin_users.role`), enforced server-side:
- **superadmin** — everything an admin can do, plus JSON **bulk imports**
  (`POST /api/admin/{sites,courses}/bulk`) and creating/managing/deleting other
  super admin accounts. The first bootstrap account is a super admin.
- **admin** — everything, including Courses, Staff, Photos, Sites, and Accounts
  (but not bulk imports or managing super admins).
- **staff** — Inbox, Registrations, Classes (create/edit/assign crew), Customers.
- **instructor** — Inbox plus *their own* classes, rosters, students, notes, and
  class media only. Instructor accounts must be linked to a staff record
  (`admin_users.staff_id`); that link drives the "own classes" filter.

## Admin portal
List-first UI: each management tab (Classes, Courses, Trips, Staff, Sites) shows
the data table as the primary display with a round "+" button that opens the
add/edit form in a modal. Rows are expandable — click a row to reveal full
details (descriptions, crew management, services, coordinates, …). Full CRUD
everywhere, with guarded deletes: a course with scheduled classes, a class with
registrations, or a staff member with work history returns a clear 409 telling
you to hide/cancel instead of silently destroying records. Those deletes can be
**forced** — the UI walks through a second confirmation and requires the signed-in
user to re-enter their own password (`DELETE … {force:true, password}`), then
removes/unlinks all dependent records and files.

> **NOTE:** the demo staff/customers/classes were purged on 2026-07-09 so real
> data can be entered. `npm run seed` would wipe EVERYTHING (including real
> courses/trips/sites edits and portal accounts) and restore demo data — don't
> run it against a database with real records.

- **Inbox** — notifications with an acknowledge workflow (badge counts on the bell
  and tab, ack one / ack all, 30s background polling). Generated automatically for:
  new registrations, waitlist signups, instructor assignments, and admin account
  changes. Acks record who acknowledged and when.
- **Classes** — create sessions and assign a full crew per class: multiple staff,
  each as Instructor, Divemaster, Instructor-in-Training, or DM-in-Training
  (`session_staff` table). Assignments notify the inbox and the crew shows on the
  public calendar's registration modal. Each class has a "Roster & Files" panel:
  the student roster (with links to customer records) and private class media
  uploads (images/PDF, stored in `media/` OUTSIDE public/, served only through
  the permission-checked `/api/media/:id/file?t=<token>` endpoint — staff/admin,
  assigned instructors, and customers with a CONFIRMED registration).
- **Courses** — full course-catalog editor (admin only): pricing, level, agency,
  blurb/description, prerequisites text, and the "comes after" progression link.
- **Trips** — full trip management (admin only): title, destination, dates,
  price, spots total/taken, description, hide/show, delete.
- **Customers** — searchable customer list (auto-created from registrations by
  email) with per-customer records: class history, notes, and certifications
  (agency/number/date). Notes can be marked internal-only or visible to the
  customer's portal. Instructors see only students from their own classes.
  Each customer also has an **avatar** (uploadable by staff or the customer;
  private file, initials fallback) and **documents** — cert cards, medical
  forms, waivers (`customer_documents`, images/PDF). Staff and customers can
  both upload; customer uploads ping the staff inbox; customers can delete only
  their own uploads. Files are private (`media/`), served via
  `/api/documents/:id/file?t=<token>` and `/api/customers/:id/avatar?t=<token>`.
- **Staff** — full CRUD for the public staff page, plus per-person **work
  history**: every class they've worked (with role) and every student they've
  taught, derived from crew assignments × registrations.
- **Photos** — upload gallery photos (multipart to `public/uploads/`, 20MB cap,
  jpeg/png/webp/heic). GPS is read from EXIF client-side (exifr CDN) the moment a
  file is picked and prefills lat/lng; the server re-checks EXIF as a fallback and
  returns 422 `gps_required` if coordinates are still missing. EXIF
  DateTimeOriginal prefills the taken date. Edit metadata, hide/show, delete
  (removes the file too).
- **Sites** — CRUD for the Training Sites page (name, location, blurb, website,
  services stored as a `text[]` array, rendered as chips; the form accepts a
  comma-separated string and JSON import accepts an array or CSV string).
- **Accounts** — add/delete admin accounts and reset passwords (reset signs that
  account out everywhere; you can't delete yourself or the last account).
- **My Profile** — edit your own name/email and change your password (requires
  current password; signs out your other sessions). Click your name or the bell
  in the header to jump to Profile/Inbox.

The Staff page is fully DB-driven: bio, avatar initials, certifications, and the
classes each person teaches all come from the `staff` table and are editable in
the admin portal's Staff tab (including hide/show and sort order).

## Admin
Seeded logins (change before deploying):
- `admin@texrec.com` / `divesafe` (admin)
- `frontdesk@texrec.com` / `frontdesk1` (staff)
- `marcus@texrec.com` / `marcusdive1` (instructor, linked to Marcus Reid)
- Customer portal: `bwhitfield@example.com` / `benswims1` at `/account`
`node server/create-admin.js <email> <pw> [name] [role]` upserts portal accounts.
Auth is a bearer token stored in `admin_tokens`; passwords hashed with scrypt.
Token lifetimes are configurable: `ADMIN_TOKEN_HOURS` (default 12) and
`CUSTOMER_TOKEN_DAYS` (default 7) — see `.env.example`.

## Contact sharing (classmates)
`customers.share_contact` (default **off**) — an opt-in toggle, flippable by the
customer (portal, under their avatar) or by staff (customer record). Customers
who opt in appear — name, email, phone — in the "Classmates" line of each
CONFIRMED class for the other confirmed members of that class. Non-shared
customers are invisible there entirely, not just redacted.
`PATCH /api/customer/me {share_contact}` · `PATCH /api/admin/customers/:id {share_contact}`.

## Customer accounts
Every registration upserts a `customers` row by email. The registration form has
an optional password field — filling it creates portal access at `/account`
(7-day tokens in `customer_tokens`). The portal shows their registrations with
status, instructor-visible notes/certifications, and photos/files from classes
where their registration is CONFIRMED.

## Registration flow
1. Visitor picks a session on `/calendar`, submits the form → `POST /api/registrations` (status `pending`; auto-`waitlist` when the class is at capacity; duplicate email per session rejected).
2. Admin confirms or cancels in the portal → `PATCH /api/admin/registrations/:id`.
3. Seat counts shown on the site = `pending + confirmed` registrations vs. session capacity.

## Course progression
Courses are ordered by their natural progression, not a hand-numbered list:
each row's `prereq_course_id` points at the course that comes before it, and
`GET /api/courses` walks that chain (recursive CTE) to compute display order —
`sort` only breaks ties between courses at the same step (e.g. Advanced vs.
Nitrox, which both follow Open Water). The API also returns
`prereq_course_name/slug` and a `next_courses` array, which the Courses page
renders as "← previous / next →" pathway links on every card.

## API (public)
- `GET /api/courses` · `GET /api/trips` · `GET /api/staff`
- `GET /api/sites` · `GET /api/photos`
- `GET /api/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/registrations`

## API (admin, `Authorization: Bearer <token>`)
- `POST /api/admin/login` · `POST /api/admin/logout`
- `GET/PATCH /api/admin/registrations`
- `GET/POST/PATCH/DELETE /api/admin/sessions` · `GET/POST/PATCH/DELETE /api/admin/trips`
- `DELETE /api/admin/courses/:id` · `DELETE /api/admin/staff/:id` · `DELETE /api/admin/sites/:id` · `DELETE /api/admin/customers/:id` (all guarded where records exist)
- `GET/POST/PATCH /api/admin/staff`
- `GET /api/admin/notifications` · `POST /api/admin/notifications/:id/ack` · `POST /api/admin/notifications/ack-all`
- `GET/POST/PATCH /api/admin/sites`
- `GET /api/admin/photos` · `POST /api/admin/photos` (multipart) · `PATCH/DELETE /api/admin/photos/:id`
- `GET/POST/PATCH/DELETE /api/admin/accounts`
- `GET/PATCH /api/admin/me` · `POST /api/admin/me/password`
- `GET/POST/PATCH /api/admin/courses` · `GET /api/admin/staff/:id/history`
- `GET /api/admin/customers[?q=]` · `GET /api/admin/customers/:id` · `POST /api/admin/customers/:id/notes` · `DELETE /api/admin/notes/:id`
- `POST/DELETE /api/admin/sessions/:id/staff[/:staffId]` · `GET /api/admin/sessions/:id/roster`
- `GET/POST /api/admin/sessions/:id/media` · `DELETE /api/admin/media/:id`

## API (customer, `Authorization: Bearer <token>`)
- `POST /api/customer/login` · `POST /api/customer/logout` · `GET /api/customer/me`
- `POST /api/customer/avatar` · `POST /api/customer/documents` · `DELETE /api/customer/documents/:id` (own uploads only)
- `POST /api/customer/sessions/:id/media` (add photos to a CONFIRMED class; notifies staff inbox) · `DELETE /api/customer/media/:id` (own uploads only)
- `GET /api/media/:id/file?t=<token>` · `GET /api/documents/:id/file?t=<token>` · `GET /api/customers/:id/avatar?t=<token>` (all also accept staff tokens)
