# Image Cap & Balance Override SQL Runbook

Use these SQL statements for manual admin overrides.

## 1) Set or update global image cap

```sql
INSERT INTO spending_caps (id, cap_type, cap_usd, created_at, updated_at)
VALUES ('cap_global_image_generation', 'image_generation', 25.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(cap_type) DO UPDATE SET
  cap_usd = excluded.cap_usd,
  updated_at = CURRENT_TIMESTAMP;
```

## 2) Remove global image cap

```sql
DELETE FROM spending_caps
WHERE cap_type = 'image_generation';
```

## 3) Set or update per-user cap override

```sql
INSERT INTO user_spending_caps (owner_google_sub, user_email, cap_usd, created_at, updated_at)
VALUES ('GOOGLE_SUB_HERE', 'user@example.com', 10.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(owner_google_sub) DO UPDATE SET
  user_email = excluded.user_email,
  cap_usd = excluded.cap_usd,
  updated_at = CURRENT_TIMESTAMP;
```

## 4) Remove per-user cap override

```sql
DELETE FROM user_spending_caps
WHERE owner_google_sub = 'GOOGLE_SUB_HERE';
```

## 5) Set or update per-user manual balance override (absolute value)

```sql
INSERT INTO user_balance_overrides (owner_google_sub, user_email, balance_usd, created_at, updated_at)
VALUES ('GOOGLE_SUB_HERE', 'user@example.com', 18.75, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(owner_google_sub) DO UPDATE SET
  user_email = excluded.user_email,
  balance_usd = excluded.balance_usd,
  updated_at = CURRENT_TIMESTAMP;
```

## 6) Remove per-user balance override

```sql
DELETE FROM user_balance_overrides
WHERE owner_google_sub = 'GOOGLE_SUB_HERE';
```

## Notes
- Cap precedence: per-user cap overrides global cap.
- If both caps are absent, user is uncapped.
- Effective balance source:
  - override row exists => `user_balance_overrides.balance_usd`
  - otherwise => usage sum from `interaction_usage.actual_cost_usd` for `request_type='image_generation'`
- Block condition: `effectiveLifetimeUsd >= effectiveCapUsd`
