# OmniReply AI Security Report

## Scope
- Backend: `src/`
- Frontend: `frontend/`
- Database schema: `schema.sql`, `prisma/schema.prisma`
- Deployment: `railway.json`, `nixpacks.toml`

## Route Inventory And Protection

### Public routes
- `GET /health` (`src/server.ts:101`)
- `GET /ready` (`src/server.ts:114`)
- `GET /` (`src/server.ts:138`)
- `POST /api/auth/register` (`src/routes/auth.ts:59`)
- `POST /api/auth/login` (`src/routes/auth.ts:137`)

### Protected routes (`authMiddleware`)
- `GET /api/auth/me` (`src/routes/auth.ts:191`)
- `POST /api/whatsapp/connect` (`src/routes/whatsapp.ts:20`) + `requireRole('owner','admin')`
- `POST /api/whatsapp/disconnect` (`src/routes/whatsapp.ts:34`) + `requireRole('owner','admin')`
- `GET /api/whatsapp/status` (`src/routes/whatsapp.ts:48`)
- `GET /api/whatsapp/qr` (`src/routes/whatsapp.ts:56`)
- `GET /api/knowledge` (`src/routes/knowledge.ts:16`)
- `POST /api/knowledge` (`src/routes/knowledge.ts:41`) + `requireRole('owner','admin')`
- `PUT /api/knowledge/:id` (`src/routes/knowledge.ts:75`) + `requireRole('owner','admin')`
- `DELETE /api/knowledge/:id` (`src/routes/knowledge.ts:118`) + `requireRole('owner','admin')`
- `GET /api/leads` (`src/routes/leads.ts:15`)
- `POST /api/broadcast` (`src/routes/broadcast.ts:16`) + `requireRole('owner','admin')`
- `GET /api/broadcast` (`src/routes/broadcast.ts:67`)
- `GET /api/broadcast/:id` (`src/routes/broadcast.ts:95`)
- `GET /api/tenant/settings` (`src/routes/tenant.ts:16`)
- `PUT /api/tenant/settings` (`src/routes/tenant.ts:37`) + `requireRole('owner','admin')`
- `GET /api/tenant/dashboard` (`src/routes/tenant.ts:64`)
- `GET /api/tenant/analytics` (`src/routes/tenant.ts:99`)

## Server Security Scan (`src/server.ts`)
- CORS allowed origins: allowlist from env `CORS_ALLOWED_ORIGINS` (or `FRONTEND_URL` fallback in prod, localhost defaults in dev) at `src/server.ts:41-63`.
- Helmet usage: enabled at `src/server.ts:80`.
- Rate limiting: auth limiter attached to `/api/auth/login` and `/api/auth/register` at `src/server.ts:91-92` (impl in `src/middleware/rate-limit.ts`).
- Body size limits: `express.json` + `urlencoded` use `BODY_LIMIT` (default `1mb`) at `src/server.ts:89-90`.
- `trust proxy`: set via `TRUST_PROXY` parser at `src/server.ts:67-77`.
- Logging secrets/auth headers: request logger only logs method + URL (`src/server.ts:95-97`), no auth header/body logging.

## Middleware Scan (`src/middleware`)
- JWT verification and expiry: `jwt.verify` with algorithm pinning (`HS256`) at `src/middleware/auth.ts:66-75`.
- Expiry checks: handled by `jwt.verify`, expired tokens return `401` in `authMiddleware` (`src/middleware/auth.ts:91-99`).
- `req.user` structure: now includes `tenantId` and `role` (`src/middleware/auth.ts:27-30`, `34-47`, `93-95`).
- Protected route usage: all non-auth route groups use `router.use(authMiddleware)`; `/api/auth/me` explicitly uses it.

## DB Client Scan (`src/lib/db.ts`)
- `SUPABASE_SERVICE_KEY` is server-only in backend client (`src/lib/db.ts:13-16`, `39-45`).
- No usage of service key in frontend (`frontend/` scan: no `SUPABASE_SERVICE_KEY` references).
- Backend uses service-role key and bypasses RLS by design (`src/lib/db.ts:38-41`).
- Application-level tenant filters exist broadly, but DB-level RLS is not enabled in `schema.sql`.

## Schema Isolation Scan
- Tenant key exists on tenant-owned tables in `schema.sql`:
  - `"User"."tenantId"` (`schema.sql:25`)
  - `"WhatsAppSession"."tenantId"` (`schema.sql:38`)
  - `"KnowledgeEntry"."tenantId"` (`schema.sql:50`)
  - `"Lead"."tenantId"` (`schema.sql:64`)
  - `"MessageLog"."tenantId"` (`schema.sql:80`)
  - `"Broadcast"."tenantId"` (`schema.sql:94`)
  - `"DailyStat"."tenantId"` (`schema.sql:109`)
- Tenant indexes/constraints are present (examples):
  - `User_tenantId_idx` (`schema.sql:33`)
  - `Lead_tenant_phone_idx` (`schema.sql:74`)
  - `DailyStat_tenant_date_idx` (`schema.sql:118`)
- Prisma schema also models tenant relationships and indexes (`prisma/schema.prisma:57-60`, `94-98`, `117-121`, `162-165`, `183-185`).
- RLS policies: absent in `schema.sql`; template added at `security/rls_policies.sql`.

## Top 10 Findings

1. **[HIGH] Overly permissive CORS with credentials**
   - Evidence: legacy behavior accepted arbitrary origins with credentials (`src/server.ts` before hardening).
   - Fix implemented: strict allowlist CORS policy with explicit env-based origins at `src/server.ts:41-63`, rejection handler at `src/server.ts:83-88`.

2. **[HIGH] Missing security headers**
   - Evidence: no Helmet middleware in HTTP stack (pre-hardening).
   - Fix implemented: `helmet()` at `src/server.ts:80`.

3. **[HIGH] Missing auth endpoint rate limiting (brute-force risk)**
   - Evidence: no limiter on `/api/auth/login` or `/api/auth/register` (pre-hardening).
   - Fix implemented: reusable limiter `src/middleware/rate-limit.ts:1-17`, applied in `src/server.ts:91-92`.

4. **[MEDIUM] Reverse-proxy trust not configured**
   - Evidence: no `trust proxy` setting originally, which can break secure IP/rate-limit behavior behind Railway.
   - Fix implemented: proxy parsing + `app.set('trust proxy', ...)` at `src/server.ts:67-77`.

5. **[HIGH] JWT secret fallback risk and weak token validation**
   - Evidence: static fallback secret was always available, and token payload shape was not validated.
   - Fix implemented:
     - Enforce `JWT_SECRET` in production at `src/middleware/auth.ts:9-13`
     - Validate payload shape at `src/middleware/auth.ts:34-47`
     - Pin algorithm + strict verify at `src/middleware/auth.ts:57-75`

6. **[MEDIUM] Missing normalized `req.user` auth context**
   - Evidence: only `req.auth` existed, making middleware consistency weaker across code and audits.
   - Fix implemented: `req.user` added and populated in `src/middleware/auth.ts:27-30`, `93-95`.

7. **[HIGH] Privileged actions lacked role-based authorization**
   - Evidence: broadcast creation, tenant settings updates, and WhatsApp session control were auth-only.
   - Fix implemented:
     - Broadcast create guarded at `src/routes/broadcast.ts:16`
     - Knowledge mutations guarded at `src/routes/knowledge.ts:41`, `75`, `118`
     - Tenant settings update guarded at `src/routes/tenant.ts:37`
     - WhatsApp connect/disconnect guarded at `src/routes/whatsapp.ts:20`, `34`

8. **[HIGH] IDOR risk in `/:id` tenant-owned record mutations**
   - Evidence: mutations previously targeted `id` only after existence check (TOCTOU/defense-in-depth gap).
   - Fix implemented:
     - Knowledge update/delete now also filter by `tenantId` at `src/routes/knowledge.ts:103-105`, `137-138`
     - `/api/auth/me` also asserts token tenant match at `src/routes/auth.ts:201-203`

9. **[MEDIUM] Background job updates missing tenant guard on writes**
   - Evidence: some updates used record `id` only in async flows.
   - Fix implemented:
     - Broadcast state/stat updates include tenant guard (`src/lib/broadcast/broadcaster.ts:34-35`, `44-45`, `95-96`, `114-115`)
     - Daily stat and lead updates include tenant guard (`src/lib/ai/handler.ts:139-140`, `src/lib/crm/lead-capture.ts:37-38`, `65-66`)

10. **[HIGH] No DB-level RLS policies + schema drift risk**
   - Evidence:
     - `schema.sql` has no `ENABLE ROW LEVEL SECURITY` or policies (`schema.sql:1-119`)
     - backend uses service-role key (`src/lib/db.ts:38-41`) and thus bypasses RLS
     - `schema.sql` (`"Tenant"`, `"User"`) differs from Prisma mappings (`tenants`, `users`) at `prisma/schema.prisma:40`, `60`
   - Fix guidance:
     - Use a single canonical schema path (Prisma migrations or SQL, not both unsynchronized).
     - If anon/authenticated Supabase access is introduced, apply tenant RLS policies (template in `security/rls_policies.sql`).

## Concrete Changes Applied In This Audit
- Server hardening:
  - `src/server.ts`
  - `src/middleware/rate-limit.ts`
- Auth hardening:
  - `src/middleware/auth.ts`
  - `src/routes/auth.ts`
- RBAC + tenant scope fixes:
  - `src/routes/broadcast.ts`
  - `src/routes/knowledge.ts`
  - `src/routes/tenant.ts`
  - `src/routes/whatsapp.ts`
  - `src/lib/broadcast/broadcaster.ts`
  - `src/lib/ai/handler.ts`
  - `src/lib/crm/lead-capture.ts`
- RLS template:
  - `security/rls_policies.sql`
- Security tests:
  - `tests/security/auth.test.ts`
  - `tests/security/rate-limit.test.ts`
  - `tests/security/tenant-isolation.test.ts`
  - `vitest.config.ts`
  - `package.json` scripts `test:security`, `audit:security`

## Test Status
- `npm run build` ✅
- `npm run test:security` ✅ (executed with escalated permissions due sandbox socket restrictions)

