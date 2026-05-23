import { db } from "@/lib/db";

export async function getCoachContext(ownerEmail: string, ownerSub: string): Promise<string> {
  const normalizedEmail = ownerEmail.trim().toLowerCase();
  const tenant = await db.execute({
    sql: `SELECT business_name, coach_name, bio, brand_headline, header_tagline, theme_primary_color, theme_secondary_color, ig_username
          FROM coach_tenants
          WHERE lower(owner_email) = ? LIMIT 1`,
    args: [normalizedEmail]
  });

  const classRow = await db.execute({
    sql: `SELECT timer_name_at_run, category, class_date, location_label_at_run, timer_snapshot_json
          FROM coach_hiit_classes
          WHERE coach_google_sub = ?
          ORDER BY ran_at DESC LIMIT 1`,
    args: [ownerSub]
  });

  const loc = await db.execute({
    sql: `SELECT business_name, location_name
          FROM coach_class_locations
          WHERE tenant_id = (SELECT id FROM coach_tenants WHERE lower(owner_email) = ? LIMIT 1)
          ORDER BY is_default DESC, sort_order ASC LIMIT 1`,
    args: [normalizedEmail]
  });

  const t = tenant.rows[0];
  const c = classRow.rows[0];
  const l = loc.rows[0];

  const chunks = [
    "Coach brand context:",
    t ? `Business: ${t.business_name}; Coach: ${t.coach_name}; Bio: ${t.bio}; Headline: ${t.brand_headline}; Tagline: ${t.header_tagline}; Colors: ${t.theme_primary_color}, ${t.theme_secondary_color}; Instagram: ${t.ig_username}` : "No brand profile found.",
    "Recent class context:",
    c ? `Class: ${c.timer_name_at_run}; Category: ${c.category}; Date: ${c.class_date}; Location: ${c.location_label_at_run}; Snapshot: ${c.timer_snapshot_json}` : "No recent class found.",
    "Location context:",
    l ? `Business location: ${l.business_name}; Place: ${l.location_name}` : "No location found."
  ];

  return chunks.join("\n");
}
