import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { bootstrapSchema, db } from "@/lib/db";
import { authErrorResponse } from "@/lib/http";

export async function GET(req: Request) {
  try {
    await bootstrapSchema();
    await requireAdmin();
    const url = new URL(req.url);
    const billingTotalUsd = Number(url.searchParams.get("billingTotalUsd") ?? "0");
    const byDay = await db.execute({
      sql: `SELECT substr(created_at, 1, 10) AS day, SUM(actual_cost_usd) AS total_usd
            FROM interaction_usage
            WHERE request_type = 'image_generation'
            GROUP BY substr(created_at, 1, 10)
            ORDER BY day DESC
            LIMIT 31`,
      args: []
    });
    const byMonth = await db.execute({
      sql: `SELECT substr(created_at, 1, 7) AS month, SUM(actual_cost_usd) AS total_usd
            FROM interaction_usage
            WHERE request_type = 'image_generation'
            GROUP BY substr(created_at, 1, 7)
            ORDER BY month DESC
            LIMIT 12`,
      args: []
    });
    const appTotal = byMonth.rows.reduce((sum, row) => sum + Number(row.total_usd ?? 0), 0);
    return NextResponse.json({
      appTotals: {
        allTimeUsd: Number(appTotal.toFixed(6)),
        byDay: byDay.rows,
        byMonth: byMonth.rows
      },
      billingComparison: {
        importedBillingTotalUsd: Number(billingTotalUsd.toFixed(6)),
        deltaUsd: Number((appTotal - billingTotalUsd).toFixed(6))
      }
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

