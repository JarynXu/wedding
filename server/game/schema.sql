BEGIN;
SELECT pg_advisory_xact_lock(1279440461, 2);
CREATE TABLE IF NOT EXISTS wedding_games (
  room_id VARCHAR(64) PRIMARY KEY,
  config JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  published BOOLEAN NOT NULL DEFAULT false,
  settled_at TIMESTAMPTZ,
  settled_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE wedding_games ADD COLUMN IF NOT EXISTS settled_by VARCHAR(64);
CREATE TABLE IF NOT EXISTS wedding_game_config_history (
  room_id VARCHAR(64) NOT NULL REFERENCES wedding_games(room_id),
  version INTEGER NOT NULL,
  config JSONB NOT NULL,
  actor VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(room_id,version)
);
CREATE TABLE IF NOT EXISTS wedding_game_participants (
  id UUID PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL REFERENCES wedding_games(room_id),
  phone_hash CHAR(64) NOT NULL,
  phone_cipher TEXT NOT NULL,
  phone_last4 CHAR(4) NOT NULL,
  name VARCHAR(96) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(room_id,phone_hash)
);
CREATE TABLE IF NOT EXISTS wedding_game_otps (
  id UUID PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL REFERENCES wedding_games(room_id),
  phone_hash CHAR(64) NOT NULL,
  network_hash CHAR(64) NOT NULL,
  code_hash CHAR(64),
  state VARCHAR(16) NOT NULL CHECK(state IN ('queued','sent','unknown','failed','used')),
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS wedding_game_otp_limits ON wedding_game_otps(room_id,created_at DESC);
ALTER TABLE wedding_game_otps ALTER COLUMN code_hash DROP NOT NULL;
ALTER TABLE wedding_game_otps ADD COLUMN IF NOT EXISTS provider_biz_id TEXT;
ALTER TABLE wedding_game_otps ADD COLUMN IF NOT EXISTS verify_token UUID;
ALTER TABLE wedding_game_otps ADD COLUMN IF NOT EXISTS verify_until TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS wedding_game_captcha_uses (
  lot_number VARCHAR(128) PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL REFERENCES wedding_games(room_id),
  request_id UUID NOT NULL UNIQUE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS wedding_game_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES wedding_game_participants(id),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS wedding_game_session_expiry ON wedding_game_sessions(expires_at);
CREATE TABLE IF NOT EXISTS wedding_game_answers (
  id BIGSERIAL PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL REFERENCES wedding_games(room_id),
  participant_id UUID NOT NULL REFERENCES wedding_game_participants(id),
  request_id UUID NOT NULL,
  question_id VARCHAR(8) NOT NULL,
  question JSONB NOT NULL,
  instructions TEXT NOT NULL,
  text TEXT NOT NULL CHECK(char_length(text) BETWEEN 1 AND 320),
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','judging','review','correct','incorrect')),
  version INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL DEFAULT '',
  judge_result JSONB,
  review_result JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  UNIQUE(room_id,participant_id,question_id),
  UNIQUE(room_id,request_id)
);
CREATE INDEX IF NOT EXISTS wedding_game_answer_queue ON wedding_game_answers(room_id,status,id);
CREATE TABLE IF NOT EXISTS wedding_game_reviews (
  id BIGSERIAL PRIMARY KEY,
  answer_id BIGINT NOT NULL REFERENCES wedding_game_answers(id),
  version INTEGER NOT NULL,
  actor VARCHAR(64) NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS wedding_game_prizes (
  room_id VARCHAR(64) NOT NULL REFERENCES wedding_games(room_id),
  slot INTEGER NOT NULL CHECK(slot>0),
  participant_id UUID NOT NULL REFERENCES wedding_game_participants(id),
  rank INTEGER NOT NULL,
  name VARCHAR(160) NOT NULL,
  code_hash CHAR(64) NOT NULL UNIQUE,
  code_cipher TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  redeemed_at TIMESTAMPTZ,
  redeemed_by VARCHAR(64),
  redemption_request UUID,
  PRIMARY KEY(room_id,slot),
  UNIQUE(room_id,participant_id)
);
COMMIT;
