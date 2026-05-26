# Social Media Creator

AI-powered social image generation app for HIIT coaches.

## Quick Start (3 commands)
```powershell
npm install
Copy-Item .env.example .env.local
powershell -File scripts\vercel-dev-restart.ps1
```

Then open `http://localhost:3500`.

## Stack
- Next.js 15 (App Router)
- React 19 + TypeScript
- Auth.js (NextAuth v5 beta) with Google OAuth
- Turso/libSQL
- Vercel Blob (private)
- OpenAI (`gpt-image-2`, optional Responses orchestrator model)

## Core Features
- Coach-only access control (`coach_tenants.owner_email` match)
- Admin role support for prompt template management
- Chat-style image generation flow
- Prompt template selection + class/location context injection
- Temporary reference image uploads (JPG/PNG)
- Generated image preview + signed download
- Attach generated images to class media library
- Cost estimation + per-run usage tracking + spend snapshots
- Prompt debug/export (`download_prompt` mode)

## Project Structure
- `src/app/chat` - main chat UI
- `src/app/api/chat/*` - generation, sessions, context bootstrap, costs, class media
- `src/app/api/admin/*` - admin template and cost reconciliation APIs
- `src/lib/*` - auth, db bootstrap, blob signing, pricing, OpenAI, validation
- `db/shared_schema.sql` - shared ecosystem schema reference
- `scripts/vercel-dev-restart.ps1` - preferred local dev restart script
- `scripts/turso.ps1` - Turso CLI wrapper via WSL

## Prerequisites
- Node.js 20+
- npm
- Vercel CLI (`vercel.cmd` in this Windows environment)
- Turso CLI installed/authenticated in WSL Ubuntu

## Environment Variables
Copy `.env.example` into `.env.local` and set values:

```env
APP_BASE_URL="http://localhost:3500"
AUTH_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
ADMIN_EMAILS=""
OPENAI_API_KEY=""
TURSO_DATABASE_URL=""
TURSO_AUTH_TOKEN=""
BLOB_READ_WRITE_TOKEN=""
```

Optional:
- `OPENAI_IMAGE_MODEL` (default: `gpt-image-2`)
- `OPENAI_RESPONSES_MODEL` (default: `gpt-4.1`)
- `BLOB_ACCESS_SIGNING_SECRET`
- `E2E_AUTH_BYPASS=1` (for e2e bypass flow)

## Local Development (Windows)
Install dependencies:

```powershell
npm install
```

Start Next dev directly:

```powershell
npm run dev
```

Preferred local restart flow (kills stale processes and starts `vercel dev`):

```powershell
powershell -File scripts\vercel-dev-restart.ps1
```

Custom port:

```powershell
powershell -File scripts\vercel-dev-restart.ps1 -Port 3500
```

## Turso CLI Usage
Run Turso commands through WSL via wrapper:

```powershell
npm run turso -- db list
```

Equivalent direct call example:

```powershell
wsl -d Ubuntu -e bash -ic "turso <command>"
```

## Scripts
- `npm run dev` - Next dev server on port `3500`
- `npm run build` - production build
- `npm run start` - production server on port `3500`
- `npm run typecheck` - TypeScript check
- `npm run lint` - Next lint
- `npm run test:e2e` - Playwright e2e tests
- `npm run vercel:dev:restart` - wrapper for restart script

## API Surface (Current)
- `GET /api/health`
- `GET /api/assets`
- `GET /api/prompt-templates`
- `GET /api/blob`
- `GET /api/chat/bootstrap`
- `GET|POST /api/chat/sessions`
- `GET /api/chat/sessions/:id/messages`
- `POST /api/chat/generate`
- `GET /api/chat/costs`
- `GET|POST /api/chat/class-media`
- `PATCH|DELETE /api/chat/class-media/:id`
- `POST /api/admin/prompt-templates`
- `PATCH|DELETE /api/admin/prompt-templates/:id`
- `GET /api/admin/costs/reconciliation`
- `GET|POST /api/auth/[...nextauth]`

## Deployment Notes (Vercel Hobby)
- This project deploys via GitHub integration; push triggers deploy.
- In this workstation, use `vercel.cmd` (not `vercel`) in PowerShell.
- Vercel Hobby limit for **Functions Created per Deployment** is now **framework-dependent**.
- For Next.js, Vercel can bundle dynamic code into fewer functions, so route file count is not always 1:1 with deployed functions.
- Validate actual function output from deployment details in Vercel UI.

## Security Notes
- Keep all secrets server-side only.
- Blob access is mediated through signed `/api/blob` URLs or authenticated access.
- Ownership checks are enforced server-side for coach-scoped data.

## Additional Docs
- PRD: `docs/social_media_creator_prd_v6.md`
- Coach tenant field note: `docs/coach_tenants-field-usage-note.md`
