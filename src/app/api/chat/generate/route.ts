import { NextResponse } from "next/server";
import { requireCoachSessionUser } from "@/lib/auth";
import { putTempBlob } from "@/lib/blob";
import { getCoachBootstrap, getCoachContext } from "@/lib/context";
import { bootstrapSchema, db, newId } from "@/lib/db";
import { authErrorResponse } from "@/lib/http";
import { generateImageWithContext } from "@/lib/openai";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateSchema } from "@/lib/validation";
import type { GenerateResponse } from "@/types";

export async function POST(req: Request) {
  let ownerSub = "";
  let sessionId = "";
  let userMessageId = "";

  try {
    await bootstrapSchema();
    const user = await requireCoachSessionUser();
    ownerSub = user.sub;

    const rate = checkRateLimit(`gen:${user.sub}`, 8, 60_000);
    if (!rate.ok) return NextResponse.json({ error: "rate_limited", retryAfter: rate.retryAfter }, { status: 429 });

    const parsed = generateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });
    const body = parsed.data;
    sessionId = body.sessionId;

    const session = await db.execute({
      sql: `SELECT id FROM chat_sessions WHERE id = ? AND owner_google_sub = ? LIMIT 1`,
      args: [body.sessionId, user.sub]
    });
    if (!session.rows[0]) return NextResponse.json({ error: "session_not_found" }, { status: 404 });

    let templatePrompt = "";
    let templateMeta: { id: string; platform: string; format: string; templateFamilyId: string | null; templateVersion: number } | null = null;
    if (body.promptTemplateId) {
      const tpl = await db.execute({
        sql: `SELECT id, platform, format, template_family_id, template_version, prompt_text
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
      templatePrompt = String(tpl.rows[0]?.prompt_text ?? "");
      if (!templatePrompt) {
        return NextResponse.json({ error: "template_not_found" }, { status: 404 });
      }
    }

    if (body.platform !== "instagram") {
      return NextResponse.json({ error: "unsupported_platform" }, { status: 400 });
    }
    if (templateMeta && templateMeta.platform !== "instagram") {
      return NextResponse.json({ error: "template_platform_mismatch" }, { status: 400 });
    }

    const ownedAssetUrls: string[] = [];
    if (body.selectedAssetIds.length > 0) {
      const placeholders = body.selectedAssetIds.map(() => "?").join(",");
      const res = await db.execute({
        sql: `SELECT id, blob_url FROM assets WHERE owner_google_sub = ? AND id IN (${placeholders})`,
        args: [user.sub, ...body.selectedAssetIds]
      });
      if (res.rows.length !== body.selectedAssetIds.length) return NextResponse.json({ error: "invalid_asset_scope" }, { status: 403 });
      for (const row of res.rows) ownedAssetUrls.push(String(row.blob_url));
    }

    const bootstrap = await getCoachBootstrap(user.email, user.sub);
    if (body.locationId && !bootstrap.locations.some((loc) => loc.id === body.locationId)) {
      return NextResponse.json({ error: "invalid_location_scope" }, { status: 403 });
    }
    if (body.classId && !bootstrap.classes.some((klass) => klass.id === body.classId)) {
      return NextResponse.json({ error: "invalid_class_scope" }, { status: 403 });
    }

    const context = await getCoachContext(
      user.email,
      user.sub,
      body.locationId ?? bootstrap.defaults.selectedLocationId,
      body.classId ?? bootstrap.defaults.selectedClassId
    );
    const history = await db.execute({
      sql: `SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 8`,
      args: [body.sessionId]
    });
    const recentHistory = history.rows
      .reverse()
      .map((row) => `${String(row.role)}: ${String(row.content)}`)
      .join("\n");

    const outputSpec = resolveOutputSpec(body.format, body.aspectRatio, body.outputPreset);
    const assembledPrompt = [
      "SYSTEM/ROLE",
      "You are creating a high-quality social image for a fitness coach. Follow the user prompt exactly while preserving coach context.",
      "",
      "ADMIN_SEED_PROMPT",
      templatePrompt || "No template selected.",
      "",
      "USER_CREATIVE_INTENT",
      body.message,
      "",
      "CONTEXT_JSON",
      JSON.stringify({
        platform: body.platform,
        options: body.options ?? {},
        outputSpec,
        coachContext: context
      }, null, 2),
      "",
      "CONVERSATION_HISTORY",
      recentHistory || "No previous conversation."
    ].join("\n");

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
      templateSwitchFromId
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

    const generated = await generateImageWithContext(assembledPrompt, [...ownedAssetUrls, ...body.tempUploadRefs]);
    const blob = await putTempBlob(`temp/${body.sessionId}/generated/${newId("img")}.png`, Buffer.from(generated.b64, "base64"), "image/png");
    const durationMs = Date.now() - start;
    const estimatedCost = Number(((generated.usage.input / 1_000_000) * 10 + (generated.usage.output / 1_000_000) * 40).toFixed(6));
    const assistantMessageId = newId("msg");

    const metadata = {
      image: { signedUrl: blob.url, expiresAt: new Date(Date.now() + 3600_000).toISOString() },
      usage: { inputTokens: generated.usage.input, outputTokens: generated.usage.output, estimatedCost, durationMs, model: generated.model },
      outputSpec,
      promptEnvelope
    };

    await db.batch([
      { sql: `INSERT INTO chat_messages (id, session_id, role, content, attachments_json, generation_metadata_json, created_at, parent_message_id) VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)`, args: [assistantMessageId, body.sessionId, "Generated image", JSON.stringify({ blobPath: blob.pathname }), JSON.stringify(metadata), nowIso(), userMessageId] },
      { sql: `UPDATE chat_sessions SET updated_at = ? WHERE id = ?`, args: [nowIso(), body.sessionId] },
      { sql: `INSERT INTO interaction_usage (id, owner_google_sub, session_id, request_type, model, input_tokens, output_tokens, estimated_cost, duration_ms, created_at) VALUES (?, ?, ?, 'image_generation', ?, ?, ?, ?, ?, ?)`, args: [newId("usage"), user.sub, body.sessionId, generated.model, generated.usage.input, generated.usage.output, estimatedCost, durationMs, nowIso()] },
      { sql: `INSERT INTO generation_events (id, owner_google_sub, session_id, message_id, status, created_at) VALUES (?, ?, ?, ?, 'completed', ?)`, args: [newId("evt"), user.sub, body.sessionId, assistantMessageId, nowIso()] }
    ], "write");

    const response: GenerateResponse = { messageId: assistantMessageId, image: metadata.image, usage: metadata.usage, status: "completed" };
    return NextResponse.json(response);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const code = error instanceof Error ? error.message : "generation_error";
    if (ownerSub && sessionId) {
      await db.execute({
        sql: `INSERT INTO generation_events (id, owner_google_sub, session_id, message_id, status, error_code, error_message, created_at) VALUES (?, ?, ?, ?, 'failed', ?, ?, ?)`,
        args: [newId("evt"), ownerSub, sessionId, userMessageId || null, code, "Generation failed", nowIso()]
      }).catch(() => {});
    }
    return NextResponse.json({ status: "failed", error: { code, message: "Generation failed safely. Try again." } }, { status: 400 });
  }
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
