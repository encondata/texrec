-- 005: refactor "classes" into standalone typed sessions on the calendar.
--
-- Old model: a class_session bundled fixed dates for a course; class_meetings were
-- dated events under it; registrations tied a customer to one class.
-- New model: sessions are independent dated events, each of a shared *type* (Pool,
-- Lake Day 1, …). A course defines a recipe of required types (course_slots). A
-- customer enrolls in a course and selects one session per required slot.
--
-- This is a clean cutover: the old class/meeting/registration tables are dropped
-- (courses, customers, staff are preserved). No example data is generated.

DROP TABLE IF EXISTS meeting_attendance CASCADE;
DROP TABLE IF EXISTS class_meetings CASCADE;
DROP TABLE IF EXISTS course_requirements CASCADE;
DROP TABLE IF EXISTS registrations CASCADE;
DROP TABLE IF EXISTS session_staff CASCADE;
DROP TABLE IF EXISTS session_media CASCADE;
DROP TABLE IF EXISTS class_sessions CASCADE;

-- shared session-type vocabulary
CREATE TABLE IF NOT EXISTS session_types (
  id     SERIAL PRIMARY KEY,
  name   TEXT NOT NULL,
  slug   TEXT NOT NULL UNIQUE,
  sort   INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO session_types (name, slug, sort) VALUES
  ('Academics', 'academics', 10),
  ('Pool', 'pool', 20),
  ('Lake Day 1', 'lake-day-1', 30),
  ('Lake Day 2', 'lake-day-2', 40)
ON CONFLICT (slug) DO NOTHING;

-- a course's ordered recipe of required sessions (one row per required slot)
CREATE TABLE IF NOT EXISTS course_slots (
  id              SERIAL PRIMARY KEY,
  course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  session_type_id INTEGER NOT NULL REFERENCES session_types(id) ON DELETE CASCADE,
  sort            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_course_slots_course ON course_slots(course_id);

-- standalone dated sessions shown on the calendar (not tied to any single course)
CREATE TABLE IF NOT EXISTS sessions (
  id              SERIAL PRIMARY KEY,
  session_type_id INTEGER NOT NULL REFERENCES session_types(id) ON DELETE RESTRICT,
  title           TEXT,
  session_date    DATE NOT NULL,
  start_time      TIME,
  end_time        TIME,
  location        TEXT,
  capacity        INTEGER NOT NULL DEFAULT 6,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'open',   -- open | cancelled | completed
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_session_status CHECK (status IN ('open','cancelled','completed'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(session_type_id);

-- who is working a session, and in what capacity
CREATE TABLE IF NOT EXISTS session_staff (
  id         SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  staff_id   INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'instructor',
  UNIQUE (session_id, staff_id),
  CONSTRAINT valid_staff_role CHECK (role IN ('instructor','divemaster','instructor_trainee','divemaster_trainee'))
);
CREATE INDEX IF NOT EXISTS idx_session_staff_staff ON session_staff(staff_id);

-- course-level enrollment (a customer signed up for a course)
CREATE TABLE IF NOT EXISTS enrollments (
  id          SERIAL PRIMARY KEY,
  course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL,
  cert_level  TEXT,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | cancelled | waitlist
  paid                BOOLEAN NOT NULL DEFAULT FALSE,
  welcome_packet_sent BOOLEAN NOT NULL DEFAULT FALSE,
  coursework_complete BOOLEAN NOT NULL DEFAULT FALSE, -- manual fallback for courses without a recipe
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_enroll_status CHECK (status IN ('pending','confirmed','cancelled','waitlist'))
);
CREATE INDEX IF NOT EXISTS idx_enroll_course ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enroll_customer ON enrollments(customer_id);

-- the sessions a customer selected for their enrollment + attendance status
CREATE TABLE IF NOT EXISTS enrollment_sessions (
  id            SERIAL PRIMARY KEY,
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | attended | completed | no_show | excused
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, session_id),
  CONSTRAINT valid_es_status CHECK (status IN ('scheduled','attended','completed','no_show','excused'))
);
CREATE INDEX IF NOT EXISTS idx_es_enroll ON enrollment_sessions(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_es_session ON enrollment_sessions(session_id);

-- optional staff-curated bundles: a preset group of sessions covering a course's recipe
CREATE TABLE IF NOT EXISTS bundles (
  id        SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort      INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bundle_sessions (
  bundle_id  INTEGER NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (bundle_id, session_id)
);

-- class photos re-pointed to the new sessions
CREATE TABLE IF NOT EXISTS session_media (
  id            SERIAL PRIMARY KEY,
  session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  title         TEXT,
  uploaded_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  uploaded_by_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_session ON session_media(session_id);

-- re-point customer_notes' "related class" link to an enrollment
ALTER TABLE customer_notes DROP COLUMN IF EXISTS session_id;
ALTER TABLE customer_notes ADD COLUMN IF NOT EXISTS enrollment_id INTEGER REFERENCES enrollments(id) ON DELETE SET NULL;
