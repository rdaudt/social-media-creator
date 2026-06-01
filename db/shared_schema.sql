CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  owner_google_sub TEXT NOT NULL,
  title TEXT NOT NULL,
  blob_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_tenants (
  id TEXT PRIMARY KEY,
  owner_google_sub TEXT NOT NULL,
  owner_email TEXT,
  business_name TEXT,
  coach_name TEXT,
  bio TEXT,
  brand_headline TEXT,
  header_tagline TEXT,
  theme_primary_color TEXT,
  theme_secondary_color TEXT,
  ig_username TEXT
);

CREATE TABLE IF NOT EXISTS coach_hiit_classes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  coach_google_sub TEXT,
  timer_name_at_run TEXT,
  timer_snapshot_json TEXT,
  category TEXT,
  ran_at TEXT,
  class_date TEXT,
  start_time TEXT,
  end_time TEXT,
  location_id TEXT,
  station_workout_types_json TEXT,
  location_label_at_run TEXT
);

CREATE TABLE IF NOT EXISTS coach_class_locations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  business_name TEXT,
  location_name TEXT,
  is_default INTEGER,
  sort_order INTEGER
);

CREATE TABLE IF NOT EXISTS model_pricing_rates (
  id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  rate_type TEXT NOT NULL,
  usd_per_million_tokens REAL NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interaction_usage (
  id TEXT PRIMARY KEY,
  owner_google_sub TEXT NOT NULL,
  session_id TEXT NOT NULL,
  request_type TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  text_input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_text_input_tokens INTEGER NOT NULL DEFAULT 0,
  image_input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_image_input_tokens INTEGER NOT NULL DEFAULT 0,
  image_output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL,
  actual_cost_usd REAL NOT NULL DEFAULT 0,
  cost_confidence TEXT NOT NULL DEFAULT 'partial',
  pricing_version TEXT,
  duration_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_hiit_class_media (
  id TEXT PRIMARY KEY,
  coach_google_sub TEXT NOT NULL,
  class_id TEXT NOT NULL,
  blob_url TEXT NOT NULL,
  blob_pathname TEXT NOT NULL,
  source_message_id TEXT,
  is_sharable INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_hiit_class_media_class_blob
  ON coach_hiit_class_media (class_id, blob_url);

CREATE TABLE IF NOT EXISTS spending_caps (
  id TEXT PRIMARY KEY,
  cap_type TEXT NOT NULL UNIQUE,
  cap_usd REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_spending_caps (
  owner_google_sub TEXT PRIMARY KEY,
  cap_usd REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_balance_overrides (
  owner_google_sub TEXT PRIMARY KEY,
  balance_usd REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
