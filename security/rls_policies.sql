-- OmniReply AI RLS template
-- Apply only if you execute queries with anon/authenticated JWTs that carry a tenantId claim.
-- Service role keys bypass RLS by design.

-- Legacy quoted-table schema
ALTER TABLE IF EXISTS "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "WhatsAppSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "KnowledgeEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "MessageLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "Broadcast" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "DailyStat" ENABLE ROW LEVEL SECURITY;

-- Prisma snake_case schema
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_stats ENABLE ROW LEVEL SECURITY;

-- Shared helper expression:
-- (current_setting('request.jwt.claims', true)::jsonb ->> 'tenantId')

DO $$
BEGIN
  IF to_regclass('"KnowledgeEntry"') IS NOT NULL THEN
    CREATE POLICY "KnowledgeEntry tenant isolate"
      ON "KnowledgeEntry"
      FOR ALL
      USING ("tenantId"::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenantId'))
      WITH CHECK ("tenantId"::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenantId'));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('knowledge_entries') IS NOT NULL THEN
    CREATE POLICY "knowledge_entries tenant isolate"
      ON knowledge_entries
      FOR ALL
      USING ("tenantId"::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenantId'))
      WITH CHECK ("tenantId"::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'tenantId'));
  END IF;
END $$;

-- Repeat this tenant policy pattern for users/leads/broadcasts/message_logs/daily_stats/whatsapp_sessions.

