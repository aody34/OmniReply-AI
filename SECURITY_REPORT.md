# OmniReply AI Security Report

## Scope
- Backend routes and middleware in `src/`
- Supabase/Postgres access in `src/lib/`
- Multi-tenant schema in [`schema.sql`](/home/Berkamp34/Desktop/projects/OmniReply-AI/schema.sql:10) and [`prisma/schema.prisma`](/home/Berkamp34/Desktop/projects/OmniReply-AI/prisma/schema.prisma:11)
- Deployment and env requirements in [`README.md`](/home/Berkamp34/Desktop/projects/OmniReply-AI/README.md:7) and [`.env.example`](/home/Berkamp34/Desktop/projects/OmniReply-AI/.env.example:1)

## A. Security Boundary

### Authentication and tenant resolution
- JWT authentication happens in [`src/middleware/auth.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/middleware/auth.ts:81). Tokens are verified with `HS256`, and expired or malformed tokens return `401`.
- `tenantId` is derived from the JWT claim in [`src/middleware/auth.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/middleware/auth.ts:17). It is not taken from headers, query params, or request bodies.
- Protected request flows now attach a request-scoped Supabase client in [`src/middleware/request-db.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/middleware/request-db.ts:14), backed by the short-lived row-access token minted in [`src/lib/request-db.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/request-db.ts:42).

### Route inventory

| Route / flow | Auth required | TenantId enforced | DB tables touched |
| --- | --- | --- | --- |
| `POST /api/auth/register` | No | No client tenant input; server creates tenant UUID | `Tenant`, `User` via [`src/routes/auth.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/auth.ts:19) |
| `POST /api/auth/login` | No | User record returns `tenantId`; token signed server-side | `User` via [`src/routes/auth.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/auth.ts:97) |
| `GET /api/auth/me` | Yes | `id = req.auth.userId` and `tenantId = req.auth.tenantId` | `User`, `Tenant` via [`src/routes/auth-profile.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/auth-profile.ts:12) |
| `POST /api/whatsapp/connect` | Yes, owner/admin | `tenantId` comes only from JWT | `WhatsAppSession` plus encrypted session files via [`src/routes/whatsapp.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/whatsapp.ts:22) and [`src/lib/whatsapp/connector.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/whatsapp/connector.ts:46) |
| `POST /api/whatsapp/disconnect` | Yes, owner/admin | `tenantId` comes only from JWT | `WhatsAppSession` plus encrypted session cleanup via [`src/routes/whatsapp.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/whatsapp.ts:37) |
| `GET /api/whatsapp/status` | Yes | Reads in-memory status by `req.auth.tenantId` | No DB in [`src/routes/whatsapp.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/whatsapp.ts:52) |
| `GET /api/whatsapp/qr` | Yes | Reads in-memory QR by `req.auth.tenantId` | No DB in [`src/routes/whatsapp.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/whatsapp.ts:60) |
| Baileys inbound message flow | Internal socket, not HTTP | `tenantId` passed from connected session | `MessageLog`, `Lead`, `DailyStat`, `Tenant`, `KnowledgeEntry` via [`src/lib/whatsapp/connector.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/whatsapp/connector.ts:141) and [`src/lib/ai/handler.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/ai/handler.ts:18) |
| `GET /api/knowledge` | Yes | `.eq('tenantId', req.auth.tenantId)` | `KnowledgeEntry` via [`src/routes/knowledge.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/knowledge.ts:18) |
| `POST /api/knowledge` | Yes, owner/admin | Insert uses JWT tenant; body `tenantId` rejected | `KnowledgeEntry` via [`src/routes/knowledge.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/knowledge.ts:44) |
| `PUT /api/knowledge/:id` | Yes, owner/admin | Record lookup and update both filter `id` + `tenantId` | `KnowledgeEntry` via [`src/routes/knowledge.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/knowledge.ts:83) |
| `DELETE /api/knowledge/:id` | Yes, owner/admin | Record lookup and delete both filter `id` + `tenantId` | `KnowledgeEntry` via [`src/routes/knowledge.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/knowledge.ts:131) |
| `GET /api/leads` | Yes | `.eq('tenantId', req.auth.tenantId)` | `Lead` via [`src/routes/leads.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/leads.ts:16) |
| `POST /api/broadcast` | Yes, owner/admin | Insert uses JWT tenant; body `tenantId` rejected | `Broadcast` via [`src/routes/broadcast.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/broadcast.ts:18) |
| `GET /api/broadcast` | Yes | `.eq('tenantId', req.auth.tenantId)` | `Broadcast` via [`src/routes/broadcast.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/broadcast.ts:74) |
| `GET /api/broadcast/:id` | Yes | `.eq('id', id).eq('tenantId', req.auth.tenantId)` | `Broadcast` via [`src/routes/broadcast.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/broadcast.ts:103) |
| `GET /api/tenant/settings` | Yes | `.eq('id', req.auth.tenantId)` | `Tenant` via [`src/routes/tenant.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/tenant.ts:18) |
| `PUT /api/tenant/settings` | Yes, owner/admin | `.eq('id', req.auth.tenantId)`; body `tenantId` rejected | `Tenant` via [`src/routes/tenant.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/tenant.ts:41) |
| `GET /api/tenant/dashboard` | Yes | Tenant filters on all DB reads | `Tenant`, `DailyStat`, `Lead` via [`src/routes/tenant.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/tenant.ts:73) |
| `GET /api/tenant/analytics` | Yes | `.eq('tenantId', req.auth.tenantId)` | `DailyStat` via [`src/routes/tenant.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/tenant.ts:109) |

### Absent route surfaces
- No `users/staff/admin` route module exists in `src/routes/`.
- No HTTP WhatsApp webhook endpoint exists today. Inbound messages are handled over the Baileys socket path, not via a public webhook route.

## B. RLS Bypass Review

### Raw service-role client locations
- The raw Supabase service-role client is defined in [`src/lib/db.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/db.ts:38). It bypasses RLS by design.
- No `SUPABASE_SERVICE_KEY` reference was found under `frontend/` during this audit.
- Public bootstrap auth still uses it in [`src/routes/auth.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/auth.ts:19) and [`src/routes/auth.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/auth.ts:97). This is acceptable because registration and login happen before a user request can be scoped by tenant RLS.
- Internal backend-only flows also still use it:
  - [`src/lib/whatsapp/connector.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/whatsapp/connector.ts:87)
  - [`src/lib/ai/handler.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/ai/handler.ts:28)
  - [`src/lib/ai/rag.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/ai/rag.ts:24)
  - [`src/lib/crm/lead-capture.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/crm/lead-capture.ts:21)
  - [`src/lib/broadcast/broadcaster.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/broadcast/broadcaster.ts:16)
  - [`src/lib/amniga/anti-ban.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/amniga/anti-ban.ts:48)

### Decision
- `HIGH RISK` was present when normal authenticated API routes imported the raw service-role client directly.
- That path is now fixed. Protected request routes use the request-scoped client from [`src/lib/request-db.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/request-db.ts:64), attached by [`src/middleware/request-db.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/middleware/request-db.ts:14).
- Internal/background flows still use service-role access. That is acceptable only because their `tenantId` is derived server-side from the authenticated session or the persisted WhatsApp session state, not from client input.

## C. App-Layer Tenant Isolation Review

### Per-table isolation status
- `Tenant`: tenant settings, dashboard, and analytics all read/update only `req.auth.tenantId` in [`src/routes/tenant.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/tenant.ts:18).
- `User`: `/api/auth/me` filters on both user ID and tenant ID in [`src/routes/auth-profile.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/auth-profile.ts:17).
- `WhatsAppSession`: connector reads and writes by `tenantId` only in [`src/lib/whatsapp/connector.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/whatsapp/connector.ts:87).
- `MessageLog`: inbound/outbound inserts always include server-side `tenantId` in [`src/lib/ai/handler.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/ai/handler.ts:28) and [`src/lib/broadcast/broadcaster.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/broadcast/broadcaster.ts:68).
- `KnowledgeEntry`: reads, updates, and deletes all filter on `tenantId`, and write handlers reject client-supplied `tenantId` in [`src/routes/knowledge.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/knowledge.ts:48).
- `Lead`: the public list route filters on `tenantId` in [`src/routes/leads.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/leads.ts:26); background capture writes use server-side `tenantId` in [`src/lib/crm/lead-capture.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/crm/lead-capture.ts:43).
- `Broadcast`: request handlers scope on `tenantId` in [`src/routes/broadcast.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/broadcast.ts:79), and async worker updates include both `id` and `tenantId` in [`src/lib/broadcast/broadcaster.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/broadcast/broadcaster.ts:31).
- `DailyStat`: tenant analytics read by `tenantId` in [`src/routes/tenant.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/tenant.ts:118), and background updates scope on `id` plus `tenantId` in [`src/lib/ai/handler.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/ai/handler.ts:136), [`src/lib/crm/lead-capture.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/crm/lead-capture.ts:62), and [`src/lib/broadcast/broadcaster.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/broadcast/broadcaster.ts:108).

### Client-controlled tenant identifiers
- No audited tenant route accepts `tenantId` from query params or headers.
- Mutating tenant-owned request routes now reject top-level body `tenantId` in [`src/lib/request-db.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/request-db.ts:82), enforced in:
  - [`src/routes/knowledge.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/knowledge.ts:48)
  - [`src/routes/broadcast.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/broadcast.ts:22)
  - [`src/routes/tenant.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/tenant.ts:44)

## D. Database Isolation and RLS

### Schema status
- Tenant-owned tables in [`schema.sql`](/home/Berkamp34/Desktop/projects/OmniReply-AI/schema.sql:10) all have `tenantId` foreign keys and supporting indexes.
- Prisma reflects the same tenant-owned tables and indexes in [`prisma/schema.prisma`](/home/Berkamp34/Desktop/projects/OmniReply-AI/prisma/schema.prisma:11).
- `schema.sql` still does not enable RLS by itself. The live database is only protected by RLS after you run [`security/rls_policies.sql`](/home/Berkamp34/Desktop/projects/OmniReply-AI/security/rls_policies.sql:1).

### How to validate and apply RLS
1. Open Supabase SQL Editor.
2. Run [`security/rls_policies.sql`](/home/Berkamp34/Desktop/projects/OmniReply-AI/security/rls_policies.sql:1).
3. Re-run the validation queries at the top of the same file:
   - Row-security flags: [`security/rls_policies.sql`](/home/Berkamp34/Desktop/projects/OmniReply-AI/security/rls_policies.sql:8)
   - Policy definitions: [`security/rls_policies.sql`](/home/Berkamp34/Desktop/projects/OmniReply-AI/security/rls_policies.sql:36)
4. Confirm every existing tenant-owned table reports `rowsecurity = true` and a `tenant isolate` policy.

## E. WhatsApp QR and Message Security

### Safe now
- QR connect and disconnect require auth plus `owner/admin` role in [`src/routes/whatsapp.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/whatsapp.ts:22) and [`src/routes/whatsapp.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/whatsapp.ts:37).
- WhatsApp connect endpoints are rate-limited in [`src/middleware/rate-limit.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/middleware/rate-limit.ts:21) and applied in [`src/routes/whatsapp.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/whatsapp.ts:22).
- Baileys session files are now encrypted at rest with AES-256-GCM in [`src/lib/whatsapp/session-store.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/whatsapp/session-store.ts:52).
- Production now fails closed if `WHATSAPP_SESSION_ENC_KEY` is missing in [`src/lib/whatsapp/session-store.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/whatsapp/session-store.ts:43).
- QR output is no longer printed to the terminal because [`printQRInTerminal`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/whatsapp/connector.ts:64) is `false`.
- Session material is deleted on logout/disconnect in [`src/lib/whatsapp/connector.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/whatsapp/connector.ts:119) and [`src/lib/whatsapp/connector.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/whatsapp/connector.ts:171).

### Residual gap
- There is no active HTTP webhook route in this repo, so there is nothing live to attach signature verification to today.
- A reusable HMAC verifier for future provider-style webhooks now exists in [`src/middleware/webhook.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/middleware/webhook.ts:32). Any future webhook route must use `rawWebhookBody` plus `verifyWebhookSignature`.

## Findings

1. `HIGH` Fixed: authenticated tenant routes previously used a raw service-role client and could bypass RLS entirely. They now require the request-scoped client in [`src/middleware/request-db.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/middleware/request-db.ts:14) and [`src/lib/request-db.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/request-db.ts:64).
2. `HIGH` Open until applied: database RLS is not guaranteed until [`security/rls_policies.sql`](/home/Berkamp34/Desktop/projects/OmniReply-AI/security/rls_policies.sql:66) is executed against the live Supabase project. [`schema.sql`](/home/Berkamp34/Desktop/projects/OmniReply-AI/schema.sql:10) does not enable it.
3. `HIGH` Fixed: WhatsApp/Baileys auth files were stored plaintext on disk. They are now encrypted at rest in [`src/lib/whatsapp/session-store.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/whatsapp/session-store.ts:108).
4. `HIGH` Fixed: QR codes were printed to server output and could leak through logs. Terminal QR printing is disabled in [`src/lib/whatsapp/connector.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/whatsapp/connector.ts:58).
5. `MEDIUM` Fixed: WhatsApp connect endpoints lacked rate limiting. Limits now exist in [`src/middleware/rate-limit.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/middleware/rate-limit.ts:21) and [`src/routes/whatsapp.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/routes/whatsapp.ts:22).
6. `MEDIUM` Fixed: tenant-owned write routes could silently accept a client body containing `tenantId`. Those writes now fail with `400` via [`src/lib/request-db.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/request-db.ts:82).
7. `MEDIUM` Residual: internal/background flows still use the service-role client in [`src/lib/ai/handler.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/ai/handler.ts:28), [`src/lib/crm/lead-capture.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/crm/lead-capture.ts:21), [`src/lib/broadcast/broadcaster.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/broadcast/broadcaster.ts:16), [`src/lib/whatsapp/connector.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/whatsapp/connector.ts:87), [`src/lib/ai/rag.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/ai/rag.ts:24), and [`src/lib/amniga/anti-ban.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/amniga/anti-ban.ts:48). That is acceptable only while `tenantId` remains server-derived.
8. `MEDIUM` Open: a future provider-based webhook would currently be unsafe unless it explicitly uses [`src/middleware/webhook.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/middleware/webhook.ts:32). There is no active route yet.
9. `LOW` Residual: the schema sources are still dual-maintained in [`schema.sql`](/home/Berkamp34/Desktop/projects/OmniReply-AI/schema.sql:10) and [`prisma/schema.prisma`](/home/Berkamp34/Desktop/projects/OmniReply-AI/prisma/schema.prisma:11). The new auth table resolver in [`src/lib/auth-tables.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/lib/auth-tables.ts:18) reduces runtime drift, but the repo should still choose one canonical migration path.
10. `LOW` Fixed: readiness used to ignore the protected-route DB auth path. It now fails closed when `SUPABASE_ANON_KEY` or `SUPABASE_JWT_SECRET` is missing in [`src/server.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/server.ts:126).

## What Is Safe Now
- Browser-facing tenant APIs are authenticated and derive tenant scope from JWT claims, not client-controlled fields.
- Protected routes no longer import the raw service-role client directly, verified by [`tests/security/service-role-bypass.test.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/tests/security/service-role-bypass.test.ts:15).
- Tenant-owned writes reject body-level `tenantId` overrides.
- WhatsApp session material is encrypted and deleted on logout/disconnect.
- Auth and WhatsApp connect endpoints are rate-limited.

## Must Be Fixed Before Customers
- Apply [`security/rls_policies.sql`](/home/Berkamp34/Desktop/projects/OmniReply-AI/security/rls_policies.sql:66) in the live Supabase project.
- Set `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, and `WHATSAPP_SESSION_ENC_KEY` in production. Protected routes fail closed without them; see [`README.md`](/home/Berkamp34/Desktop/projects/OmniReply-AI/README.md:29) and [`.env.example`](/home/Berkamp34/Desktop/projects/OmniReply-AI/.env.example:4).
- If you add any external webhook route, require [`verifyWebhookSignature`](/home/Berkamp34/Desktop/projects/OmniReply-AI/src/middleware/webhook.ts:32) from day one.

## Go / No-Go Checklist
- `GO` only if `/ready` returns healthy and the live backend has `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, and `WHATSAPP_SESSION_ENC_KEY` configured.
- `GO` only if [`security/rls_policies.sql`](/home/Berkamp34/Desktop/projects/OmniReply-AI/security/rls_policies.sql:1) has been executed in Supabase and its validation queries show `rowsecurity = true` with tenant policies on every existing tenant-owned table.
- `GO` only if `npm run test:security` passes.
- `NO-GO` if protected routes are returning `503` due missing request-scoped DB config.
- `NO-GO` if an external webhook is introduced without HMAC verification.

## Test Status
- `npm run build` passed.
- `npm run test:security` passed.
- [`tests/security/rls-enabled.test.ts`](/home/Berkamp34/Desktop/projects/OmniReply-AI/tests/security/rls-enabled.test.ts:52) is present but skipped locally because DB metadata was not reachable from this environment during the run.
