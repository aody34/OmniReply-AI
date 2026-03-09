# OmniReply AI

Backend + frontend multi-tenant WhatsApp SaaS.

## Environment Variables

### Local (`.env`)
1. Copy `.env.example` to `.env`.
2. Set backend secrets in `.env`:
   - `DATABASE_URL` (Supabase pooled Postgres URL, must start with `postgresql://` or `postgres://`)
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
   - `JWT_SECRET`
   - `GEMINI_API_KEY`
3. Optional:
   - `DIRECT_URL` (only if direct host is reachable)
   - `CORS_ALLOWED_ORIGINS` (comma-separated, e.g. `http://localhost:3000`)
   - `TRUST_PROXY` (`1` in reverse-proxy environments)

Notes:
- Prisma in this repo uses `DATABASE_URL` for connectivity.
- If direct host/IPv6 is blocked on your network, leave `DIRECT_URL` unset or set it equal to `DATABASE_URL`.
- Quick format rule: `DATABASE_URL` must start with `postgresql://` (or `postgres://`).

### Railway (backend service)
Set these in Railway Variables:
- `DATABASE_URL` (pooled Supabase connection string)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `JWT_SECRET`
- `GEMINI_API_KEY`
- `CORS_ALLOWED_ORIGINS` (your frontend URL(s), comma-separated)
- `TRUST_PROXY=1`

Do not set `PORT` manually; Railway injects it.

### Vercel (frontend project)
Set these in Vercel Environment Variables:
- `NEXT_PUBLIC_API_URL` = your Railway backend URL (for example `https://your-backend.up.railway.app`)

Do not place backend secrets (`DATABASE_URL`, Supabase service key, JWT secret) in Vercel frontend env vars.

## Prisma Connectivity

Run a safe connectivity check (no secrets printed):

```bash
npm run db:check
```

Pull schema from the live database:

```bash
npm run db:pull
```

If `db pull` fails due direct-host connectivity, keep using pooled `DATABASE_URL` and do not configure a separate direct URL.

## Tests

Run default tests:

```bash
npm test
```

Run security tests only:

```bash
npm run test:security
```
