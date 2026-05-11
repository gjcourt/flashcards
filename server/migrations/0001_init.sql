-- Initial schema for the sync service.

CREATE TABLE IF NOT EXISTS card_states (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  fsrs JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_id)
);
CREATE INDEX IF NOT EXISTS card_states_user_updated ON card_states (user_id, updated_at);

CREATE TABLE IF NOT EXISTS collections (
  user_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  PRIMARY KEY (user_id, collection_id)
);
CREATE INDEX IF NOT EXISTS collections_user_updated ON collections (user_id, updated_at);

CREATE TABLE IF NOT EXISTS reviews (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  rated_at TIMESTAMPTZ NOT NULL,
  rating SMALLINT NOT NULL,
  PRIMARY KEY (user_id, card_id, rated_at)
);
CREATE INDEX IF NOT EXISTS reviews_user_rated ON reviews (user_id, rated_at);
