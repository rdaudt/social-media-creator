import { db } from "@/lib/db";

export type CostConfidence = "high" | "partial";
export type PricingRateType = "text_input" | "text_cached_input" | "image_input" | "image_cached_input" | "image_output";
export type PricingRateSet = {
  model: string;
  effectiveFrom: string;
  version: string;
  rates: Record<PricingRateType, number>;
};

export type TokenBreakdown = {
  inputTokens: number;
  outputTokens: number;
  textInputTokens: number;
  cachedTextInputTokens: number;
  imageInputTokens: number;
  cachedImageInputTokens: number;
  imageOutputTokens: number;
};

export async function resolvePricingRateSet(model: string, atIso = new Date().toISOString()): Promise<PricingRateSet | null> {
  const res = await db.execute({
    sql: `SELECT model, rate_type, usd_per_million_tokens, effective_from
          FROM model_pricing_rates
          WHERE model = ?
            AND is_active = 1
            AND effective_from <= ?
            AND (effective_to IS NULL OR effective_to > ?)
          ORDER BY effective_from DESC`,
    args: [model, atIso, atIso]
  });
  if (res.rows.length === 0) return null;
  const effectiveFrom = String(res.rows[0].effective_from);
  const rates: Partial<Record<PricingRateType, number>> = {};
  for (const row of res.rows) {
    if (String(row.effective_from) !== effectiveFrom) continue;
    const rt = String(row.rate_type) as PricingRateType;
    rates[rt] = Number(row.usd_per_million_tokens ?? 0);
  }
  const required: PricingRateType[] = ["text_input", "text_cached_input", "image_input", "image_cached_input", "image_output"];
  if (required.some((r) => typeof rates[r] !== "number")) return null;
  return {
    model,
    effectiveFrom,
    version: `${model}@${effectiveFrom}`,
    rates: rates as Record<PricingRateType, number>
  };
}

export function calculateActualCostUsd(tokens: TokenBreakdown, rateSet: PricingRateSet): number {
  const r = rateSet.rates;
  const total =
    (tokens.textInputTokens / 1_000_000) * r.text_input +
    (tokens.cachedTextInputTokens / 1_000_000) * r.text_cached_input +
    (tokens.imageInputTokens / 1_000_000) * r.image_input +
    (tokens.cachedImageInputTokens / 1_000_000) * r.image_cached_input +
    (tokens.imageOutputTokens / 1_000_000) * r.image_output;
  return Number(total.toFixed(6));
}

export function estimateCostUsdFromTotals(inputTokens: number, outputTokens: number, rateSet: PricingRateSet): number {
  const total = (inputTokens / 1_000_000) * rateSet.rates.text_input + (outputTokens / 1_000_000) * rateSet.rates.image_output;
  return Number(total.toFixed(6));
}
