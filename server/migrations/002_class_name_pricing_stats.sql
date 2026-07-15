-- Optional custom class name, "call for pricing" flags, and editable home stats.

ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS call_for_price BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE trips   ADD COLUMN IF NOT EXISTS call_for_price BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS home_stats (
  id     SERIAL PRIMARY KEY,
  num    TEXT NOT NULL,
  suffix TEXT NOT NULL DEFAULT '',
  label  TEXT NOT NULL,
  sort   INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- seed defaults only if the table is empty (preserves any already-edited stats)
INSERT INTO home_stats (num, suffix, label, sort)
SELECT * FROM (VALUES
  ('5,000', '+', 'Divers Certified', 10),
  ('17', '', 'Years in DFW', 20),
  ('6', '', 'Students Max per Class', 30),
  ('12', '+', 'Trips per Year', 40)
) v(num, suffix, label, sort)
WHERE NOT EXISTS (SELECT 1 FROM home_stats);
