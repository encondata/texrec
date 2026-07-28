-- 008: customers get the same forced-password-change-after-reset behavior as staff.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
