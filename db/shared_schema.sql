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
