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
      estimated_cost REAL NOT NULL,
      duration_ms INTEGER NOT NULL,
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
    )`
  ], "write");

  await ensurePromptTemplateColumns();
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

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
