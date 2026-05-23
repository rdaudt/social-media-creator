import { NextResponse } from "next/server";
import { requireCoachSessionUser } from "@/lib/auth";
import { putTempBlob } from "@/lib/blob";
import { getCoachContext } from "@/lib/context";
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
    if (body.promptTemplateId) {
      const tpl = await db.execute({
        sql: `SELECT prompt_text FROM prompt_templates WHERE id = ? AND is_active = 1 LIMIT 1`,
        args: [body.promptTemplateId]
      });
      templatePrompt = String(tpl.rows[0]?.prompt_text ?? "");
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

    const context = await getCoachContext(user.email, user.sub);
    const assembledPrompt = `${templatePrompt}\n\nFormat: ${body.format}\nUser message: ${body.message}\nOptions: ${JSON.stringify(body.options ?? {})}\n\n${context}`;

    userMessageId = newId("msg");
    const ts = nowIso();
    const start = Date.now();

    await db.execute({
      sql: `INSERT INTO chat_messages (id, session_id, role, content, attachments_json, created_at, parent_message_id)
            VALUES (?, ?, 'user', ?, ?, ?, ?)`,
      args: [userMessageId, body.sessionId, body.message, JSON.stringify({ selectedAssetIds: body.selectedAssetIds, tempUploadRefs: body.tempUploadRefs }), ts, body.parentMessageId ?? null]
    });

    const generated = await generateImageWithContext(assembledPrompt, [...ownedAssetUrls, ...body.tempUploadRefs]);
    const blob = await putTempBlob(`temp/${body.sessionId}/generated/${newId("img")}.png`, Buffer.from(generated.b64, "base64"), "image/png");
    const durationMs = Date.now() - start;
    const estimatedCost = Number(((generated.usage.input / 1_000_000) * 10 + (generated.usage.output / 1_000_000) * 40).toFixed(6));
    const assistantMessageId = newId("msg");

    const metadata = {
      image: { signedUrl: blob.url, expiresAt: new Date(Date.now() + 3600_000).toISOString() },
      usage: { inputTokens: generated.usage.input, outputTokens: generated.usage.output, estimatedCost, durationMs, model: generated.model },
      format: body.format
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
