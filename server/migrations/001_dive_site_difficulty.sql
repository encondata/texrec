-- Add a difficulty rating to dive sites: beginner | advanced | technical (nullable).
ALTER TABLE dive_sites ADD COLUMN IF NOT EXISTS difficulty TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dive_sites_difficulty_chk') THEN
    ALTER TABLE dive_sites
      ADD CONSTRAINT dive_sites_difficulty_chk
      CHECK (difficulty IN ('beginner','advanced','technical'));
  END IF;
END $$;
