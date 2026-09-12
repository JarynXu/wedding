BEGIN;
SELECT pg_advisory_xact_lock(1279440461, 1);
CREATE TABLE IF NOT EXISTS wedding_blessings (
  id BIGSERIAL PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL,
  request_id UUID NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  sender_hash CHAR(64) NOT NULL,
  network_hash CHAR(64) NOT NULL,
  guest_name VARCHAR(96) NOT NULL,
  message TEXT NOT NULL,
  gift_id VARCHAR(32) NOT NULL DEFAULT '',
  sender_theme VARCHAR(16) NOT NULL CHECK (sender_theme IN ('classic', 'chinese')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(room_id, request_id),
  CHECK (char_length(guest_name) BETWEEN 1 AND 24),
  CHECK (char_length(message) <= 120),
  CHECK (message <> '' OR gift_id <> '')
);
ALTER TABLE wedding_blessings ADD COLUMN IF NOT EXISTS gift_count INTEGER NOT NULL DEFAULT 1 CHECK(gift_count BETWEEN 1 AND 999);
CREATE INDEX IF NOT EXISTS wedding_blessings_room_order ON wedding_blessings (room_id, id DESC);
CREATE INDEX IF NOT EXISTS wedding_blessings_sender_time ON wedding_blessings (room_id, sender_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS wedding_blessings_network_time ON wedding_blessings (room_id, network_hash, created_at DESC);
CREATE TABLE IF NOT EXISTS wedding_blessing_writing (
  room_id VARCHAR(64) NOT NULL,
  request_id UUID NOT NULL,
  sender_hash CHAR(64) NOT NULL,
  network_hash CHAR(64) NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  result TEXT,
  state VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','complete','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(room_id,request_id)
);
CREATE INDEX IF NOT EXISTS wedding_writing_rate ON wedding_blessing_writing(room_id,created_at DESC);
COMMIT;
