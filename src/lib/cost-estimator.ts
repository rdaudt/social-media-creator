import { db } from "@/lib/db";
import { PricingRateSet, estimateCostUsdFromTotals } from "@/lib/pricing";

export type EstimateConfidence = "high" | "low";

export async function estimateRunCostRange(args: {
  ownerSub: string;
  model: string;
  format: "square" | "portrait" | "story";
  rateSet: PricingRateSet;
}): Promise<{ minEstimateUsd: number; maxEstimateUsd: number; confidence: EstimateConfidence }> {
  const hist = await db.execute({
    sql: `SELECT input_tokens, output_tokens
          FROM interaction_usage
          WHERE owner_google_sub = ? AND request_type = 'image_generation' AND model = ?
          ORDER BY created_at DESC
          LIMIT 40`,
    args: [args.ownerSub, args.model]
  });

  if (hist.rows.length >= 5) {
    const costs = hist.rows.map((row) => estimateCostUsdFromTotals(Number(row.input_tokens ?? 0), Number(row.output_tokens ?? 0), args.rateSet)).sort((a, b) => a - b);
    const p25 = costs[Math.floor((costs.length - 1) * 0.25)];
    const p75 = costs[Math.floor((costs.length - 1) * 0.75)];
    return {
      minEstimateUsd: Number(Math.max(0.001, p25).toFixed(4)),
      maxEstimateUsd: Number(Math.max(p25, p75).toFixed(4)),
      confidence: "high"
    };
  }

  const fallbackOutputByFormat = args.format === "story" ? 1400 : args.format === "portrait" ? 1100 : 900;
  const min = estimateCostUsdFromTotals(500, Math.round(fallbackOutputByFormat * 0.8), args.rateSet);
  const max = estimateCostUsdFromTotals(1800, Math.round(fallbackOutputByFormat * 1.3), args.rateSet);
  return {
    minEstimateUsd: Number(min.toFixed(4)),
    maxEstimateUsd: Number(max.toFixed(4)),
    confidence: "low"
  };
}
