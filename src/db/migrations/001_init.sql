-- Receipts schema v1

CREATE TABLE IF NOT EXISTS accounts (
  id               SERIAL PRIMARY KEY,
  x_user_id        TEXT NOT NULL UNIQUE,
  handle           TEXT NOT NULL,
  display_name     TEXT NOT NULL DEFAULT '',
  bio              TEXT NOT NULL DEFAULT '',
  followers        INTEGER NOT NULL DEFAULT 0,
  avatar_url       TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  poll_minutes     INTEGER NOT NULL DEFAULT 5,
  last_tweet_id    TEXT,
  last_polled_at   TIMESTAMPTZ,
  last_profile_at  TIMESTAMPTZ,
  added_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounts_handle_idx ON accounts (lower(handle));

CREATE TABLE IF NOT EXISTS account_snapshots (
  id            SERIAL PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  handle        TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  bio           TEXT NOT NULL,
  followers     INTEGER NOT NULL,
  taken_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS account_snapshots_account_idx ON account_snapshots (account_id, taken_at DESC);

CREATE TABLE IF NOT EXISTS tweets (
  id               TEXT PRIMARY KEY,
  account_id       INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  original_text    TEXT NOT NULL,
  current_text     TEXT NOT NULL,
  posted_at        TIMESTAMPTZ NOT NULL,
  ingested_at      TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'unconfirmed', 'deleted')),
  fail_count       INTEGER NOT NULL DEFAULT 0,
  first_failed_at  TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ,
  edited           BOOLEAN NOT NULL DEFAULT FALSE,
  last_checked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tweets_recheck_idx ON tweets (status, posted_at DESC);
CREATE INDEX IF NOT EXISTS tweets_account_idx ON tweets (account_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS tweet_versions (
  id        SERIAL PRIMARY KEY,
  tweet_id  TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
  text      TEXT NOT NULL,
  seen_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS tweet_versions_tweet_idx ON tweet_versions (tweet_id, seen_at);

CREATE TABLE IF NOT EXISTS calls (
  id            SERIAL PRIMARY KEY,
  tweet_id      TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
  account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  ca            TEXT,
  ticker        TEXT,
  sentiment     TEXT NOT NULL,
  confidence    DOUBLE PRECISION NOT NULL,
  called_at     TIMESTAMPTZ NOT NULL,
  mcap_at_call  DOUBLE PRECISION,
  mcap_1h       DOUBLE PRECISION,
  mcap_24h      DOUBLE PRECISION,
  mcap_7d       DOUBLE PRECISION,
  UNIQUE (tweet_id, ca, ticker)
);
CREATE INDEX IF NOT EXISTS calls_account_idx ON calls (account_id, called_at DESC);
CREATE INDEX IF NOT EXISTS calls_ca_idx ON calls (ca, called_at DESC);

-- Every receipt in the feed is an alert. `payload` is a self-contained snapshot so a receipt renders the
-- same forever, even if the account renames or the tweet disappears.
CREATE TABLE IF NOT EXISTS alerts (
  id          SERIAL PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('call', 'deleted', 'edited', 'coordinated', 'rename', 'display_name', 'bio', 'followers')),
  account_id  INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  tweet_id    TEXT,
  ca          TEXT,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS alerts_feed_idx ON alerts (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS alerts_account_idx ON alerts (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_type_ca_idx ON alerts (type, ca, created_at DESC);

CREATE TABLE IF NOT EXISTS users (
  wallet      TEXT PRIMARY KEY,
  balance     DOUBLE PRECISION,
  checked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce       TEXT PRIMARY KEY,
  wallet      TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS removal_requests (
  id          SERIAL PRIMARY KEY,
  handle      TEXT NOT NULL,
  contact     TEXT NOT NULL DEFAULT '',
  reason      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'removed', 'dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL
);

-- Worker heartbeat + job state (rate-limit pauses, last run times).
CREATE TABLE IF NOT EXISTS worker_state (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
