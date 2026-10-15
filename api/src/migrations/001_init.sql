-- TexRec initial schema. Applied once by src/db.js on API start.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text,
  role          text NOT NULL CHECK (role IN ('admin','staff','student')),
  first_name    text NOT NULL DEFAULT '',
  last_name     text NOT NULL DEFAULT '',
  phone         text,
  avatar_key    text,
  dob           date,
  emergency_contact text,
  must_change_password boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_idx ON users (lower(email));

-- public-facing instructor/staff bio; only exists for staff/admin users who appear on the site
CREATE TABLE staff_profiles (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  title          text NOT NULL DEFAULT '',
  bio            text NOT NULL DEFAULT '',
  certifications text[] NOT NULL DEFAULT '{}',
  agencies       text[] NOT NULL DEFAULT '{}',
  photo_key      text,
  public         boolean NOT NULL DEFAULT true,
  sort           int NOT NULL DEFAULT 100
);

CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE password_resets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

CREATE TABLE agencies (
  id       serial PRIMARY KEY,
  code     text NOT NULL UNIQUE,
  name     text NOT NULL,
  logo_key text,
  sort     int NOT NULL DEFAULT 100
);
INSERT INTO agencies (code, name, sort) VALUES
  ('SDI', 'Scuba Diving International', 1),
  ('TDI', 'Technical Diving International', 2),
  ('RAID', 'RAID', 3);

CREATE TABLE courses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL,
  agency_id     int REFERENCES agencies(id) ON DELETE SET NULL,
  category      text NOT NULL DEFAULT 'recreational'
                CHECK (category IN ('recreational','technical','specialty','professional')),
  level         text NOT NULL DEFAULT 'beginner'
                CHECK (level IN ('beginner','intermediate','advanced','technical','professional')),
  price_cents   int NOT NULL DEFAULT 0,
  duration      text NOT NULL DEFAULT '',
  summary       text NOT NULL DEFAULT '',
  description   text NOT NULL DEFAULT '',   -- markdown
  prerequisites text NOT NULL DEFAULT '',   -- markdown
  outcomes      text NOT NULL DEFAULT '',   -- markdown
  faq           jsonb NOT NULL DEFAULT '[]',-- [{q, a}]
  image_key     text,
  featured      boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  sort          int NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dive_sites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  location    text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  difficulty  text NOT NULL DEFAULT 'all'
              CHECK (difficulty IN ('all','beginner','intermediate','advanced','technical')),
  lat         double precision,
  lng         double precision,
  image_key   text,
  active      boolean NOT NULL DEFAULT true,
  sort        int NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- anything on the calendar: a class session, a trip, a training dive, a pool session
CREATE TABLE events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type           text NOT NULL DEFAULT 'class'
                 CHECK (type IN ('class','dive_trip','training_dive','pool_session','other')),
  course_id      uuid REFERENCES courses(id) ON DELETE SET NULL,
  dive_site_id   uuid REFERENCES dive_sites(id) ON DELETE SET NULL,
  title          text NOT NULL,
  description    text NOT NULL DEFAULT '',
  location       text NOT NULL DEFAULT '',
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  capacity       int NOT NULL DEFAULT 6 CHECK (capacity >= 0),
  price_cents    int,                        -- NULL = use course price
  published      boolean NOT NULL DEFAULT true,
  allow_waitlist boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_starts_idx ON events (starts_at);

CREATE TABLE event_instructors (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE enrollments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'reserved'
                  CHECK (status IN ('reserved','waitlisted','cancelled','completed','no_show')),
  amount_cents    int NOT NULL DEFAULT 0,     -- price at time of enrollment
  paid_at         timestamptz,
  paid_cents      int NOT NULL DEFAULT 0,
  stripe_checkout_id     text,
  stripe_payment_intent  text,
  notes           text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);
CREATE INDEX enrollments_user_idx ON enrollments (user_id);

CREATE TABLE certifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  agency_id   int REFERENCES agencies(id) ON DELETE SET NULL,
  course_id   uuid REFERENCES courses(id) ON DELETE SET NULL,
  cert_number text,
  issued_on   date,
  status      text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','issued')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX certifications_user_idx ON certifications (user_id);

CREATE TABLE dive_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dove_on      date NOT NULL,
  site         text NOT NULL DEFAULT '',
  max_depth_ft numeric(5,1),
  duration_min int,
  notes        text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dive_logs_user_idx ON dive_logs (user_id, dove_on DESC);

-- waivers, medical forms, cert cards; private to the student + staff
CREATE TABLE documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         text NOT NULL,
  name        text NOT NULL,
  mime        text NOT NULL,
  size        int NOT NULL DEFAULT 0,
  kind        text NOT NULL DEFAULT 'other' CHECK (kind IN ('waiver','medical','certification','other')),
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_user_idx ON documents (user_id);

CREATE TABLE posts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  title        text NOT NULL,
  category     text NOT NULL DEFAULT 'news'
               CHECK (category IN ('news','training_tips','trip_reports','equipment','videos')),
  excerpt      text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',   -- markdown
  cover_key    text,
  author_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz,                -- NULL = draft
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_published_idx ON posts (published_at DESC);

-- photo gallery
CREATE TABLE media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL,
  mime        text NOT NULL,
  width       int,
  height      int,
  size        int NOT NULL DEFAULT 0,
  title       text NOT NULL DEFAULT '',
  caption     text NOT NULL DEFAULT '',
  album       text NOT NULL DEFAULT 'classes'
              CHECK (album IN ('classes','dive_sites','travel','videos','other')),
  video_url   text,                        -- for album = videos: YouTube/Vimeo link
  sort        int NOT NULL DEFAULT 100,
  public      boolean NOT NULL DEFAULT true,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- every editable blurb/image on the public site, keyed by location (e.g. home.hero.title)
CREATE TABLE content_blocks (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- operational settings (email provider, stripe, ...). Secret values are encrypted by the API.
CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
