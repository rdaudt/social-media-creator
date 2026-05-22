import { newId } from "@/lib/db";

type Hit = { count: number; resetAt: number };
const buckets = new Map<string, Hit>();

export function checkRateLimit(key: string, limit = 10, windowMs = 60_000): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const hit = buckets.get(key);
  if (!hit || hit.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (hit.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((hit.resetAt - now) / 1000) };
  }
  hit.count += 1;
  return { ok: true };
}

export function eventId(): string {
  return newId("evt");
}
