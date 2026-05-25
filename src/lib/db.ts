import { createClient } from "@libsql/client";

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN
});

export async function bootstrapSchema(): Promise<void> {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      owner_google_sub TEXT NOT NULL,
      title TEXT NOT NULL,
      blob_url TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      owner_google_sub TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments_json TEXT,
      generation_metadata_json TEXT,
      parent_message_id TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS interaction_usage (
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
    )`,
    `CREATE TABLE IF NOT EXISTS model_pricing_rates (
      id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      rate_type TEXT NOT NULL,
      usd_per_million_tokens REAL NOT NULL,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS generation_events (
      id TEXT PRIMARY KEY,
      owner_google_sub TEXT NOT NULL,
      session_id TEXT NOT NULL,
      message_id TEXT,
      status TEXT NOT NULL,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      platform TEXT NOT NULL,
      format TEXT NOT NULL,
      template_family_id TEXT,
      template_version INTEGER NOT NULL DEFAULT 1,
      prompt_text TEXT NOT NULL,
      default_options_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by_admin_sub TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS coach_hiit_class_media (
      id TEXT PRIMARY KEY,
      coach_google_sub TEXT NOT NULL,
      class_id TEXT NOT NULL,
      blob_url TEXT NOT NULL,
      blob_pathname TEXT NOT NULL,
      source_message_id TEXT,
      is_sharable INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`
  ], "write");

  await db.execute({
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_hiit_class_media_class_blob
          ON coach_hiit_class_media (class_id, blob_url)`,
    args: []
  });

  await ensurePromptTemplateColumns();
  await ensureInteractionUsageColumns();
  await ensureClassMediaColumns();
  await seedModelPricingRates();
}

async function ensurePromptTemplateColumns(): Promise<void> {
  const cols = await db.execute({ sql: `PRAGMA table_info(prompt_templates)`, args: [] });
  const names = new Set(cols.rows.map((row) => String(row.name)));
  if (!names.has("template_family_id")) {
    await db.execute({ sql: `ALTER TABLE prompt_templates ADD COLUMN template_family_id TEXT`, args: [] });
  }
  if (!names.has("template_version")) {
    await db.execute({ sql: `ALTER TABLE prompt_templates ADD COLUMN template_version INTEGER NOT NULL DEFAULT 1`, args: [] });
  }
}

async function ensureInteractionUsageColumns(): Promise<void> {
  const cols = await db.execute({ sql: `PRAGMA table_info(interaction_usage)`, args: [] });
  const names = new Set(cols.rows.map((row) => String(row.name)));
  const addCol = async (name: string, sqlType: string) => {
    if (!names.has(name)) await db.execute({ sql: `ALTER TABLE interaction_usage ADD COLUMN ${name} ${sqlType}`, args: [] });
  };
  await addCol("text_input_tokens", "INTEGER NOT NULL DEFAULT 0");
  await addCol("cached_text_input_tokens", "INTEGER NOT NULL DEFAULT 0");
  await addCol("image_input_tokens", "INTEGER NOT NULL DEFAULT 0");
  await addCol("cached_image_input_tokens", "INTEGER NOT NULL DEFAULT 0");
  await addCol("image_output_tokens", "INTEGER NOT NULL DEFAULT 0");
  await addCol("actual_cost_usd", "REAL NOT NULL DEFAULT 0");
  await addCol("cost_confidence", "TEXT NOT NULL DEFAULT 'partial'");
  await addCol("pricing_version", "TEXT");
}

async function ensureClassMediaColumns(): Promise<void> {
  const cols = await db.execute({ sql: `PRAGMA table_info(coach_hiit_class_media)`, args: [] });
  const names = new Set(cols.rows.map((row) => String(row.name)));
  if (!names.has("is_sharable")) {
    await db.execute({ sql: `ALTER TABLE coach_hiit_class_media ADD COLUMN is_sharable INTEGER NOT NULL DEFAULT 0`, args: [] });
  }
}

async function seedModelPricingRates(): Promise<void> {
  const count = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM model_pricing_rates WHERE model = 'gpt-image-2' AND is_active = 1`,
    args: []
  });
  if (Number(count.rows[0]?.c ?? 0) > 0) return;
  const now = nowIso();
  const effectiveFrom = "2026-01-01T00:00:00.000Z";
  const rows: Array<[string, string, number]> = [
    ["text_input", 10],
    ["text_cached_input", 2.5],
    ["image_input", 10],
    ["image_cached_input", 2.5],
    ["image_output", 40]
  ].map(([rateType, rate]) => [newId("price"), String(rateType), Number(rate)] as [string, string, number]);

  await db.batch(
    rows.map(([id, rateType, rate]) => ({
      sql: `INSERT INTO model_pricing_rates (id, model, rate_type, usd_per_million_tokens, effective_from, effective_to, is_active, created_at)
            VALUES (?, 'gpt-image-2', ?, ?, ?, NULL, 1, ?)`,
      args: [id, rateType, rate, effectiveFrom, now]
    })),
    "write"
  );
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
