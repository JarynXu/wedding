CREATE TABLE IF NOT EXISTS wedding_visitors (
  room_id text NOT NULL,
  visitor_hash text NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (room_id, visitor_hash)
);

CREATE TABLE IF NOT EXISTS wedding_visits (
  room_id text NOT NULL,
  visit_id uuid NOT NULL,
  visitor_hash text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen timestamptz NOT NULL DEFAULT clock_timestamp(),
  browser text NOT NULL CHECK (browser IN ('wechat', 'safari', 'chrome', 'edge', 'firefox', 'other')),
  device text NOT NULL CHECK (device IN ('ios', 'android', 'desktop', 'other')),
  theme text NOT NULL CHECK (theme IN ('classic', 'chinese')),
  PRIMARY KEY (room_id, visit_id),
  FOREIGN KEY (room_id, visitor_hash) REFERENCES wedding_visitors (room_id, visitor_hash)
);

CREATE INDEX IF NOT EXISTS wedding_visits_started ON wedding_visits (room_id, started_at);
CREATE INDEX IF NOT EXISTS wedding_visits_visitor ON wedding_visits (room_id, visitor_hash, started_at);
CREATE INDEX IF NOT EXISTS wedding_visitors_active ON wedding_visitors (room_id, last_seen);
