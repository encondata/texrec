-- 004: dated "Sessions" under a class + course completion requirements + attendance
-- Terminology: UI "Class" = table class_sessions (unchanged). UI "Session" (a single
-- dated event: pool night, lake day) = table class_meetings below, to avoid colliding
-- with the existing class_sessions name.

-- how many of each session type a course requires to be complete
-- e.g. Open Water: (pool,1), (open_water,2)
CREATE TABLE IF NOT EXISTS course_requirements (
  id             SERIAL PRIMARY KEY,
  course_id      INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  session_type   TEXT NOT NULL,                 -- academics | pool | open_water | other
  required_count INTEGER NOT NULL DEFAULT 1,
  sort           INTEGER NOT NULL DEFAULT 0,
  UNIQUE (course_id, session_type)
);
CREATE INDEX IF NOT EXISTS idx_reqs_course ON course_requirements(course_id);

-- individual dated events under a class, each with its own roster/capacity
CREATE TABLE IF NOT EXISTS class_meetings (
  id           SERIAL PRIMARY KEY,
  session_id   INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE, -- parent class
  type         TEXT NOT NULL DEFAULT 'other',   -- academics | pool | open_water | other
  title        TEXT,                            -- optional label, e.g. "Lake Day 2"
  meeting_date DATE NOT NULL,
  start_time   TIME,
  location     TEXT,
  capacity     INTEGER NOT NULL DEFAULT 6,
  notes        TEXT,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meetings_session ON class_meetings(session_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON class_meetings(meeting_date);

-- which student (via their class registration) is scheduled for / completed which
-- session. meeting_id may belong to ANOTHER class, enabling makeups across groups.
CREATE TABLE IF NOT EXISTS meeting_attendance (
  id              SERIAL PRIMARY KEY,
  meeting_id      INTEGER NOT NULL REFERENCES class_meetings(id) ON DELETE CASCADE,
  registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | attended | completed | no_show | excused
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, registration_id),
  CONSTRAINT valid_attendance_status CHECK (status IN ('scheduled','attended','completed','no_show','excused'))
);
CREATE INDEX IF NOT EXISTS idx_attendance_meeting ON meeting_attendance(meeting_id);
CREATE INDEX IF NOT EXISTS idx_attendance_reg ON meeting_attendance(registration_id);
