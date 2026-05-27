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

function pickAssetUrlByTitle(assets: Array<{ title: string; blob_url: string }>, patterns: string[]): string | null {
  const lowerPatterns = patterns.map((p) => p.toLowerCase()).filter(Boolean);
  for (const asset of assets) {
    const title = asset.title.toLowerCase();
    if (lowerPatterns.some((p) => title.includes(p))) {
      return asset.blob_url;
    }
  }
  return null;
}

type HiitSnapshot = {
  stationCount?: number;
  stationWorkoutTypes?: string[];
  roundsPerStation?: number;
  workMinutes?: number;
  workSeconds?: number;
  restMinutes?: number;
  restSeconds?: number;
  stationTransitionMinutes?: number;
  stationTransitionSeconds?: number;
  warmupEnabled?: boolean;
  warmupMinutes?: number;
  warmupSeconds?: number;
  cooldownEnabled?: boolean;
  cooldownMinutes?: number;
  cooldownSeconds?: number;
  name?: string;
};

function toSeconds(minutes?: number, seconds?: number): number {
  return Math.max(0, Number(minutes ?? 0)) * 60 + Math.max(0, Number(seconds ?? 0));
}

function asMmSs(totalSeconds: number): string {
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function parseHiitSnapshot(raw: string | null): HiitSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HiitSnapshot;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function buildHiitBlock(c?: CoachHiitClass): string {
  if (!c) return "No recent class found.";
  const snapshot = parseHiitSnapshot(c.timerSnapshotJson);
  if (!snapshot) {
    return `Class name: ${c.timerNameAtRun ?? "N/A"}; Category: ${c.category ?? "N/A"}; Date: ${c.classDate ?? "N/A"}; Location: ${c.locationLabelAtRun ?? "N/A"}; Snapshot unavailable.`;
  }

  const stationCount = Number(snapshot.stationCount ?? 0);
  const roundsPerStation = Number(snapshot.roundsPerStation ?? 0);
  const workSec = toSeconds(snapshot.workMinutes, snapshot.workSeconds);
  const restSec = toSeconds(snapshot.restMinutes, snapshot.restSeconds);
  const transitionSec = toSeconds(snapshot.stationTransitionMinutes, snapshot.stationTransitionSeconds);
  const warmupSec = snapshot.warmupEnabled ? toSeconds(snapshot.warmupMinutes, snapshot.warmupSeconds) : 0;
  const cooldownSec = snapshot.cooldownEnabled ? toSeconds(snapshot.cooldownMinutes, snapshot.cooldownSeconds) : 0;
  const intervalsPerStation = Math.max(0, roundsPerStation);
  const stationRunSec = intervalsPerStation * (workSec + restSec);
  const totalWorkSec = stationCount * intervalsPerStation * workSec;
  const classCoreSec = stationCount * stationRunSec + Math.max(0, stationCount - 1) * transitionSec;
  const totalRunSec = warmupSec + classCoreSec + cooldownSec;

  return [
    `Class name: ${c.timerNameAtRun ?? snapshot.name ?? "N/A"}`,
    `Category: ${c.category ?? "N/A"}`,
    `Date: ${c.classDate ?? "N/A"}`,
    `Location: ${c.locationLabelAtRun ?? "N/A"}`,
    `Total run time: ${asMmSs(totalRunSec)} (${totalRunSec}s)`,
    `Number of stations: ${stationCount}`,
    `Rounds per station: ${roundsPerStation}`,
    `Warmup time: ${asMmSs(warmupSec)} (${warmupSec}s)`,
    `Cooldown time: ${asMmSs(cooldownSec)} (${cooldownSec}s)`,
    `Work interval: ${asMmSs(workSec)} (${workSec}s)`,
    `Rest interval: ${asMmSs(restSec)} (${restSec}s)`,
    `Station transition: ${asMmSs(transitionSec)} (${transitionSec}s)`,
    `Workout type in each station: ${(snapshot.stationWorkoutTypes ?? []).join(", ") || "N/A"}`,
    `Total work time only: ${asMmSs(totalWorkSec)} (${totalWorkSec}s)`
  ].join("; ");
}

export async function getCoachBootstrap(ownerEmail: string, ownerSub: string): Promise<ChatBootstrapResponse> {
  const normalizedEmail = ownerEmail.trim().toLowerCase();
  const tenant = await db.execute({
    sql: `SELECT id, business_name, coach_name, logo_url, coach_photo_url, bio, brand_headline, header_tagline, theme_primary_color, theme_secondary_color, ig_username
          FROM coach_tenants
          WHERE lower(owner_email) = ? LIMIT 1`,
    args: [normalizedEmail]
  });
  const tenantId = asStringOrNull(tenant.rows[0]?.id);
  const coachBusinessName = asStringOrNull(tenant.rows[0]?.business_name);
  const coachName = asStringOrNull(tenant.rows[0]?.coach_name);

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
    sql: `SELECT id, timer_name_at_run, category, class_date, start_time, end_time, location_id, location_label_at_run, timer_snapshot_json, ran_at
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
    startTime: asStringOrNull(r.start_time),
    endTime: asStringOrNull(r.end_time),
    locationId: asStringOrNull(r.location_id),
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
    sql: `SELECT id, title, platform, format, template_family_id, template_version, prompt_text, default_options_json
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
  const assetRows = assetsRes.rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    blob_url: String(r.blob_url),
    created_at: String(r.created_at)
  }));
  const tenantBusinessLogoUrl = asStringOrNull(tenant.rows[0]?.logo_url);
  const tenantCoachPhotoUrl = asStringOrNull(tenant.rows[0]?.coach_photo_url);
  const businessLogoFromLocation = locations.find((loc) => Boolean(loc.logoUrl))?.logoUrl ?? null;
  const businessLogoFromAssets = pickAssetUrlByTitle(assetRows, [coachBusinessName ?? "", "business logo", "logo"]);
  const coachPhotoFromAssets = pickAssetUrlByTitle(assetRows, [coachName ?? "", "coach photo", "profile", "headshot"]);
  const coach: CoachProfile | null = tenant.rows[0] ? {
    id: String(tenant.rows[0].id),
    businessName: coachBusinessName,
    coachName,
    coachPhotoUrl: tenantCoachPhotoUrl ?? coachPhotoFromAssets,
    businessLogoUrl: tenantBusinessLogoUrl ?? businessLogoFromLocation ?? businessLogoFromAssets,
    bio: asStringOrNull(tenant.rows[0].bio),
    brandHeadline: asStringOrNull(tenant.rows[0].brand_headline),
    headerTagline: asStringOrNull(tenant.rows[0].header_tagline),
    themePrimaryColor: asStringOrNull(tenant.rows[0].theme_primary_color),
    themeSecondaryColor: asStringOrNull(tenant.rows[0].theme_secondary_color),
    igUsername: asStringOrNull(tenant.rows[0].ig_username)
  } : null;

  return {
    coach,
    locations,
    classes,
    assets: assetRows.map((r) => ({
      id: r.id,
      title: r.title,
      blobUrl: r.blob_url,
      createdAt: r.created_at
    })),
    templates: templatesRes.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      platform: String(r.platform),
      format: String(r.format),
      templateFamilyId: asStringOrNull(r.template_family_id),
      templateVersion: asNumber(r.template_version, 1),
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
    "HIIT class context:",
    buildHiitBlock(c),
    "Raw class snapshot:",
    c?.timerSnapshotJson ?? "No snapshot found.",
    "Location context:",
    l ? `Business location: ${l.businessName}; Place: ${l.locationName}` : "No location found."
  ];

  return chunks.join("\n");
}
