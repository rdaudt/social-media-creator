import { NextResponse } from "next/server";
import { requireCoachSessionUser } from "@/lib/auth";
import { createSignedBlobAccessUrl, putTempBlob } from "@/lib/blob";
import { getCoachBootstrap } from "@/lib/context";
import { bootstrapSchema, db, newId } from "@/lib/db";
import { authErrorResponse } from "@/lib/http";
import { generateImageWithContext } from "@/lib/openai";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateSchema } from "@/lib/validation";
import type { ChatBootstrapResponse, CoachHiitClass, CoachLocation, GenerateResponse } from "@/types";

type StagedImageRole = "coach_photo_url" | "business_logo_url" | "location_logo_url" | "user_uploaded_image" | "selected_asset" | "attendee_photo_url";
type StagedImageReference = {
  role: StagedImageRole;
  url: string;
  blobUrl: string;
  pathname?: string;
  source: "coach_profile" | "location" | "upload" | "asset";
  expiresAt: string;
};

type GenerationContextJson = {
  platform: string;
  options: Record<string, unknown>;
  outputSpec: ReturnType<typeof resolveOutputSpec>;
  coach: ChatBootstrapResponse["coach"];
  selectedHiitClass: CoachHiitClass;
  selectedLocation: CoachLocation | null;
  imageReferences: {
    coach_photo_url: string | null;
    coach_image_url: string | null;
    business_logo_url: string | null;
    location_logo_url: string | null;
    attendee_name: string | null;
    attendee_image_url: string | null;
    attendee_photo_url: string | null;
    user_uploaded_images: string[];
    selected_asset_urls: string[];
  };
};

const UPLOAD_ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png"]);
const WORKOUT_WARRIOR_TEMPLATE_TITLES = new Set([
  "ig hiit workout warrior",
  "ig hiit workout warrior collective"
]);

export async function POST(req: Request) {
  let ownerSub = "";
  let sessionId = "";
  let userMessageId = "";
  const reqId = newId("req");

  try {
    console.info(`[chat.generate][${reqId}] start`);
    await bootstrapSchema();
    const user = await requireCoachSessionUser();
    ownerSub = user.sub;
    console.info(`[chat.generate][${reqId}] auth_ok user=${user.sub}`);

    if ((req.headers.get("content-type") ?? "").toLowerCase().includes("multipart/form-data")) {
      const rate = checkRateLimit(`upload:${user.sub}`, 20, 60_000);
      if (!rate.ok) return NextResponse.json({ error: "rate_limited", retryAfter: rate.retryAfter }, { status: 429 });
      return handleTempUpload(req, user.sub);
    }

    const rate = checkRateLimit(`gen:${user.sub}`, 8, 60_000);
    if (!rate.ok) return NextResponse.json({ error: "rate_limited", retryAfter: rate.retryAfter }, { status: 429 });

    const parsed = generateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });
    const body = parsed.data;
    const mode = body.mode ?? "generate";
    sessionId = body.sessionId;
    const publicOrigin = getPublicOrigin(req);
    console.info(`[chat.generate][${reqId}] payload_ok session=${body.sessionId} template=${body.promptTemplateId ?? "none"} assets=${body.selectedAssetIds.length} tempRefs=${body.tempUploadRefs.length}`);

    const session = await db.execute({
      sql: `SELECT id FROM chat_sessions WHERE id = ? AND owner_google_sub = ? LIMIT 1`,
      args: [body.sessionId, user.sub]
    });
    if (!session.rows[0]) return NextResponse.json({ error: "session_not_found" }, { status: 404 });

    let templateMeta: { id: string; platform: string; format: string; templateFamilyId: string | null; templateVersion: number } | null = null;
    let templateTitle = "";
    if (body.promptTemplateId) {
      const tpl = await db.execute({
        sql: `SELECT id, title, platform, format, template_family_id, template_version, prompt_text
              FROM prompt_templates WHERE id = ? AND is_active = 1 LIMIT 1`,
        args: [body.promptTemplateId]
      });
      templateMeta = tpl.rows[0] ? {
        id: String(tpl.rows[0].id),
        platform: String(tpl.rows[0].platform),
        format: String(tpl.rows[0].format),
        templateFamilyId: tpl.rows[0].template_family_id == null ? null : String(tpl.rows[0].template_family_id),
        templateVersion: Number(tpl.rows[0].template_version ?? 1)
      } : null;
      templateTitle = String(tpl.rows[0]?.title ?? "");
      const templatePrompt = String(tpl.rows[0]?.prompt_text ?? "");
      if (!templatePrompt) {
        return NextResponse.json({ error: "template_not_found" }, { status: 404 });
      }
    }

    const isWorkoutWarriorTemplate = WORKOUT_WARRIOR_TEMPLATE_TITLES.has(templateTitle.trim().toLowerCase());
    const effectiveAttendeeImageRef = body.attendeeImageRef || body.tempUploadRefs[body.tempUploadRefs.length - 1] || "";
    if (isWorkoutWarriorTemplate) {
      if (!body.attendeeName) {
        return validationError("attendee_name_required", "Provide the attendee name for the IG HIIT Workout Warrior template.");
      }
      if (!effectiveAttendeeImageRef) {
        return validationError("attendee_image_required", "Upload the attendee or group image for the IG HIIT Workout Warrior template.");
      }
    }

    if (body.platform !== "instagram") {
      return NextResponse.json({ error: "unsupported_platform" }, { status: 400 });
    }
    if (templateMeta && templateMeta.platform !== "instagram") {
      return NextResponse.json({ error: "template_platform_mismatch" }, { status: 400 });
    }

    const ownedAssetUrls: Array<{ id: string; url: string }> = [];
    if (body.selectedAssetIds.length > 0) {
      const placeholders = body.selectedAssetIds.map(() => "?").join(",");
      const res = await db.execute({
        sql: `SELECT id, blob_url FROM assets WHERE owner_google_sub = ? AND id IN (${placeholders})`,
        args: [user.sub, ...body.selectedAssetIds]
      });
      if (res.rows.length !== body.selectedAssetIds.length) return NextResponse.json({ error: "invalid_asset_scope" }, { status: 403 });
      for (const row of res.rows) ownedAssetUrls.push({ id: String(row.id), url: String(row.blob_url) });
    }

    const bootstrap = await getCoachBootstrap(user.email, user.sub);
    if (body.locationId && !bootstrap.locations.some((loc) => loc.id === body.locationId)) {
      return NextResponse.json({ error: "invalid_location_scope" }, { status: 403 });
    }
    if (!body.classId) {
      return validationError("class_required", "Select a HIIT class before generating an image.");
    }
    const selectedClass = bootstrap.classes.find((klass) => klass.id === body.classId);
    if (!selectedClass) {
      return NextResponse.json({ error: "invalid_class_scope" }, { status: 403 });
    }
    const classStartTime = selectedClass.startTime ?? selectedClass.ranAt;
    if (!selectedClass.classDate || !classStartTime) {
      return validationError("class_schedule_required", "The selected HIIT class needs a date and start time before image generation.");
    }

    const classMatchedLocation = findLocationForClass(bootstrap.locations, selectedClass);
    const selectedLocation = classMatchedLocation
      ?? bootstrap.locations.find((loc) => loc.id === body.locationId)
      ?? null;

    const stagedImages: StagedImageReference[] = [];
    const uploadRefs = body.tempUploadRefs.map((url) => validateTempUploadRef(url, body.sessionId));
    const attendeeRef = effectiveAttendeeImageRef ? validateTempUploadRef(effectiveAttendeeImageRef, body.sessionId) : null;
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    if (attendeeRef) {
      stagedImages.push({
        role: "attendee_photo_url",
        url: createSignedBlobAccessUrl(attendeeRef, publicOrigin, expiresAt),
        blobUrl: attendeeRef,
        source: "upload",
        expiresAt
      });
    }
    stagedImages.push(...uploadRefs.map((blobUrl) => ({
      role: "user_uploaded_image" as const,
      url: createSignedBlobAccessUrl(blobUrl, publicOrigin, expiresAt),
      blobUrl,
      source: "upload" as const,
      expiresAt
    })));

    if (bootstrap.coach?.coachPhotoUrl) {
      stagedImages.push(await stageReferenceImage(body.sessionId, "coach_photo_url", bootstrap.coach.coachPhotoUrl, "coach_profile", publicOrigin));
    }
    if (bootstrap.coach?.businessLogoUrl) {
      stagedImages.push(await stageReferenceImage(body.sessionId, "business_logo_url", bootstrap.coach.businessLogoUrl, "coach_profile", publicOrigin));
    }
    if (selectedLocation?.logoUrl) {
      stagedImages.push(await stageReferenceImage(body.sessionId, "location_logo_url", selectedLocation.logoUrl, "location", publicOrigin));
    }
    for (const asset of ownedAssetUrls) {
      stagedImages.push(await stageReferenceImage(body.sessionId, "selected_asset", asset.url, "asset", publicOrigin));
    }

    const history = await db.execute({
      sql: `SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 8`,
      args: [body.sessionId]
    });
    const recentHistory = history.rows
      .reverse()
      .map((row) => `${String(row.role)}: ${String(row.content)}`)
      .join("\n");

    const outputSpec = resolveOutputSpec(body.format, body.aspectRatio, body.outputPreset);
    const generationContextJson: GenerationContextJson = {
      platform: body.platform,
      options: body.options ?? {},
      outputSpec,
      coach: bootstrap.coach,
      selectedHiitClass: selectedClass,
      selectedLocation,
      imageReferences: {
        coach_photo_url: stagedImages.find((img) => img.role === "coach_photo_url")?.url ?? null,
        coach_image_url: stagedImages.find((img) => img.role === "coach_photo_url")?.url ?? null,
        business_logo_url: stagedImages.find((img) => img.role === "business_logo_url")?.url ?? null,
        location_logo_url: stagedImages.find((img) => img.role === "location_logo_url")?.url ?? null,
        attendee_name: body.attendeeName ?? null,
        attendee_image_url: stagedImages.find((img) => img.role === "attendee_photo_url")?.url ?? null,
        attendee_photo_url: stagedImages.find((img) => img.role === "attendee_photo_url")?.url ?? null,
        user_uploaded_images: stagedImages.filter((img) => img.role === "user_uploaded_image").map((img) => img.url),
        selected_asset_urls: stagedImages.filter((img) => img.role === "selected_asset").map((img) => img.url)
      }
    };
    const assembledPrompt = [
      "SYSTEM/ROLE",
      "You are creating a high-quality social image for a fitness coach. Follow the user prompt exactly while preserving coach context.",
      "",
      "USER_EDITED_PROMPT",
      body.message,
      "",
      "GENERATION_CONTEXT_JSON",
      JSON.stringify(generationContextJson, null, 2),
      "",
      "CONVERSATION_HISTORY",
      recentHistory || "No previous conversation."
    ].join("\n");

    if (mode === "download_prompt") {
      const fileName = `llm-payload-${body.sessionId}-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
      const response: GenerateResponse = {
        status: "prompt_ready",
        fileName,
        assembledPrompt
      };
      return NextResponse.json(response);
    }

    userMessageId = newId("msg");
    const ts = nowIso();
    const start = Date.now();
    const latestTemplateId = await getLatestTemplateId(body.sessionId);
    const templateSwitchFromId = latestTemplateId && body.promptTemplateId && latestTemplateId !== body.promptTemplateId ? latestTemplateId : null;
    const promptEnvelope = {
      platform: body.platform,
      format: body.format,
      outputSpec,
      promptTemplateId: body.promptTemplateId ?? null,
      templateVersion: templateMeta?.templateVersion ?? null,
      templateFamilyId: templateMeta?.templateFamilyId ?? null,
      templateSwitchFromId,
      editedPrompt: body.message,
      generationContextJson,
      imageReferences: stagedImages,
      assembledPrompt
    };

    await db.execute({
      sql: `INSERT INTO chat_messages (id, session_id, role, content, attachments_json, created_at, parent_message_id)
            VALUES (?, ?, 'user', ?, ?, ?, ?)`,
      args: [userMessageId, body.sessionId, body.message, JSON.stringify({
        selectedAssetIds: body.selectedAssetIds,
        tempUploadRefs: body.tempUploadRefs,
        promptEnvelope
      }), ts, body.parentMessageId ?? null]
    });
    console.info(`[chat.generate][${reqId}] user_message_saved messageId=${userMessageId}`);

    const imageInputs = stagedImages.map((ref) => ref.url);
    const imageRoles = stagedImages.map((ref) => ref.role).join(",");
    console.info(`[chat.generate][${reqId}] image_generate_start imageInputs=${imageInputs.length} roles=${imageRoles || "none"}`);
    const generated = await withTimeout(
      generateImageWithContext(assembledPrompt, imageInputs, { aspectRatio: outputSpec.aspectRatio as "1:1" | "4:5" | "9:16" }),
      240_000,
      "image_generation_timeout"
    );
    console.info(`[chat.generate][${reqId}] image_generate_done`);
    console.info(
      `[chat.generate][${reqId}] image_model_usage path=${imageInputs.length > 0 ? "responses" : "images"} orchestratorModel=${generated.orchestratorModel} imageModel=${generated.imageModel} displayModel=${generated.displayModel} imageRefs=${imageInputs.length} roles=${imageRoles || "none"}`
    );
    const blob = await putTempBlob(`temp/${body.sessionId}/generated/${newId("img")}.png`, Buffer.from(generated.b64, "base64"), "image/png");
    console.info(`[chat.generate][${reqId}] blob_saved path=${blob.pathname}`);
    const durationMs = Date.now() - start;
    const estimatedCost = Number(((generated.usage.input / 1_000_000) * 10 + (generated.usage.output / 1_000_000) * 40).toFixed(6));
    const assistantMessageId = newId("msg");

    const generatedExpiresAt = new Date(Date.now() + 3600_000).toISOString();
    const metadata = {
      image: { signedUrl: createSignedBlobAccessUrl(blob.url, publicOrigin, generatedExpiresAt), expiresAt: generatedExpiresAt },
      usage: {
        inputTokens: generated.usage.input,
        outputTokens: generated.usage.output,
        estimatedCost,
        durationMs,
        model: generated.displayModel,
        orchestratorModel: generated.orchestratorModel,
        imageModel: generated.imageModel
      },
      outputSpec,
      promptEnvelope
    };

    await db.batch([
      { sql: `INSERT INTO chat_messages (id, session_id, role, content, attachments_json, generation_metadata_json, created_at, parent_message_id) VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)`, args: [assistantMessageId, body.sessionId, "Generated image", JSON.stringify({ blobPath: blob.pathname }), JSON.stringify(metadata), nowIso(), userMessageId] },
      { sql: `UPDATE chat_sessions SET updated_at = ? WHERE id = ?`, args: [nowIso(), body.sessionId] },
      { sql: `INSERT INTO interaction_usage (id, owner_google_sub, session_id, request_type, model, input_tokens, output_tokens, estimated_cost, duration_ms, created_at) VALUES (?, ?, ?, 'image_generation', ?, ?, ?, ?, ?, ?)`, args: [newId("usage"), user.sub, body.sessionId, generated.displayModel, generated.usage.input, generated.usage.output, estimatedCost, durationMs, nowIso()] },
      { sql: `INSERT INTO generation_events (id, owner_google_sub, session_id, message_id, status, created_at) VALUES (?, ?, ?, ?, 'completed', ?)`, args: [newId("evt"), user.sub, body.sessionId, assistantMessageId, nowIso()] }
    ], "write");
    console.info(`[chat.generate][${reqId}] db_persist_done assistantMessageId=${assistantMessageId}`);

    const response: GenerateResponse = { messageId: assistantMessageId, image: metadata.image, usage: metadata.usage, status: "completed" };
    console.info(`[chat.generate][${reqId}] completed`);
    return NextResponse.json(response);
  } catch (error) {
    console.error(`[chat.generate][${reqId}] failed`, error);
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const code = error instanceof Error ? error.message : "generation_error";
    const userMessage = getUserFacingErrorMessage(error, code);
    if (ownerSub && sessionId) {
      await db.execute({
        sql: `INSERT INTO generation_events (id, owner_google_sub, session_id, message_id, status, error_code, error_message, created_at) VALUES (?, ?, ?, ?, 'failed', ?, ?, ?)`,
        args: [newId("evt"), ownerSub, sessionId, userMessageId || null, code, userMessage, nowIso()]
      }).catch(() => {});
    }
    return NextResponse.json({ status: "failed", error: { code, message: userMessage } }, { status: 400 });
  }
}

function validationError(code: string, message: string) {
  return NextResponse.json({ status: "failed", error: { code, message } }, { status: 400 });
}

async function handleTempUpload(req: Request, ownerSub: string) {
  const form = await req.formData();
  const sessionId = String(form.get("sessionId") ?? "");
  if (!sessionId) {
    return NextResponse.json({ error: "missing_session_id" }, { status: 400 });
  }

  const own = await db.execute({
    sql: `SELECT id FROM chat_sessions WHERE id = ? AND owner_google_sub = ? LIMIT 1`,
    args: [sessionId, ownerSub]
  });
  if (!own.rows[0]) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "missing_files" }, { status: 400 });
  }

  const uploads = [];
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  for (const file of files) {
    if (!UPLOAD_ALLOWED_CONTENT_TYPES.has(file.type)) {
      return NextResponse.json({ error: "unsupported_file_type", fileName: file.name }, { status: 400 });
    }

    const ext = file.type === "image/jpeg" ? "jpg" : "png";
    const bytes = Buffer.from(await file.arrayBuffer());
    const blob = await putTempBlob(`temp/${sessionId}/uploads/${newId("upload")}.${ext}`, bytes, file.type);
    uploads.push({
      name: file.name,
      url: blob.url,
      pathname: blob.pathname,
      contentType: file.type,
      expiresAt
    });
  }

  return NextResponse.json({ uploads });
}

function getPublicOrigin(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (productionHost) return `https://${productionHost.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return new URL(req.url).origin;
}

function normalizeForMatch(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function findLocationForClass(locations: CoachLocation[], klass: CoachHiitClass): CoachLocation | null {
  const label = normalizeForMatch(klass.locationLabelAtRun);
  if (!label) return null;
  return locations.find((loc) => {
    const names = [loc.locationName, loc.businessName].map(normalizeForMatch).filter(Boolean);
    return names.some((name) => name === label);
  }) ?? null;
}

function validateTempUploadRef(rawUrl: string, sessionId: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("invalid_temp_upload_ref");
  }

  if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) {
    throw new Error("invalid_temp_upload_ref_host");
  }

  const path = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  if (!path.startsWith(`temp/${sessionId}/uploads/`)) {
    throw new Error("invalid_temp_upload_ref_scope");
  }

  const ext = path.split(".").pop()?.toLowerCase();
  if (ext !== "jpg" && ext !== "jpeg" && ext !== "png") {
    throw new Error("invalid_temp_upload_ref_type");
  }

  return parsed.toString();
}

async function stageReferenceImage(
  sessionId: string,
  role: Exclude<StagedImageRole, "user_uploaded_image">,
  sourceUrl: string,
  source: Exclude<StagedImageReference["source"], "upload">,
  publicOrigin: string
): Promise<StagedImageReference> {
  const parsed = new URL(sourceUrl);
  const isVercelBlob = parsed.hostname.endsWith(".blob.vercel-storage.com");
  const headers = new Headers();
  if (isVercelBlob && process.env.BLOB_READ_WRITE_TOKEN) {
    headers.set("Authorization", `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`);
  }

  const response = await fetch(parsed.toString(), {
    headers,
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`reference_fetch_failed_${role}`);
  }

  const contentType = normalizeImageContentType(response.headers.get("content-type"));
  if (!contentType) {
    throw new Error(`unsupported_reference_type_${role}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
  const blob = await putTempBlob(`temp/${sessionId}/references/${role}-${newId("ref")}.${ext}`, bytes, contentType);
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  return {
    role,
    url: createSignedBlobAccessUrl(blob.url, publicOrigin, expiresAt),
    blobUrl: blob.url,
    pathname: blob.pathname,
    source,
    expiresAt
  };
}

function normalizeImageContentType(raw: string | null): "image/jpeg" | "image/png" | "image/webp" | null {
  const contentType = String(raw ?? "").split(";")[0].trim().toLowerCase();
  if (contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp") {
    return contentType;
  }
  return null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function resolveOutputSpec(format: "square" | "portrait" | "story", aspectRatio?: "1:1" | "4:5" | "9:16", outputPreset?: "ig_square_1080" | "ig_portrait_1080x1350" | "ig_story_1080x1920") {
  const fallback = format === "portrait"
    ? { outputPreset: "ig_portrait_1080x1350", aspectRatio: "4:5", width: 1080, height: 1350 }
    : format === "story"
      ? { outputPreset: "ig_story_1080x1920", aspectRatio: "9:16", width: 1080, height: 1920 }
      : { outputPreset: "ig_square_1080", aspectRatio: "1:1", width: 1080, height: 1080 };

  if (!outputPreset && !aspectRatio) return fallback;
  return {
    outputPreset: outputPreset ?? fallback.outputPreset,
    aspectRatio: aspectRatio ?? fallback.aspectRatio,
    width: fallback.width,
    height: fallback.height
  };
}

async function getLatestTemplateId(sessionId: string): Promise<string | null> {
  const row = await db.execute({
    sql: `SELECT attachments_json
          FROM chat_messages
          WHERE session_id = ? AND role = 'user'
          ORDER BY created_at DESC
          LIMIT 1`,
    args: [sessionId]
  });
  const raw = row.rows[0]?.attachments_json;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw)) as { promptEnvelope?: { promptTemplateId?: string | null } };
    return parsed.promptEnvelope?.promptTemplateId ?? null;
  } catch {
    return null;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(code)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isBillingLimitError(error: unknown, fallbackCode: string): boolean {
  const anyError = error as { code?: string; type?: string; message?: string } | undefined;
  const code = String(anyError?.code ?? fallbackCode ?? "").toLowerCase();
  const type = String(anyError?.type ?? "").toLowerCase();
  const message = String(anyError?.message ?? "").toLowerCase();
  return code.includes("billing_hard_limit_reached")
    || type.includes("billing_limit_user_error")
    || message.includes("billing hard limit has been reached");
}

function getUserFacingErrorMessage(error: unknown, code: string): string {
  if (isBillingLimitError(error, code)) {
    return "Image generation is unavailable because OpenAI billing limit was reached";
  }
  if (String(code).toLowerCase().includes("image_generation_timeout")) {
    return "Image generation is taking longer than expected. Please try again.";
  }
  if (String(code).toLowerCase().includes("connection error")) {
    return "Image generation could not be completed because of a connection error. Please try again.";
  }
  return "Generation failed safely. Try again.";
}
