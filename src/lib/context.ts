import { db } from "@/lib/db";
import type { ChatBootstrapResponse, CoachHiitClass, CoachLocation, CoachProfile } from "@/types";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function asStringOrNull(v: unknown): string | null {
  return v == null ? null : String(v);
}

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function getCoachBootstrap(ownerEmail: string, ownerSub: string): Promise<ChatBootstrapResponse> {
  const normalizedEmail = ownerEmail.trim().toLowerCase();
  const tenant = await db.execute({
    sql: `SELECT id, business_name, coach_name, bio, brand_headline, header_tagline, theme_primary_color, theme_secondary_color, ig_username
          FROM coach_tenants
          WHERE lower(owner_email) = ? LIMIT 1`,
    args: [normalizedEmail]
  });
  const tenantId = asStringOrNull(tenant.rows[0]?.id);
  const coach: CoachProfile | null = tenant.rows[0] ? {
    id: String(tenant.rows[0].id),
    businessName: asStringOrNull(tenant.rows[0].business_name),
    coachName: asStringOrNull(tenant.rows[0].coach_name),
    bio: asStringOrNull(tenant.rows[0].bio),
    brandHeadline: asStringOrNull(tenant.rows[0].brand_headline),
    headerTagline: asStringOrNull(tenant.rows[0].header_tagline),
    themePrimaryColor: asStringOrNull(tenant.rows[0].theme_primary_color),
    themeSecondaryColor: asStringOrNull(tenant.rows[0].theme_secondary_color),
    igUsername: asStringOrNull(tenant.rows[0].ig_username)
  } : null;

  const locationsRes = await db.execute({
    sql: `SELECT l.id, l.business_name, l.location_name, l.is_default, l.sort_order,
            (
              SELECT a.blob_url
              FROM assets a
              WHERE a.owner_google_sub = ? AND a.title = l.business_name
              ORDER BY a.created_at DESC
              LIMIT 1
            ) AS logo_url
          FROM coach_class_locations l
          WHERE l.tenant_id = ?
          ORDER BY l.is_default DESC, l.sort_order ASC`,
    args: [ownerSub, tenantId]
  });
  const locations: CoachLocation[] = locationsRes.rows.map((r) => ({
    id: String(r.id),
    businessName: asStringOrNull(r.business_name),
    locationName: asStringOrNull(r.location_name),
    logoUrl: asStringOrNull(r.logo_url),
    isDefault: asNumber(r.is_default) === 1,
    sortOrder: asNumber(r.sort_order)
  }));

  const classesRes = await db.execute({
    sql: `SELECT id, timer_name_at_run, category, class_date, location_label_at_run, timer_snapshot_json, ran_at
          FROM coach_hiit_classes
          WHERE coach_google_sub = ?
             OR tenant_id = ?
          ORDER BY ran_at DESC LIMIT 100`,
    args: [ownerSub, tenantId]
  });
  const classes: CoachHiitClass[] = classesRes.rows.map((r) => ({
    id: String(r.id),
    timerNameAtRun: asStringOrNull(r.timer_name_at_run),
    category: asStringOrNull(r.category),
    classDate: asStringOrNull(r.class_date),
    locationLabelAtRun: asStringOrNull(r.location_label_at_run),
    timerSnapshotJson: asStringOrNull(r.timer_snapshot_json),
    ranAt: asStringOrNull(r.ran_at)
  }));

  const assetsRes = await db.execute({
    sql: `SELECT id, title, blob_url, created_at
          FROM assets WHERE owner_google_sub = ?
          ORDER BY created_at DESC LIMIT 200`,
    args: [ownerSub]
  });
  const templatesRes = await db.execute({
    sql: `SELECT id, title, platform, format, prompt_text, default_options_json
          FROM prompt_templates
          WHERE is_active = 1
          ORDER BY updated_at DESC`,
    args: []
  });
  const sessionsRes = await db.execute({
    sql: `SELECT id, title, created_at, updated_at
          FROM chat_sessions
          WHERE owner_google_sub = ?
          ORDER BY updated_at DESC LIMIT 100`,
    args: [ownerSub]
  });

  return {
    coach,
    locations,
    classes,
    assets: assetsRes.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      blobUrl: String(r.blob_url),
      createdAt: String(r.created_at)
    })),
    templates: templatesRes.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      platform: String(r.platform),
      format: String(r.format),
      promptText: String(r.prompt_text),
      defaultOptionsJson: asStringOrNull(r.default_options_json)
    })),
    sessions: sessionsRes.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at)
    })),
    defaults: {
      selectedLocationId: locations[0]?.id,
      selectedClassId: classes[0]?.id
    }
  };
}

export async function getCoachContext(ownerEmail: string, ownerSub: string, selectedLocationId?: string, selectedClassId?: string): Promise<string> {
  const bootstrap = await getCoachBootstrap(ownerEmail, ownerSub);
  const t = bootstrap.coach;
  const l = (selectedLocationId
    ? bootstrap.locations.find((row) => row.id === selectedLocationId)
    : undefined) ?? bootstrap.locations[0];
  const c = (selectedClassId
    ? bootstrap.classes.find((row) => row.id === selectedClassId)
    : undefined) ?? bootstrap.classes[0];

  const chunks = [
    "Coach brand context:",
    t ? `Business: ${t.businessName}; Coach: ${t.coachName}; Bio: ${t.bio}; Headline: ${t.brandHeadline}; Tagline: ${t.headerTagline}; Colors: ${t.themePrimaryColor}, ${t.themeSecondaryColor}; Instagram: ${t.igUsername}` : "No brand profile found.",
    "Recent class context:",
    c ? `Class: ${c.timerNameAtRun}; Category: ${c.category}; Date: ${c.classDate}; Location: ${c.locationLabelAtRun}; Snapshot: ${c.timerSnapshotJson}` : "No recent class found.",
    "Location context:",
    l ? `Business location: ${l.businessName}; Place: ${l.locationName}` : "No location found."
  ];

  return chunks.join("\n");
}
