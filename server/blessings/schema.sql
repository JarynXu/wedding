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
CREATE INDEX IF NOT EXISTS wedding_blessings_room_order ON wedding_blessings (room_id, id DESC);
CREATE INDEX IF NOT EXISTS wedding_blessings_sender_time ON wedding_blessings (room_id, sender_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS wedding_blessings_network_time ON wedding_blessings (room_id, network_hash, created_at DESC);
COMMIT;
