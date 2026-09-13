CREATE TABLE IF NOT EXISTS wedding_ai_controls (
  scope VARCHAR(120) PRIMARY KEY,
  blocked_until TIMESTAMPTZ NOT NULL DEFAULT '-infinity'
);
CREATE TABLE IF NOT EXISTS wedding_ai_leases (
  id UUID PRIMARY KEY,
  scope VARCHAR(120) NOT NULL,
  trace_id VARCHAR(32),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS wedding_ai_lease_scope ON wedding_ai_leases(scope,expires_at);
CREATE TABLE IF NOT EXISTS wedding_room_operations (
  room_id VARCHAR(64) PRIMARY KEY,
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  generation INTEGER NOT NULL DEFAULT 0,
  resume_published BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS wedding_operation_audit (
  id BIGSERIAL PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL,
  actor VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  trace_id VARCHAR(32),
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE wedding_operation_audit ADD COLUMN IF NOT EXISTS request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS wedding_operation_request ON wedding_operation_audit(room_id,request_id) WHERE request_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS wedding_admin_attempts (
  account_hash VARCHAR(64) NOT NULL,
  network_hash VARCHAR(64) NOT NULL,
  count INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(account_hash,network_hash)
);
CREATE TABLE IF NOT EXISTS wedding_admin_revocations (
  token_hash VARCHAR(64) PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS wedding_admin_attempt_expiry ON wedding_admin_attempts(expires_at);
CREATE INDEX IF NOT EXISTS wedding_admin_revocation_expiry ON wedding_admin_revocations(expires_at);
