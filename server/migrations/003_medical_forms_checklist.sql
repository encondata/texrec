-- 003: medical / forms tracking on customers + per-registration verification checklist
-- Medical is verified once on the customer profile; each class registration then
-- carries paid / coursework / welcome-packet checkboxes, and its validation status
-- is derived from those plus the customer's medical standing.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS medical_date DATE;                    -- questionnaire verified on file (valid 1 yr); NULL = not on file
ALTER TABLE customers ADD COLUMN IF NOT EXISTS medical_waiver_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS waiver_date DATE;                     -- physician medical waiver received on file (valid 1 yr)

ALTER TABLE registrations ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS coursework_complete BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS welcome_packet_sent BOOLEAN NOT NULL DEFAULT FALSE;
