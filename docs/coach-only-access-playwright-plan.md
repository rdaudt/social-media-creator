# Enforce Coach-Only Access with Playwright Coverage

## Summary
Implement coach-only authorization based on `coach_tenants` membership and add end-to-end Playwright coverage for access gating and blocked-user UX. A user must be both authenticated and present in `coach_tenants` to use the app.

## Implementation Changes
- Add a shared auth guard (e.g. `requireCoachSessionUser`) that:
  - validates session identity (`sub`, `email`)
  - checks `coach_tenants` membership by normalized `owner_email`
  - returns `unauthorized` for missing session, `forbidden` for signed-in non-coach
- Apply this guard across protected API routes that currently rely on auth-only checks.
- Update `/chat` server page gate:
  - unauthenticated: redirect to `/signin?callbackUrl=/chat`
  - authenticated non-coach: redirect to dedicated access-denied page (for example `/access-denied`)
- Add dedicated access-denied page UI with deterministic non-coach messaging and a sign-out action.
- Keep admin role logic as-is for admin endpoints, but still require coach membership for app usage.
- Optional DB hardening: add index on `coach_tenants(lower(owner_email))` for membership lookup.

## Public Interfaces / Behavior
- Blocked authenticated users are redirected to dedicated `/access-denied` page (no sign-in query-param contract for this case).
- Protected APIs consistently return `403` for authenticated non-coaches and `401`/auth redirect semantics for unauthenticated requests.
- No external API schema changes beyond auth status behavior.

## Test Plan
- Unit/integration (server-side):
  - coach membership check passes/fails correctly
  - protected API endpoints reject non-coaches with `403`
  - unauthenticated requests get auth failure behavior
- Playwright E2E (Chromium project):
  - unauthenticated user visiting `/chat` is redirected to `/signin?callbackUrl=%2Fchat`
  - non-coach authenticated session is redirected from `/chat` to `/access-denied`
  - access-denied page displays deterministic non-coach message and expected action(s)
  - coach-authenticated session can load `/chat` successfully
- Playwright fixture strategy:
  - add test-only auth/session setup mechanism (seeded session or test bypass hook) to simulate coach vs non-coach signed-in states without real Google OAuth in CI.

## Assumptions
- Source of truth for “coach” is a `coach_tenants` row.
- Matching key is normalized email via `coach_tenants.owner_email`; `owner_google_sub` is not required for authorization.
- Playwright runs against local Next dev server on port `3500` and uses existing `test:e2e` script.
