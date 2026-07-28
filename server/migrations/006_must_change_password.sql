-- 006: force a password change after an admin resets a staff account's password.
-- When an admin resets someone's password, the flag is set; the user is prompted
-- to choose a new one on their next sign-in, and it clears once they do.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
