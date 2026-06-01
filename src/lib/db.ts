import { createClient } from "@libsql/client";

const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();

export const db = createClient({
  url: tursoUrl || "file:local.db",
  authToken: tursoUrl ? (tursoToken || undefined) : undefined
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
    `CREATE TABLE IF NOT EXISTS style_presets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      platform TEXT NOT NULL,
      format TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      preset_version INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
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
    )`,
    `CREATE TABLE IF NOT EXISTS spending_caps (
      id TEXT PRIMARY KEY,
      cap_type TEXT NOT NULL UNIQUE,
      cap_usd REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS user_spending_caps (
      owner_google_sub TEXT PRIMARY KEY,
      user_email TEXT,
      cap_usd REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS user_balance_overrides (
      owner_google_sub TEXT PRIMARY KEY,
      user_email TEXT,
      balance_usd REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
  await ensureCoachHiitClassColumns();
  await ensureSpendingOverrideColumns();
  await seedModelPricingRates();
  await seedStylePresets();
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

async function ensureCoachHiitClassColumns(): Promise<void> {
  const tableExists = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'coach_hiit_classes' LIMIT 1`,
    args: []
  });
  if (!tableExists.rows[0]) return;

  const cols = await db.execute({ sql: `PRAGMA table_info(coach_hiit_classes)`, args: [] });
  const names = new Set(cols.rows.map((row) => String(row.name)));
  if (!names.has("start_time")) {
    await db.execute({ sql: `ALTER TABLE coach_hiit_classes ADD COLUMN start_time TEXT`, args: [] });
  }
  if (!names.has("end_time")) {
    await db.execute({ sql: `ALTER TABLE coach_hiit_classes ADD COLUMN end_time TEXT`, args: [] });
  }
  if (!names.has("location_id")) {
    await db.execute({ sql: `ALTER TABLE coach_hiit_classes ADD COLUMN location_id TEXT`, args: [] });
  }
  if (!names.has("station_workout_types_json")) {
    await db.execute({ sql: `ALTER TABLE coach_hiit_classes ADD COLUMN station_workout_types_json TEXT`, args: [] });
  }
}

async function ensureSpendingOverrideColumns(): Promise<void> {
  const capCols = await db.execute({ sql: `PRAGMA table_info(user_spending_caps)`, args: [] });
  const capNames = new Set(capCols.rows.map((row) => String(row.name)));
  if (!capNames.has("user_email")) {
    await db.execute({ sql: `ALTER TABLE user_spending_caps ADD COLUMN user_email TEXT`, args: [] });
  }

  const balanceCols = await db.execute({ sql: `PRAGMA table_info(user_balance_overrides)`, args: [] });
  const balanceNames = new Set(balanceCols.rows.map((row) => String(row.name)));
  if (!balanceNames.has("user_email")) {
    await db.execute({ sql: `ALTER TABLE user_balance_overrides ADD COLUMN user_email TEXT`, args: [] });
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

async function seedStylePresets(): Promise<void> {
  const now = nowIso();
  const presets: Array<{ id: string; title: string; description: string; platform: string; format: string; promptText: string }> = [
    {
      id: "style_gritty_underground_v1",
      title: "Gritty Underground / Industrial",
      description: "Raw, high-contrast training aesthetic with distressed textures.",
      platform: "instagram",
      format: "any",
      promptText: "Use a gritty industrial visual treatment: distressed concrete/asphalt textures, stark contrast, rugged stencil-inspired accents, mostly grayscale palette, and one aggressive accent color such as safety yellow or deep red."
    },
    {
      id: "style_modern_brutalism_v1",
      title: "Modern Brutalism",
      description: "Bold modular blocks and stark contrast for data-forward creative.",
      platform: "instagram",
      format: "any",
      promptText: "Use a modern brutalist treatment: bold oversized typography feel, hard edges, strong borders, modular blocks, and stark high-contrast black/white with a single glaring primary accent (blue or green)."
    },
    {
      id: "style_premium_editorial_v1",
      title: "Premium Editorial / Boutique Studio",
      description: "Luxurious editorial direction with refined spacing and muted tones.",
      platform: "instagram",
      format: "any",
      promptText: "Use a premium editorial treatment: generous negative space, refined grid feel, elegant serif influence paired with clean sans-serif support, muted earth/off-white/charcoal palette, and subtle gold or bronze accents."
    },
    {
      id: "style_cyber_glitch_v1",
      title: "Cyber-Tech / Glitch",
      description: "Futuristic HUD-inspired presentation with controlled glitch accents.",
      platform: "instagram",
      format: "any",
      promptText: "Use a cyber-tech treatment: dark digital interface mood, HUD-inspired accents, subtle glitch motifs only as decoration, monospace data styling cues, and electric green/orange/white highlights."
    },
    {
      id: "style_vhs_raw_v1",
      title: "VHS / Raw Video Capture",
      description: "Analog camcorder-inspired treatment grounded in workout footage.",
      platform: "instagram",
      format: "any",
      promptText: "Use a VHS raw-capture treatment: mild scanlines, faint analog noise, slight desaturation, soft edge blur cues, and subtle recording-era motifs while preserving legibility and professional finish."
    },
    {
      id: "style_clean_dashboard_v1",
      title: "Clean Performance Dashboard",
      description: "Crisp metric-first style optimized for workout data readability.",
      platform: "instagram",
      format: "any",
      promptText: "Use a clean performance-dashboard treatment: crisp lines, clear information blocks, restrained modern typography, minimal decorative effects, and high legibility for metrics and schedule details."
    },
    {
      id: "style_sports_broadcast_v1",
      title: "Bold Sports Broadcast",
      description: "Energetic match-day inspired style for class promo intensity.",
      platform: "instagram",
      format: "any",
      promptText: "Use a bold sports-broadcast treatment: energetic spotlight contrast, strong headline energy, punchy accents, and athletic promo atmosphere while keeping all informational sections clear."
    }
  ];

  await db.batch(
    presets.map((preset) => ({
      sql: `INSERT INTO style_presets (id, title, description, platform, format, prompt_text, preset_version, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              description = excluded.description,
              platform = excluded.platform,
              format = excluded.format,
              prompt_text = excluded.prompt_text,
              preset_version = excluded.preset_version,
              is_active = excluded.is_active,
              updated_at = excluded.updated_at`,
      args: [preset.id, preset.title, preset.description, preset.platform, preset.format, preset.promptText, now, now]
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
