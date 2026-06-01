import { db } from "@/lib/db";

type CapSource = "user" | "global" | "none";
type BalanceSource = "usage_sum" | "manual_override";

export type UserCapStatus = {
  tracking: {
    requestedCount: number;
    successCount: number;
  };
  caps: {
    effectiveCapUsd: number | null;
    capSource: CapSource;
    isCapped: boolean;
    remainingUsd: number | null;
  };
  balance: {
    effectiveLifetimeUsd: number;
    source: BalanceSource;
  };
};

export async function getUserCapStatus(ownerSub: string): Promise<UserCapStatus> {
  const usage = await db.execute({
    sql: `SELECT COALESCE(SUM(actual_cost_usd), 0) AS usage_sum
          FROM interaction_usage
          WHERE owner_google_sub = ? AND request_type = 'image_generation'`,
    args: [ownerSub]
  });

  const caps = await db.execute({
    sql: `SELECT
            (SELECT cap_usd FROM user_spending_caps WHERE owner_google_sub = ? LIMIT 1) AS user_cap_usd,
            (SELECT cap_usd FROM spending_caps WHERE cap_type = 'image_generation' LIMIT 1) AS global_cap_usd,
            (SELECT balance_usd FROM user_balance_overrides WHERE owner_google_sub = ? LIMIT 1) AS balance_override_usd,
            (SELECT COUNT(*) FROM generation_events WHERE owner_google_sub = ? AND status = 'accepted') AS requested_count,
            (SELECT COUNT(*) FROM generation_events WHERE owner_google_sub = ? AND status = 'completed') AS success_count`,
    args: [ownerSub, ownerSub, ownerSub, ownerSub]
  });

  const row = caps.rows[0] ?? {};
  const usageSum = Number(usage.rows[0]?.usage_sum ?? 0);
  const hasOverride = row.balance_override_usd != null;
  const effectiveLifetimeUsd = Number(hasOverride ? row.balance_override_usd : usageSum);
  const balanceSource: BalanceSource = hasOverride ? "manual_override" : "usage_sum";

  const userCap = row.user_cap_usd == null ? null : Number(row.user_cap_usd);
  const globalCap = row.global_cap_usd == null ? null : Number(row.global_cap_usd);
  const effectiveCapUsd = userCap ?? globalCap;
  const capSource: CapSource = userCap != null ? "user" : globalCap != null ? "global" : "none";

  const isCapped = effectiveCapUsd != null ? effectiveLifetimeUsd >= effectiveCapUsd : false;
  const remainingUsd = effectiveCapUsd == null ? null : Number(Math.max(0, effectiveCapUsd - effectiveLifetimeUsd).toFixed(6));

  return {
    tracking: {
      requestedCount: Number(row.requested_count ?? 0),
      successCount: Number(row.success_count ?? 0)
    },
    caps: {
      effectiveCapUsd,
      capSource,
      isCapped,
      remainingUsd
    },
    balance: {
      effectiveLifetimeUsd: Number(effectiveLifetimeUsd.toFixed(6)),
      source: balanceSource
    }
  };
}
