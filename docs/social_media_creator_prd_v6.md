# Product Requirements Document (PRD)
# Social Media Creator App

Version: 0.4  
Date: 2026-05-26  
Status: Updated to implementation

---

# 1. Product Scope

Social Media Creator is a Next.js 15 web app for authenticated fitness coaches to generate Instagram images with OpenAI, using coach profile context, class context, selected owned assets, and optional temporary uploads.

This app is a consumer of shared data (coach profile, classes, locations, assets) and does not edit those source systems.

---

# 2. Current Implementation Summary

## 2.1 Implemented user roles
- `coach`
- `admin`

Role resolution order:
1. `coach_tenants.role` (if column exists)
2. `coach_tenants.is_admin` (if column exists)
3. `ADMIN_EMAILS` env fallback

Access rules:
- `/chat` requires authenticated coach membership (`coach_tenants.owner_email` normalized match)
- `/admin/prompt-templates` requires admin role
- non-member authenticated users are redirected to `/access-denied`

## 2.2 Implemented UX
- Chat-style generation screen at `/chat`
- Tabs: `Image description`, `Prompt Debug`, `Class Media`
- Select class, template, format, and owned assets
- Upload temporary reference images (JPG/PNG)
- Special validation flow for Workout Warrior templates (attendee name + attendee image)
- Synchronous generation with loading modal and elapsed timer
- Inline output preview + download
- “Attach to class” for generated output
- Cost estimate + today/month spend + per-run usage
- “Download LLM Message” mode for assembled prompt payload export

## 2.3 Supported output formats
- `square` (`1080x1080`, aspect `1:1`)
- `portrait` (`1080x1350`, aspect `4:5`)
- `story` (`1080x1920`, aspect `9:16`)

---

# 3. Architecture

## 3.1 Runtime architecture
- Next.js App Router frontend + API routes
- Auth.js (NextAuth v5 beta) with Google OAuth
- Turso/libSQL for app and shared data reads
- Vercel Blob for private asset storage and temporary generated/upload staging
- OpenAI API (`gpt-image-2`, with Responses API path when image references are present)

## 3.2 Generation pipeline (implemented)
1. Coach submits generation request or prompt-download request
2. Server validates session ownership, class requirement, and template constraints
3. Server resolves coach/class/location/assets context
4. Server stages references (existing assets/profile images/temporary uploads) to signed `/api/blob` URLs
5. Server assembles prompt envelope + JSON generation context
6. For `mode=download_prompt`, server returns assembled prompt text only
7. For `mode=generate`, server calls OpenAI image generation
8. Output image is written to temporary private blob path
9. Assistant message, usage row, and generation event are persisted
10. Response returns short-lived signed URL for inline display/download

---

# 4. Data Model (As Implemented)

Core tables used by this app:
- `assets`
- `coach_tenants`
- `coach_hiit_classes`
- `coach_class_locations`
- `chat_sessions`
- `chat_messages`
- `interaction_usage`
- `model_pricing_rates`
- `generation_events`
- `prompt_templates`
- `coach_hiit_class_media`

Notes:
- `bootstrapSchema()` creates/updates app-owned tables at runtime.
- Pricing seed currently inserts `gpt-image-2` rates effective `2026-01-01T00:00:00.000Z`.

---

# 5. API Surface (Implemented)

Publicly used routes:
- `GET /api/health`
- `GET /api/assets`
- `GET /api/prompt-templates`
- `GET /api/blob?url=...`
- `GET /api/chat/bootstrap`
- `GET|POST /api/chat/sessions`
- `GET /api/chat/sessions/:id/messages`
- `POST /api/chat/generate` (JSON generate/download mode + multipart upload mode)
- `GET /api/chat/costs`
- `GET|POST /api/chat/class-media`
- `PATCH|DELETE /api/chat/class-media/:id`
- `POST /api/admin/prompt-templates`
- `PATCH|DELETE /api/admin/prompt-templates/:id`
- `GET /api/admin/costs/reconciliation`
- `GET|POST /api/auth/[...nextauth]`

Current route handler files: `15`.

---

# 6. Security Model (Implemented)

- Server-only auth and ownership enforcement
- Coach membership enforced by normalized `coach_tenants.owner_email`
- Admin-only guard for admin API/page
- No OpenAI or blob write token exposure to browser
- `/api/blob` enforces allowed host + signed URL verification or authenticated fallback
- Generated and reference access URLs are short-lived signed links
- In-memory process-local rate limiting for generate/upload paths

---

# 7. Storage Behavior

## 7.1 Temporary uploads
- Uploaded via multipart to `/api/chat/generate`
- Stored in private blob paths: `temp/{sessionId}/uploads/...`
- Referenced by signed URLs for model input

## 7.2 Generated outputs
- Stored in private blob paths: `temp/{sessionId}/generated/...`
- Returned via signed `/api/blob` URLs (1-hour expiry)

## 7.3 Class media attachments
- When user attaches generated image to class, file is copied to permanent private path:
  `class-media/{ownerSub}/{classId}/{mediaId}.{ext}`
- Metadata is stored in `coach_hiit_class_media`
- Supports share toggle (`is_sharable`) and delete

---

# 8. Cost and Usage Tracking

Implemented tracking includes:
- token totals
- token breakdown fields (text/image/cached)
- estimated and actual cost USD
- confidence (`high`/`partial`)
- model and duration
- daily/monthly spend aggregation
- admin reconciliation endpoint for app totals vs imported billing total

---

# 9. Deployment and Operational Constraints

## 9.1 Vercel Hobby function count risk
Project instructions specify a hard constraint of up to 12 serverless functions on Hobby.

Current implementation has 15 API route handlers, so the app is over that stated constraint and should be consolidated before depending on Hobby-limited deployment behavior.

## 9.2 Environment variables in active use
- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL` (optional, default `gpt-image-2`)
- `OPENAI_RESPONSES_MODEL` (optional, default `gpt-4.1`)
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `BLOB_READ_WRITE_TOKEN`
- `BLOB_ACCESS_SIGNING_SECRET` (fallback chain exists)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AUTH_SECRET` (or `AUTH_SESSION_SECRET` fallback)
- `ADMIN_EMAILS` (fallback role source)
- `E2E_AUTH_BYPASS` (test-only)

---

# 10. Gaps vs Prior PRD (Resolved in this update)

The prior PRD contained items not aligned with implementation. This update corrects:
- removes “sample content” as an implemented feature
- reflects actual endpoints (`/api/chat/*`, admin routes, blob proxy route)
- reflects actual temporary + permanent blob behavior
- reflects class-required generation logic
- reflects real auth/role/coach-membership rules
- reflects current chat UX and prompt debug/export behavior
- adds explicit serverless-function count risk against stated Hobby constraint

---

# 11. Recommended Next Actions

1. Consolidate API routes to <=12 handler files (priority: Hobby constraint compliance).
2. Decide and implement cleanup policy for `temp/` blobs (TTL job/lifecycle automation).
3. Expand admin UI beyond create-only workflow (list/edit/delete surfaces).
4. Add tests for class-media attach/share/delete API paths and blob proxy signed URL behavior.
