# OmniReply AI

Backend + frontend multi-tenant WhatsApp SaaS with delayed reply automation, templates, and tenant-scoped flows.

## Stack

- Backend: Node.js + TypeScript + Express
- Frontend: Next.js
- Database: Supabase Postgres
- Runtime data access: Supabase JS
- Schema source of truth: Prisma schema + SQL migrations
- WhatsApp transport: Baileys

## Environment Variables

### Local (`.env`)
Copy `.env.example` to `.env` and set:

Required backend variables:
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` as an alternative alias if your Railway project uses that name instead of `SUPABASE_SERVICE_KEY`
- `SUPABASE_JWT_SECRET`
- `JWT_SECRET`
- `GEMINI_API_KEY`
- `WHATSAPP_SESSION_ENC_KEY`
- `WEBHOOK_SECRET`
- `CORS_ORIGIN`

Recommended backend variables:
- `TRUST_PROXY=0` locally
- `ENABLE_PENDING_REPLY_WORKER=true`
- `ENABLE_WHATSAPP_RECONNECT_ON_BOOT=true`
- `PENDING_REPLY_POLL_INTERVAL_MS=15000`
- `GEMINI_MODEL=gemini-1.5-flash`
- `BODY_LIMIT=1mb`

Frontend variables:
- `NEXT_PUBLIC_API_URL=http://localhost:3000`
- `BACKEND_API_URL=http://localhost:3000` if using rewrites

Notes:
- `DATABASE_URL` must start with `postgresql://` or `postgres://`.
- Do not put backend secrets into Vercel frontend env vars.
- Do not set `PORT` manually on Railway.

### Railway (backend)
Set these in Railway Variables:
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` if you prefer that env name instead of `SUPABASE_SERVICE_KEY`
- `SUPABASE_JWT_SECRET`
- `JWT_SECRET`
- `GEMINI_API_KEY`
- `WHATSAPP_SESSION_ENC_KEY`
- `WEBHOOK_SECRET`
- `CORS_ORIGIN=https://omni-reply-ai.vercel.app,http://localhost:3000,http://localhost:5173`
- `TRUST_PROXY=1`
- `ENABLE_PENDING_REPLY_WORKER=true`
- `ENABLE_WHATSAPP_RECONNECT_ON_BOOT=true`
- `PENDING_REPLY_POLL_INTERVAL_MS=15000`

### Vercel (frontend)
Set these in Vercel:
- `NEXT_PUBLIC_API_URL=https://omnireply-ai-production.up.railway.app`
- `BACKEND_API_URL=https://omnireply-ai-production.up.railway.app` if you use rewrites

## Local Development

Backend:
```bash
npm install
npm run dev
```

Frontend:
```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Default worker model:
- `npm run dev` starts the API and also starts the embedded pending-reply worker.
- This is the recommended mode with Baileys because the same process owns the WhatsApp socket and sends delayed replies.

Optional standalone worker:
```bash
npm run dev:worker
npm run worker
```

Important:
- Do not run both the embedded worker and a separate worker against the same live Baileys sessions unless you deliberately move WhatsApp socket ownership to the worker process.
- With the current Baileys architecture, the recommended Railway deployment is a single web service with the embedded worker enabled.

## Database Setup

Fresh setup:
- Run [`schema.sql`](schema.sql) in the Supabase SQL editor.

Incremental migration:
- Run [`prisma/migrations/20260311_whatsapp_automation/migration.sql`](prisma/migrations/20260311_whatsapp_automation/migration.sql).

Prisma connectivity:
```bash
npm run db:check
npm run db:pull
```

## Row Level Security

Apply RLS policies for tenant-scoped tables:
- Run [`security/rls_policies.sql`](security/rls_policies.sql) in the Supabase SQL editor.

This includes:
- `Tenant`
- `User`
- `WhatsAppSession`
- `MessageLog`
- `KnowledgeEntry`
- `Lead`
- `Broadcast`
- `DailyStat`
- `Template`
- `AutomationFlow`
- `FlowTrigger`
- `FlowCondition`
- `FlowAction`
- `TenantAutomationSettings`
- `OwnerActivity`
- `PendingReply`

## WhatsApp Automation Configuration

Automation settings API:
- `GET /api/settings`
- `PUT /api/settings`

Automation CRUD:
- `GET /api/automations`
- `POST /api/automations`
- `PUT /api/automations/:id`
- `DELETE /api/automations/:id`

Templates CRUD:
- `GET /api/templates`
- `POST /api/templates`
- `PUT /api/templates/:id`
- `DELETE /api/templates/:id`

Important runtime note:
- `POST /api/templates`, `POST /api/automations`, `PUT /api/settings`, and `PUT /api/tenant/settings` write through the backend service-role client.
- If these fail in production, verify Railway has `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` set.
- Backend failures return JSON with `error`, `details`, and `requestId`; the frontend now surfaces those values directly.

Heartbeat:
- `POST /api/heartbeat`

Example delayed mode:
```json
{
  "autoReplyMode": "DELAYED",
  "replyDelayMinutes": 20,
  "offlineGraceMinutes": 10,
  "workingHours": null,
  "enableHumanOverride": true,
  "humanOverrideMinutes": 30
}
```

Reply modes:
- `OFF`: never auto-reply
- `DELAYED`: always queue reply after the configured delay
- `OFFLINE_ONLY`: queue immediately, but only send when the owner is offline
- `HYBRID`: apply the delay and still require the owner to be offline when the job runs

## Tests

Run all tests:
```bash
npm test
```

Focused integration test for settings/templates/automations:
```bash
npx vitest run tests/integration/admin-config-routes.test.ts --reporter=verbose
```

Run automation tests only:
```bash
npm run test:automation
```

Run security tests only:
```bash
npm run test:security
```

Build backend:
```bash
npm run build
```

Build frontend:
```bash
npm --prefix frontend run build
```
