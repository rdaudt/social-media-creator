import { NextResponse } from "next/server";
import { requireCoachSessionUser } from "@/lib/auth";
import { estimateRunCostRange } from "@/lib/cost-estimator";
import { bootstrapSchema, db } from "@/lib/db";
import { authErrorResponse } from "@/lib/http";
import { resolvePricingRateSet } from "@/lib/pricing";
import { getUserCapStatus } from "@/lib/spending";

export async function GET(req: Request) {
  try {
    await bootstrapSchema();
    const user = await requireCoachSessionUser();
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") ?? "square") as "square" | "portrait" | "story";
    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";
    const pricing = await resolvePricingRateSet(model);
    if (!pricing) return NextResponse.json({ error: "pricing_not_configured" }, { status: 500 });

    const estimate = await estimateRunCostRange({ ownerSub: user.sub, model, format, rateSet: pricing });
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const spend = await db.execute({
      sql: `SELECT
              SUM(CASE WHEN created_at >= ? THEN actual_cost_usd ELSE 0 END) AS today_total,
              SUM(CASE WHEN created_at >= ? THEN actual_cost_usd ELSE 0 END) AS month_total,
              SUM(actual_cost_usd) AS lifetime_total
            FROM interaction_usage
            WHERE owner_google_sub = ? AND request_type = 'image_generation'`,
      args: [dayStart, monthStart, user.sub]
    });
    const row = spend.rows[0];
    const capStatus = await getUserCapStatus(user.sub);
    return NextResponse.json({
      estimate,
      spend: {
        todayUsd: Number(Number(row?.today_total ?? 0).toFixed(6)),
        monthUsd: Number(Number(row?.month_total ?? 0).toFixed(6)),
        lifetimeUsd: Number(Number(row?.lifetime_total ?? 0).toFixed(6))
      },
      tracking: capStatus.tracking,
      caps: capStatus.caps,
      balance: capStatus.balance,
      pricingBasis: {
        model,
        effectiveFrom: pricing.effectiveFrom,
        version: pricing.version
      }
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
