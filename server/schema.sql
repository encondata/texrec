-- TexRec Scuba — schema
DROP TABLE IF EXISTS customer_documents CASCADE;
DROP TABLE IF EXISTS session_media CASCADE;
DROP TABLE IF EXISTS customer_notes CASCADE;
DROP TABLE IF EXISTS customer_tokens CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS session_staff CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS dive_sites CASCADE;
DROP TABLE IF EXISTS photos CASCADE;
DROP TABLE IF EXISTS registrations CASCADE;
DROP TABLE IF EXISTS class_sessions CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS staff CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TABLE IF EXISTS admin_tokens CASCADE;

CREATE TABLE courses (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  level         TEXT NOT NULL,              -- Beginner / Continuing / Specialty / Professional
  agency        TEXT NOT NULL DEFAULT 'SDI',
  blurb         TEXT NOT NULL,
  description   TEXT NOT NULL,
  prerequisites TEXT,
  duration      TEXT NOT NULL,              -- human readable, e.g. "3 weekends"
  price_cents   INTEGER NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  -- natural progression: the course that comes before this one; display order
  -- is derived by walking this chain (depth first, then sort as tiebreaker)
  prereq_course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  sort          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE trips (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  destination   TEXT NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  price_cents   INTEGER NOT NULL,
  spots_total   INTEGER NOT NULL,
  spots_taken   INTEGER NOT NULL DEFAULT 0,
  description   TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE staff (
  id      SERIAL PRIMARY KEY,
  name    TEXT NOT NULL,
  role    TEXT NOT NULL,
  certs   TEXT NOT NULL,
  bio     TEXT NOT NULL,
  initials TEXT NOT NULL,
  teaches TEXT NOT NULL DEFAULT '',   -- comma-separated list of classes taught
  sort    INTEGER NOT NULL DEFAULT 0,
  active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE class_sessions (
  id            SERIAL PRIMARY KEY,
  course_id     INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  start_time  TIME NOT NULL DEFAULT '09:00',
  location    TEXT NOT NULL,
  capacity    INTEGER NOT NULL DEFAULT 8,
  status      TEXT NOT NULL DEFAULT 'open',  -- open | full | cancelled | completed
  notes       TEXT,
  CONSTRAINT valid_status CHECK (status IN ('open','full','cancelled','completed'))
);
CREATE INDEX idx_sessions_start ON class_sessions(start_date);

-- who is working a class, and in what capacity
CREATE TABLE session_staff (
  id         SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  staff_id   INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'instructor',
  UNIQUE (session_id, staff_id),
  CONSTRAINT valid_staff_role CHECK
    (role IN ('instructor','divemaster','instructor_trainee','divemaster_trainee'))
);
CREATE INDEX idx_session_staff_staff ON session_staff(staff_id);

-- customers: created automatically from registrations (by email); password optional —
-- with one they can sign in to the customer portal at /account
CREATE TABLE customers (
  id              SERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  phone           TEXT,
  password_hash   TEXT,                    -- NULL until they create portal access
  avatar_filename TEXT,                    -- private file under media/
  share_contact   BOOLEAN NOT NULL DEFAULT FALSE, -- opt-in: show my contact info to classmates
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_tokens (
  token       TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE registrations (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL,
  cert_level  TEXT,                          -- current certification, if any
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | cancelled | waitlist
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_reg_status CHECK (status IN ('pending','confirmed','cancelled','waitlist'))
);
CREATE INDEX idx_reg_session ON registrations(session_id);
CREATE INDEX idx_reg_status ON registrations(status);

CREATE TABLE admin_users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,               -- scrypt: salt:hex
  role          TEXT NOT NULL DEFAULT 'admin', -- superadmin | admin | staff | instructor
  staff_id      INTEGER REFERENCES staff(id) ON DELETE SET NULL, -- links portal login to a staff record
  CONSTRAINT valid_admin_role CHECK (role IN ('superadmin','admin','staff','instructor'))
);

CREATE TABLE admin_tokens (
  token      TEXT PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE dive_sites (
  id       SERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  location TEXT NOT NULL,
  blurb    TEXT NOT NULL,
  website  TEXT,
  services TEXT[] NOT NULL DEFAULT '{}',   -- e.g. {Air Fills,Gear Rental}
  difficulty TEXT CONSTRAINT dive_sites_difficulty_chk
             CHECK (difficulty IN ('beginner','advanced','technical')),
  lat      DOUBLE PRECISION,
  lng      DOUBLE PRECISION,
  sort     INTEGER NOT NULL DEFAULT 0,
  active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE photos (
  id            SERIAL PRIMARY KEY,
  filename      TEXT NOT NULL,          -- file under public/uploads/
  title         TEXT NOT NULL,
  description   TEXT,
  location_name TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  taken_at      DATE,
  uploaded_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sort          INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE notifications (
  id         SERIAL PRIMARY KEY,
  type       TEXT NOT NULL CHECK (type IN ('registration','waitlist','assignment','system')),
  title      TEXT NOT NULL,
  body       TEXT,
  tab        TEXT,                -- admin tab this notification points at (regs/sessions/…)
  acked_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  acked_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_unacked ON notifications(created_at) WHERE acked_at IS NULL;

-- instructor/staff notes and certification records about a customer
CREATE TABLE customer_notes (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  author_id   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  session_id  INTEGER REFERENCES class_sessions(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL DEFAULT 'note',   -- note | certification
  body        TEXT NOT NULL,
  cert_agency TEXT,                            -- certification-only fields
  cert_number TEXT,
  cert_date   DATE,
  visible_to_customer BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_note_kind CHECK (kind IN ('note','certification'))
);
CREATE INDEX idx_notes_customer ON customer_notes(customer_id);

-- private class media: photos/documents for a session, visible to assigned staff
-- and to customers with a confirmed registration. Files live OUTSIDE public/.
CREATE TABLE session_media (
  id            SERIAL PRIMARY KEY,
  session_id    INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  title         TEXT,
  uploaded_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  uploaded_by_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_session ON session_media(session_id);

-- documents attached to a customer: cert cards, medical questionnaires, waivers…
-- uploadable by staff (uploaded_by_admin set) or the customer themself
CREATE TABLE customer_documents (
  id                SERIAL PRIMARY KEY,
  customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  filename          TEXT NOT NULL,          -- private file under media/
  original_name     TEXT NOT NULL,
  mime              TEXT NOT NULL,
  title             TEXT,
  category          TEXT NOT NULL DEFAULT 'other',
  uploaded_by_admin INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  uploaded_by_customer BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_doc_category CHECK (category IN ('cert_card','medical','waiver','other'))
);
CREATE INDEX idx_docs_customer ON customer_documents(customer_id);
