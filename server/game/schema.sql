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
ALTER TABLE wedding_game_answers ADD COLUMN IF NOT EXISTS processing_stage VARCHAR(16);
ALTER TABLE wedding_game_answers ADD COLUMN IF NOT EXISTS host_result JSONB;
CREATE TABLE IF NOT EXISTS wedding_game_question_voice (
  room_id VARCHAR(64) NOT NULL REFERENCES wedding_games(room_id),
  config_version INTEGER NOT NULL,
  question_id VARCHAR(8) NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  result JSONB,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  PRIMARY KEY(room_id,config_version,question_id)
);
ALTER TABLE wedding_game_question_voice ADD COLUMN IF NOT EXISTS deck JSONB;
CREATE TABLE IF NOT EXISTS wedding_game_conversations (
  participant_id UUID PRIMARY KEY REFERENCES wedding_game_participants(id),
  room_id VARCHAR(64) NOT NULL REFERENCES wedding_games(room_id),
  active_question VARCHAR(8),
  revision INTEGER NOT NULL DEFAULT 0,
  offered_choices JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE wedding_game_conversations ADD COLUMN IF NOT EXISTS active_config_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS wedding_game_chat_turns (
  id BIGSERIAL PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL REFERENCES wedding_games(room_id),
  participant_id UUID NOT NULL REFERENCES wedding_game_participants(id),
  request_id UUID NOT NULL,
  kind VARCHAR(12) NOT NULL CHECK(kind IN ('start','message','nudge')),
  input TEXT NOT NULL DEFAULT '',
  question_id VARCHAR(8),
  config_version INTEGER NOT NULL,
  state VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','complete')),
  progress VARCHAR(16),
  reply JSONB,
  audit JSONB,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ,
  UNIQUE(room_id,participant_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS wedding_game_chat_start ON wedding_game_chat_turns(participant_id) WHERE kind='start';
CREATE UNIQUE INDEX IF NOT EXISTS wedding_game_chat_nudge ON wedding_game_chat_turns(participant_id,question_id) WHERE kind='nudge';
CREATE INDEX IF NOT EXISTS wedding_game_chat_work ON wedding_game_chat_turns(room_id,state,id);
ALTER TABLE wedding_game_chat_turns ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wedding_game_chat_turns ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE wedding_game_chat_turns ADD COLUMN IF NOT EXISTS trace_id VARCHAR(32);
ALTER TABLE wedding_game_chat_turns ADD COLUMN IF NOT EXISTS parent_span_id VARCHAR(16);
ALTER TABLE wedding_game_chat_turns ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();
ALTER TABLE wedding_game_answers ADD COLUMN IF NOT EXISTS trace_id VARCHAR(32);
ALTER TABLE wedding_game_answers ADD COLUMN IF NOT EXISTS parent_span_id VARCHAR(16);
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
CREATE TABLE IF NOT EXISTS wedding_game_knowledge (
  room_id VARCHAR(64) PRIMARY KEY REFERENCES wedding_games(room_id),
  version INTEGER NOT NULL DEFAULT 1,
  config JSONB NOT NULL,
  updated_by VARCHAR(64) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
COMMIT;
