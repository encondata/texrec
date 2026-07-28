-- 007: self-service "forgot password" requests. A user (staff account or customer)
-- asks from the login form; an admin sees it in the inbox and one-click resets the
-- account to a random temporary password shown on screen to pass along.
CREATE TABLE IF NOT EXISTS password_resets (
  id           SERIAL PRIMARY KEY,
  kind         TEXT NOT NULL,                 -- 'admin' (staff account) | 'customer'
  account_id   INTEGER NOT NULL,              -- admin_users.id or customers.id, per kind
  email        TEXT NOT NULL,
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',  -- open | done
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by  INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  CONSTRAINT valid_pr_kind CHECK (kind IN ('admin','customer')),
  CONSTRAINT valid_pr_status CHECK (status IN ('open','done'))
);
CREATE INDEX IF NOT EXISTS idx_password_resets_open ON password_resets(requested_at) WHERE status = 'open';
