
# Product Requirements Document (PRD)
# Social Media Creator App

Version: 0.3  
Date: 2026-05-22  
Status: Draft

---

# 1. Background & Ecosystem Context

The Social Media Creator app is part of a broader ecosystem of fitness-oriented applications centered around HIIT (High Intensity Interval Training) coaching, branding, and class management.

The ecosystem is composed of three interconnected applications:

1. HIIT Timer Portal
2. HIIT Timer
3. Social Media Creator

These applications share users, branding data, metadata, and media assets.

The primary users across the ecosystem are Fitness Coaches.

---

## 1.1 Ecosystem Overview

### HIIT Timer Portal

The HIIT Timer Portal is the central coach-management application.

Primary users:
- Fitness Coaches

Main responsibilities:
- Coach self-registration
- Coach profile management
- Coach business branding management
- Coach media asset management

The Portal maintains structured information about each coach and their business identity.

Examples of managed information:
- Coach name
- Biography
- Certifications
- Branding colors
- Logos
- Business descriptions
- Marketing messaging
- Profile images
- Promotional images
- Business-related metadata

This application is considered the authoritative source for coach profile data and branding assets.

---

### HIIT Timer App

The HIIT Timer app is the operational workout/training application.

Primary users:
- Fitness Coaches
- General users / trainees

Behavior differs depending on user type.

When used by coaches, the application supports:
- HIIT class management
- HIIT class history
- Workout/session tracking
- Session metadata recording

Examples of managed information:
- HIIT workout sessions
- Session dates/times
- Workout metadata
- Exercise structures
- Class history
- Instructor-associated activities

This application becomes an important source of coach activity data and workout history.

---

### Social Media Creator App

The Social Media Creator app is an AI-powered media generation platform intended exclusively for Fitness Coaches.

Primary users:
- Fitness Coaches only

The application consumes data from:
- HIIT Timer Portal
- HIIT Timer

The Social Media Creator does NOT manage or author the source data it consumes.

Instead, it acts as a secure consumer of:
- coach profile data
- coach branding metadata
- coach-owned assets/images
- HIIT class data
- workout history
- business information

The application uses these data sources together with GPT Image 2 to generate social media content.

The Social Media Creator SHALL:
- securely retrieve coach-owned data/assets
- allow coaches to conversationally refine prompts
- allow coaches to attach temporary personal media
- generate Instagram-ready content
- support iterative AI-assisted media creation

The application SHALL NOT:
- permanently store temporary user-uploaded media
- become the authoritative source of coach data
- manage coach profiles directly
- manage workout/class records directly

The Social Media Creator is therefore a specialized AI content-generation layer on top of the broader HIIT application ecosystem.

---

# 2. Overview

## Product Name
Social Media Creator

## Purpose

The Social Media Creator is a secure, AI-powered web application that enables authenticated Fitness Coaches to generate Instagram-ready social media content using:

- Their own coach profile data
- Their own business branding metadata
- Their own uploaded assets/images
- Their own HIIT class/workout history
- Admin-created prompt templates
- Admin-created sample content
- GPT Image 2 image generation

The application is designed as a separate React/Next.js application deployed on Vercel and integrated with the existing ecosystem:

- HIIT Timer Portal
- HIIT Timer
- Shared Turso database
- Shared Vercel Blob storage
- Shared Google Authentication

The Creator app is a read-only consumer of ecosystem data.

Coaches may:
- View their own assets
- Download their own assets
- Use their own assets as GenAI references
- Use HIIT class history as generation context
- Generate new Instagram images
- Download generated outputs

Coaches may NOT:
- Modify source assets from this app
- Modify authoritative coach data from this app
- Access other coaches' data
- Access raw storage directly

---


## Product Name
Social Media Creator

## Purpose

The Social Media Creator is a secure, AI-powered web application that enables authenticated users to generate Instagram-ready social media content using:

- Their own uploaded assets/images
- Their own metadata/content
- Admin-created prompt templates
- Admin-created sample content
- GPT Image 2 image generation

The application is designed as a separate React/Next.js application deployed on Vercel and integrated with the existing ecosystem:

- Existing user/data management app
- Shared Turso database
- Shared Vercel Blob storage
- Shared Google Authentication

The Creator app is read-only with respect to user-owned source assets.

Users may:
- View their own assets
- Download their own assets
- Use their own assets as GenAI references
- Generate new Instagram images
- Download generated outputs

Users may NOT:
- Modify source assets
- Access other users' data
- Access raw storage directly

---

# 2. Goals

## Primary Goals

1. Securely retrieve user-owned assets and metadata
2. Enable AI-assisted Instagram image generation
3. Provide reusable admin-curated prompt templates
4. Generate downloadable IG-ready content
5. Maintain strict user-level authorization
6. Support scalable future social media platforms

## Secondary Goals

1. Prompt versioning
2. Generation history
3. Asset tagging/search
4. Style presets
5. Future support for:
   - TikTok
   - LinkedIn
   - Facebook
   - X/Twitter
   - YouTube thumbnails

---

# 3. Non-Goals (Initial MVP)

The following are explicitly out of scope for MVP:

- Video generation
- Social publishing/post scheduling
- Team collaboration
- Asset editing
- Asset uploads
- Multi-tenant organizations
- Canva/Figma integration
- Fine-tuned models
- User-created prompt templates
- Mobile apps

---

# 4. Existing Ecosystem

## Existing Components

### Existing React/Vercel App
Responsibilities:
- User management
- Asset management
- Metadata management
- Authentication
- Authorization

### Vercel Blob Storage
Stores:
- User-uploaded assets
- Generated images
- Sample content

### Turso Database
Stores:
- Users
- Asset metadata
- Prompt templates
- Sample content metadata
- Generation history

---

# 5. High-Level Architecture

```text
+--------------------------------------------------+
|                User Browser                      |
|     React / Next.js Social Media Creator          |
+--------------------------------------------------+
                    |
                    v
+--------------------------------------------------+
|           Vercel Server Routes / APIs            |
|                                                  |
| - Authentication                                 |
| - Authorization                                  |
| - Prompt assembly                                |
| - Generation orchestration                       |
| - Blob access control                            |
+--------------------------------------------------+
          |               |               |
          v               v               v
+----------------+  +----------------+  +----------------+
|   Turso DB     |  | Vercel Blob    |  | OpenAI GPT     |
|                |  | Storage        |  | Image 2        |
+----------------+  +----------------+  +----------------+
```

---

# 6. Technology Stack

## Frontend
- React
- Next.js App Router
- TypeScript
- Tailwind CSS

## Backend
- Next.js Server Actions / API Routes
- Node.js runtime

## Authentication
- Google OAuth

## Authorization
- Server-side ownership validation

## Database
- Turso (SQLite/libSQL)

## Storage
- Vercel Blob Storage

## AI Generation
- GPT Image 2

## Hosting
- Vercel

---

# 7. Authentication & Authorization

## Authentication

Users authenticate using Google OAuth.

Session information is stored securely using:
- Secure cookies
- JWT/session middleware
- Server-side session validation

## Authorization Rules

Users may ONLY:
- Access their own metadata
- Access their own assets
- Access their own generations

### Canonical Coach Identity Key (Current Implementation Rule)

For this application version, coach ownership and coach authorization SHALL be matched by normalized email using:

`coach_tenants.owner_email`

Normalization rule:
- trim whitespace
- lowercase comparison

This normalized `owner_email` match SHALL be used as the canonical ownership key for:
- coach membership validation
- coach data retrieval
- coach metadata retrieval
- coach-owned asset retrieval
- prompt-context assembly scoping

Admin users may:
- Manage seed prompts
- Manage sample content
- Activate/deactivate prompt templates

## Core Rule

Every server-side query must validate ownership.

Example:

```sql
SELECT *
FROM assets
WHERE id = ?
AND lower(owner_email) = lower(?)
```

Authorization MUST NEVER rely on frontend filtering.

---

# 8. Data Model

## users

```sql
users
- id
- google_sub
- email
- role
- created_at
```

## assets

```sql
assets
- id
- user_id
- blob_path
- blob_url
- title
- description
- tags_json
- metadata_json
- created_at
```

## prompt_templates

```sql
prompt_templates
- id
- title
- platform
- format
- prompt_text
- default_options_json
- is_active
- created_by_admin_id
- created_at
```

## sample_content

```sql
sample_content
- id
- title
- image_blob_path
- metadata_json
- is_active
- created_at
```

## generations

```sql
generations
- id
- user_id
- prompt_template_id
- source_asset_ids_json
- final_prompt
- model
- format
- output_blob_path
- status
- error_message
- created_at
```

---

# 9. Asset Storage Design

## Blob Storage Structure

Recommended logical structure:

```text
/users/{user_id}/assets/
/users/{user_id}/generated/
/admin/samples/
```

## Blob Access

The browser SHALL NOT:
- Receive Blob write tokens
- Access private assets directly

The server SHALL:
- Validate ownership
- Generate secure download access
- Return signed/private URLs

---

# 10. AI Generation Pipeline

## Flow

```text
1. User selects assets
2. User selects prompt template
3. User configures options
4. API validates ownership
5. API retrieves metadata/assets
6. API assembles final prompt
7. API calls GPT Image 2
8. Output image stored in Blob
9. Generation record inserted in Turso
10. User receives downloadable result
```

---

# 11. Prompt System

## Seed Prompt Templates

Admin-managed templates.

Examples:
- Product showcase
- Quote post
- Before/after
- Promo campaign
- Announcement

## Prompt Composition

Final prompt assembled server-side.

Inputs:
- Admin prompt template
- User metadata
- User-selected assets
- Platform preset
- Style/tone options

## Example Prompt

```text
Create an Instagram square promotional image.

Use the provided user assets as visual references.

Style:
Minimal, modern, luxury aesthetic.

Constraints:
- Instagram-safe margins
- Legible typography
- No copyrighted logos
- High contrast
```

---

# 12. GPT Image 2 Integration

## Usage Model

GPT Image 2 SHALL be called server-side only.

The browser SHALL NOT:
- Receive OpenAI API keys
- Directly call OpenAI

## Generation Endpoint

```http
POST /api/generations
```

## Request Example

```json
{
  "promptTemplateId": "ig-product-post-v1",
  "assetIds": ["asset_1", "asset_2"],
  "format": "square",
  "options": {
    "tone": "premium",
    "cta": "Book now"
  }
}
```

## Response Example

```json
{
  "generationId": "gen_123",
  "status": "completed",
  "imageUrl": "https://..."
}
```

---

# 13. Instagram Formats

## Supported Formats

### Square
1080x1080

### Portrait
1080x1350

### Story
1080x1920

## Future Formats

- Carousel
- Reel covers
- Ad creatives

---

# 14. Frontend UX

## Main Screens

### Dashboard
- Recent generations
- Quick actions
- Prompt categories
- Coach context summary (brand/profile/workout/location metadata for signed-in coach)

### Asset Picker
- User-owned assets only
- Filtering/search
- Metadata display
- Coach-owned media previews available for selection during generation

### Prompt Template Gallery
- Admin templates
- Example previews

### Generation Configurator
- Format
- Tone/style
- CTA text
- Brand options
- Coach branding/workout/location context preloaded and available to prompt assembly

### Generation Results
- Preview
- Download
- Regenerate

### History
- Previous generations
- Re-download

## Post-Signin Retrieval Contract (Required)

After successful sign-in, the app SHALL retrieve signed-in coach context and present it in the UI before generation actions are enabled.

Minimum required retrieval scopes:
- coach business/profile branding metadata (from `coach_tenants`, scoped by normalized `owner_email`)
- coach-owned media assets for browsing/selection
- latest relevant workout/class metadata and location context for prompt enrichment
- active prompt templates

UI-ready behavior:
- if retrieval succeeds: show coach context + asset picker + generation controls
- if no assets exist: show empty asset state but keep generation available
- if coach context is missing or user is not matched to a coach tenant: show access denied state
- if partial non-critical metadata is unavailable: continue with available context and show non-blocking fallback messaging

---

# 15. Security Requirements

## Secrets

Secrets SHALL ONLY exist server-side:

```text
OPENAI_API_KEY
BLOB_READ_WRITE_TOKEN
TURSO_AUTH_TOKEN
```

## Security Rules

- No direct Blob browser writes
- Ownership validation on every query
- Rate limiting required
- Generation logging required
- Prompt sanitization required
- Admin routes protected

## Recommended Future Security

- Audit logs
- Abuse detection
- Moderation checks
- CAPTCHA
- Download watermarking

---

# 16. API Design

## Authenticated APIs

### GET /api/assets
Returns coach-owned assets for the signed-in coach (ownership scoped by normalized `owner_email`).

### GET /api/prompt-templates
Returns active admin templates.

### POST /api/generations
Creates generation job.

### GET /api/generations/:id
Returns generation details.

### GET /api/download/:id
Returns secure download access.

---

# 17. Deployment Architecture

## Vercel Projects

### Project A
Existing Management App

Responsibilities:
- Asset upload
- Metadata management
- User management

### Project B
Social Media Creator

Responsibilities:
- AI generation
- Asset retrieval
- Prompt system
- Download management

## Shared Resources

```text
Turso Database
Vercel Blob Store
Google OAuth
OpenAI API
```

---

# 18. Environment Variables

## Required

```text
OPENAI_API_KEY=
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
BLOB_READ_WRITE_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=
```

---

# 19. Vercel Deployment Considerations

## Hobby Plan (Initial)

Acceptable for:
- MVP
- Internal testing
- Low traffic

Potential limitations:
- Function execution limits
- Blob bandwidth
- AI workload spikes

## Recommended Upgrade Path

Upgrade to Vercel Pro when:
- Public launch occurs
- AI usage increases
- Blob traffic grows
- Concurrent users increase

---

# 20. Logging & Observability

## Required Logs

- User logins
- Generation requests
- Prompt template usage
- Blob download events
- Failed generations

## Recommended Monitoring

- Vercel Analytics
- Structured API logs
- AI cost tracking
- Generation latency tracking

---

# 21. Scalability Considerations

## Near-Term

- Queue generation jobs
- Cache metadata queries
- Paginate assets/history

## Long-Term

- Background workers
- CDN optimization
- Multi-model routing
- Async generation pipeline

---

# 22. Future Enhancements

## Phase 2

- Additional social platforms
- User prompt customization
- Brand kits
- Batch generation

## Phase 3

- Video generation
- AI copywriting
- Social scheduling
- Team collaboration

---

# 23. Risks

## Technical Risks

- AI latency
- Cost scaling
- Prompt unpredictability
- Blob bandwidth growth

## Security Risks

- Unauthorized asset access
- Prompt injection
- Token leakage
- Abuse/spam generation

---

# 24. Success Metrics

## MVP Metrics

- Successful generation rate
- Generation latency
- User retention
- Downloads per generation
- Prompt reuse rate

---

# 25. Open Questions

1. Should generations be asynchronous?
2. Should generated assets expire?
3. Should users edit prompts directly?
4. Should admin prompts support variables?
5. Should outputs be versioned?
6. Should generation costs be quota-limited?


---

# 26. Conversational Chatbot UX (Revised Core Requirement)

## Overview

The Social Media Creator SHALL primarily operate as a conversational chatbot-style interface rather than a traditional form-driven generation UI.

Users SHALL interact with the system through iterative multi-turn conversations.

The chatbot SHALL support:
- Prompt editing
- Prompt refinement
- Multi-round generation
- Media attachments
- Conversational feedback
- Regeneration cycles

The chatbot SHALL behave similarly to modern multimodal AI assistants.

---

# 27. Conversational Generation Workflow

## Primary Workflow

```text
1. User opens chatbot session
2. User uploads/selects media references
3. User writes or edits prompt
4. User submits prompt
5. App sends multimodal request to GPT Image 2
6. Generated image returned synchronously
7. Image displayed inline in chatbot
8. User iterates:
   - refine prompt
   - attach more media
   - request variations
   - adjust styles/layouts
9. Repeat until user is satisfied
10. User optionally downloads final image
```

---

# 28. Chatbot UI Requirements

## Core Components

### Chat Thread
Displays:
- User prompts
- Assistant responses
- Generated images
- Generation metadata
- Cost/token information

### Prompt Editor
Users SHALL be able to:
- Fully edit prompts
- Re-send prompts
- Fork prompt iterations
- Refine instructions conversationally

### Media Attachment Panel
Users SHALL be able to:
- Attach local images/files
- Attach previously-owned Blob assets
- Remove attachments before sending

### Inline Generated Media
Generated images SHALL:
- Render directly in chat
- Support download
- Support "Generate Variation"
- Support "Edit Prompt"

---

# 29. Stateless User Upload Handling

## Critical Requirement

Media attached directly by users during chatbot interactions SHALL NOT be permanently stored by the application.

## Temporary Processing Flow

```text
User Browser
    â†“
Temporary in-memory/server upload handling
    â†“
Forward to GPT Image 2 request
    â†“
Request completed
    â†“
Temporary buffers discarded
```

## Rules

The application SHALL NOT:
- Persist ad hoc uploads to Blob storage
- Persist temporary uploads to Turso
- Create permanent references to temporary uploads

The application MAY:
- Temporarily buffer uploads during request processing
- Maintain ephemeral request state during active generation

## Exception

Previously existing user-owned assets already stored in Blob MAY still be attached and referenced.

---

# 30. Generated Asset Handling (Revised)

## Critical Requirement

Generated images SHALL NOT be permanently stored by the application.

## Flow

```text
GPT Image 2
    â†“
App Server
    â†“
Returned directly to chat UI
    â†“
User optionally downloads image locally
```

## Rules

The application SHALL NOT:
- Store generated images in Blob
- Persist generated images in database
- Maintain downloadable history

The application MAY:
- Keep temporary response buffers during active session
- Cache short-lived in-memory responses if necessary

## Consequence

Generation history SHALL store:
- prompts
- metadata
- token/cost usage

But SHALL NOT store:
- generated image binaries

---

# 31. Synchronous Image Generation

## Requirement

All image generation SHALL initially be synchronous.

The user SHALL wait inline within the chatbot session for generation completion.

## Expected UX

```text
User submits prompt
    â†“
Chatbot shows loading state
    â†“
GPT Image 2 returns result
    â†“
Image rendered immediately in chat
```

## Future Evolution

Async queued jobs MAY be added later if:
- latency becomes excessive
- generation complexity increases
- video generation is added

---

# 32. Cost & Token Transparency

## Requirement

The application SHALL expose usage and estimated cost information to users for every interaction.

## Per Interaction Display

Each chatbot response SHALL display:
- input tokens
- output tokens
- estimated cost
- generation model used
- generation duration

## Example UI

```text
GPT Image 2
Input Tokens: 3,245
Output Tokens: 1,102
Estimated Cost: $0.083
Generation Time: 12.4s
```

## Database Tracking

Suggested table:

```sql
interaction_usage
- id
- user_id
- session_id
- request_type
- model
- input_tokens
- output_tokens
- estimated_cost
- duration_ms
- created_at
```

---

# 33. Chat Session Architecture

## Session Model

A chatbot session represents an iterative creative workflow.

## Suggested Table

```sql
chat_sessions
- id
- user_id
- title
- created_at
- updated_at
```

## Suggested Messages Table

```sql
chat_messages
- id
- session_id
- role
- content
- attachments_json
- generation_metadata_json
- created_at
```

---

# 34. Revised Architecture

```text
+---------------------------------------------------+
|              Chatbot React UI                     |
|                                                   |
| - conversational thread                           |
| - prompt editing                                  |
| - media attachments                               |
| - inline generated images                         |
| - cost/token display                              |
+---------------------------------------------------+
                    |
                    v
+---------------------------------------------------+
|           Next.js Server/API Layer                |
|                                                   |
| - Google Auth                                     |
| - Authorization                                   |
| - multimodal request assembly                     |
| - temporary upload handling                       |
| - GPT Image 2 orchestration                       |
+---------------------------------------------------+
           |                    |
           v                    v
+------------------+    +----------------------+
| Turso Database   |    | OpenAI GPT Image 2   |
|                  |    |                      |
| sessions         |    | multimodal image gen|
| prompts          |    | synchronous response |
| usage tracking   |    +----------------------+
| metadata         |
+------------------+
           |
           v
+------------------+
| Vercel Blob      |
|                  |
| existing assets  |
| admin samples    |
| user-owned refs  |
+------------------+
```

---

# 35. Revised Security Model

## User Uploads

Temporary uploads SHALL:
- never persist
- never receive Blob identifiers
- never become public URLs

## Existing Assets

Previously stored user assets SHALL:
- remain protected by ownership validation
- be retrievable read-only
- be attachable into prompts

## Generated Outputs

Generated outputs SHALL:
- remain ephemeral
- exist only within active UI response lifecycle
- be downloadable by user
- not persist server-side

---

# 36. Recommended OpenAI Interaction Pattern

## Multimodal Request

The application SHALL send:
- textual prompt
- optional attached user images
- optional existing Blob-hosted images
- generation instructions

to GPT Image 2 in a single multimodal request.

## Important Rule

All OpenAI API calls SHALL occur server-side only.

The browser SHALL NEVER:
- access OpenAI keys
- directly invoke OpenAI APIs

---

# 37. Recommended UX Evolution

## MVP
- synchronous generation
- ephemeral outputs
- no quotas
- conversational iteration

## Later
- saved favorites
- prompt versioning
- generation bookmarking
- async jobs
- collaborative sessions
- reusable user templates


---

# 38. Existing Core Data Sources (Integrated Schema Context)

The Social Media Creator consumes and derives context from several existing core tables managed by the other applications in the HIIT ecosystem.

These tables are authoritative sources owned by the existing applications.

The Social Media Creator SHALL treat them as read-only data sources.

---

## 38.1 coach_tenants

This table represents the core Fitness Coach business/profile entity managed by the HIIT Timer Portal application. îˆ€fileciteîˆ‚turn0file2îˆ

This is the primary branding and business-context source used during AI media generation.

### Key Fields

```sql
coach_tenants
- id
- slug
- owner_google_sub
- owner_email
- business_name
- coach_name
- bio
- logo_url
- coach_photo_url
- qr_code_url
- status
- theme_primary_color
- theme_secondary_color
- brand_headline
- coach_header_image_url
- ig_username
- tiktok_username
- header_tagline
```

### Important Branding Fields

The following fields are especially important for AI generation context:

```text
business_name
coach_name
bio
brand_headline
header_tagline
theme_primary_color
theme_secondary_color
logo_url
coach_photo_url
coach_header_image_url
ig_username
```

### Usage in Social Media Creator

These fields SHALL be used to:
- personalize prompts
- reinforce coach branding
- maintain visual identity consistency
- generate branded Instagram content
- generate coach-specific marketing material

Example usage:
- inject business tone into prompts
- apply brand colors
- include coach profile imagery
- generate CTA-oriented IG posts

---

## 38.2 coach_hiit_classes

This table represents historical HIIT workout/class executions managed by the HIIT Timer application. îˆ€fileciteîˆ‚turn0file1îˆ

This table is a major contextual source for dynamic social content generation.

### Key Fields

```sql
coach_hiit_classes
- id
- tenant_id
- coach_google_sub
- timer_id
- timer_name_at_run
- timer_snapshot_json
- station_workout_types_json
- total_per_station_ms
- total_work_ms
- category
- complete
- ran_at
- class_date
- start_time
- end_time
- location_id
- location_label_at_run
```

### Purpose

This table allows the Social Media Creator to generate:
- workout recap posts
- class promotion graphics
- coach activity highlights
- motivational workout media
- branded workout summaries

### timer_snapshot_json

The `timer_snapshot_json` field stores a full snapshot of the HIIT timer/workout configuration used during class execution.

Example:

```json
{
  "id": "b9343ce7-cc1f-4946-ac5a-eec3ebe360bf",
  "name": "Sweat Tsunami",
  "stationCount": 2,
  "stationWorkoutTypes": [
    "pushups",
    "pullups"
  ],
  "roundsPerStation": 2,
  "workMinutes": 0,
  "workSeconds": 10,
  "restMinutes": 0,
  "restSeconds": 10,
  "stationTransitionMinutes": 0,
  "stationTransitionSeconds": 5,
  "startStationWorkManually": false,
  "warmupEnabled": false,
  "warmupMinutes": 0,
  "warmupSeconds": 0,
  "cooldownEnabled": false,
  "cooldownMinutes": 0,
  "cooldownSeconds": 0,
  "category": "GENERAL",
  "createdAt": "2026-05-21T14:40:14.719Z",
  "updatedAt": "2026-05-21T14:40:48.642Z"
}
```

### AI Generation Usage

The Social Media Creator MAY use this snapshot data to generate:

- workout-specific promotional graphics
- â€œWorkout of the Dayâ€ images
- workout summaries
- class recap visuals
- intensity-focused social content
- exercise-highlight content
- coach activity storytelling

Examples:
- â€œTodayâ€™s Sweat Tsunami workoutâ€
- â€œ2-station HIIT blastâ€
- â€œPushups + Pullups challengeâ€
- â€œCoach-led HIIT session recapâ€

### Important Derived Metadata

Useful derived context includes:

```text
stationCount
stationWorkoutTypes
roundsPerStation
category
work/rest timing
warmup/cooldown settings
```

These attributes can be transformed into:
- textual captions
- AI prompt variables
- visual workout themes
- dynamic workout cards

---

## 38.3 coach_class_locations

This table represents physical or business locations associated with coach classes. îˆ€fileciteîˆ‚turn0file0îˆ

### Key Fields

```sql
coach_class_locations
- id
- tenant_id
- business_name
- location_name
- logo_url
- sort_order
- is_default
```

### Usage in Social Media Creator

Location information MAY be used to:
- generate location-aware social media content
- promote local classes
- personalize class recaps
- reinforce local branding

Example:
- â€œTonight at Downtown Studioâ€
- â€œSaturday HIIT session at BurnFit Vancouverâ€

---

# 39. Cross-App Data Ownership Model

## HIIT Timer Portal Owns

```text
coach_tenants
coach branding
coach profile assets
business metadata
```

## HIIT Timer Owns

```text
coach_hiit_classes
workout history
class execution records
location references
```

## Social Media Creator Consumes

```text
branding data
coach assets
workout history
class metadata
location metadata
```

The Social Media Creator SHALL remain a consumer-only application.

It SHALL NOT:
- mutate source records
- update workout history
- modify coach profile data
- manage class locations

All source data modifications SHALL continue to occur within their authoritative applications.

---

# 40. AI Context Assembly Strategy

The Social Media Creator SHALL dynamically assemble AI prompts from multiple ecosystem sources.

## Example Prompt Context Sources

### Coach Branding Context

From `coach_tenants`:
- business name
- coach biography
- brand colors
- Instagram username
- coach images

### Workout Context

From `coach_hiit_classes`:
- workout title
- workout category
- station count
- workout types
- duration
- workout intensity

### Location Context

From `coach_class_locations`:
- location name
- business location branding

### User Attachments

From active chatbot session:
- temporary personal uploads
- optional reference imagery

---

# 41. Example AI Generation Scenario

Example:

A Fitness Coach completes a HIIT class called:

```text
Sweat Tsunami
```

The class contains:
- pushups
- pullups
- 2 stations
- high-intensity intervals

The Social Media Creator retrieves:
- coach branding
- coach images
- business colors
- workout metadata
- optional temporary uploads

The system then constructs a multimodal GPT Image 2 request to generate:

```text
Instagram promotional workout recap image
```

Possible generated themes:
- intense HIIT energy
- branded coach identity
- workout challenge visuals
- motivational CTA graphics


---

# 42. Image Retrieval & Multimodal Asset Strategy

The following design decisions have been validated and adopted as core architectural principles for the Social Media Creator application.

These decisions improve:
- security
- scalability
- UX performance
- GPT Image 2 interoperability
- storage isolation

---

## 42.1 Thumbnail-First Asset Browsing

### Requirement

Coach-owned assets retrieved by the Social Media Creator SHALL be displayed to the user as thumbnails/small preview images.

The application SHALL NOT initially load full-resolution assets into the UI.

## Purpose

This improves:
- UI responsiveness
- bandwidth efficiency
- asset browsing experience
- mobile usability
- Blob traffic optimization

## Recommended Behavior

### Asset Gallery

The chatbot-side asset picker SHOULD display:
- thumbnail image
- asset title
- tags/metadata
- upload date
- branding indicators

### Lazy Loading

The UI SHOULD:
- lazy-load thumbnails
- paginate large asset collections
- defer full-resolution access until needed

## Suggested Thumbnail Strategy

### Option A (Preferred)
Store dedicated thumbnails in Blob.

```text
/users/{user_id}/assets/
users/{user_id}/assets/thumbnails/
```

### Option B
Generate thumbnails dynamically through image transformation/CDN pipeline.

---

## 42.2 LLM Asset Access via Signed URLs

### Critical Requirement

The application SHALL NOT send raw Blob binary/image payloads directly to GPT Image 2.

Instead, the application SHALL:

1. Retrieve authorized Blob asset references
2. Generate short-lived private signed URLs
3. Send signed URLs to GPT Image 2

## Flow

```text
Coach selects existing asset
    â†“
Server validates ownership
    â†“
Server generates short-lived signed URL
    â†“
Signed URL passed to GPT Image 2
```

## Signed URL Requirements

Signed URLs SHOULD:
- be private
- expire quickly
- be generated server-side only

Recommended expiration:
- 1â€“5 minutes

The browser SHALL NEVER:
- receive Blob read/write tokens
- generate signed URLs directly

---

## 42.3 Temporary User Upload Strategy (Revised)

### Revised Requirement

When coaches attach local/personal images during chatbot interactions, the application SHALL temporarily store these uploads in Vercel Blob Storage.

The application SHALL then:
1. Generate short-lived signed URLs
2. Send those signed URLs to GPT Image 2

## Important Clarification

Temporary uploads SHALL:
- exist only for active generation workflows
- not become part of permanent coach asset libraries
- not appear in normal asset browsing
- not persist indefinitely

---

## 42.4 Temporary Upload Flow

```text
Coach selects local image
    â†“
Browser uploads temporarily to server
    â†“
Server uploads to temporary Blob path
    â†“
Server generates short-lived signed URL
    â†“
Signed URL passed to GPT Image 2
    â†“
Generation completes
    â†“
Temporary upload scheduled for cleanup/deletion
```

---

## 42.5 Temporary Blob Storage Namespace

Recommended namespace:

```text
/temp/{session_id}/
```

Example:

```text
/temp/chat_abc123/upload_001.jpg
```

## Cleanup Rules

Temporary uploads SHOULD:
- expire automatically
- be deleted after generation
- have TTL-based cleanup jobs

Recommended TTL:
- 1 hour maximum

---

## 42.6 Unified Multimodal Asset Pipeline

### Existing Coach Assets

```text
Permanent Blob asset
    â†“
Signed URL
    â†“
GPT Image 2
```

### Temporary User Uploads

```text
Temporary Blob asset
    â†“
Signed URL
    â†“
GPT Image 2
```

This creates a consistent multimodal processing pipeline.

---

# 43. Revised Generated Asset Handling

Generated outputs SHALL NOT become permanent application assets.

However, the system MAY temporarily store generated outputs in Blob Storage during active chatbot interaction lifecycles.

Example flow:

```text
GPT Image 2 response
    â†“
Temporary Blob storage
    â†“
Short-lived signed download URL
    â†“
Displayed in chatbot UI
    â†“
Coach optionally downloads
    â†“
Temporary cleanup/deletion
```

---

# 44. Recommended Blob Lifecycle Policies

## Permanent Coach Assets

Retention:
- permanent

Namespace:
```text
/users/{user_id}/assets/
```

## Temporary Uploads

Retention:
- 1 hour

Namespace:
```text
/temp/{session_id}/uploads/
```

## Temporary Generated Outputs

Retention:
- 1 hour

Namespace:
```text
/temp/{session_id}/generated/
```

---

# 45. Revised Chatbot UX with Asset Previews

The chatbot interface SHALL support integrated visual asset workflows.

## Existing Coach Assets

Displayed as:
- thumbnails
- selectable media chips
- metadata cards

## Temporary Uploads

Displayed as:
- local preview thumbnails
- upload-progress indicators
- removable attachments

## Generated Outputs

Displayed inline as:
- generated image previews
- downloadable cards
- variation/regenerate actions

