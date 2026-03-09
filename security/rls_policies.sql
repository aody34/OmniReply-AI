-- OmniReply AI
-- Supabase RLS validation + safe policy upsert
--
-- Run this in the Supabase SQL editor after setting up anon/authenticated JWT access.
-- The policies below scope rows by the custom JWT claim:
-- current_setting('request.jwt.claims', true)::jsonb ->> 'tenantId'

-- Validation: confirm row security flags for tenant-owned tables.
SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rowsecurity
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname = ANY (ARRAY[
      'Tenant',
      'User',
      'WhatsAppSession',
      'MessageLog',
      'KnowledgeEntry',
      'Lead',
      'Broadcast',
      'DailyStat',
      'tenants',
      'users',
      'whatsapp_sessions',
      'message_logs',
      'knowledge_entries',
      'leads',
      'broadcasts',
      'daily_stats'
  ])
ORDER BY c.relname;

-- Validation: list active policies and their definitions.
SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = ANY (ARRAY[
      'Tenant',
      'User',
      'WhatsAppSession',
      'MessageLog',
      'KnowledgeEntry',
      'Lead',
      'Broadcast',
      'DailyStat',
      'tenants',
      'users',
      'whatsapp_sessions',
      'message_logs',
      'knowledge_entries',
      'leads',
      'broadcasts',
      'daily_stats'
  ])
ORDER BY tablename, policyname;

DO $$
DECLARE
    claim_expr CONSTANT text := '(current_setting(''request.jwt.claims'', true)::jsonb ->> ''tenantId'')';
    table_record RECORD;
    tenant_expr text;
    policy_name text;
BEGIN
    FOR table_record IN
        SELECT *
        FROM (
            VALUES
                ('Tenant', true),
                ('User', false),
                ('WhatsAppSession', false),
                ('MessageLog', false),
                ('KnowledgeEntry', false),
                ('Lead', false),
                ('Broadcast', false),
                ('DailyStat', false),
                ('tenants', true),
                ('users', false),
                ('whatsapp_sessions', false),
                ('message_logs', false),
                ('knowledge_entries', false),
                ('leads', false),
                ('broadcasts', false),
                ('daily_stats', false)
        ) AS candidate(table_name, is_tenant_root)
    LOOP
        IF to_regclass(format('public.%I', table_record.table_name)) IS NULL THEN
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_record.table_name);

        IF table_record.is_tenant_root THEN
            tenant_expr := format('id::text = %s', claim_expr);
        ELSIF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = table_record.table_name
              AND column_name = 'tenantId'
        ) THEN
            tenant_expr := format('%I::text = %s', 'tenantId', claim_expr);
        ELSIF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = table_record.table_name
              AND column_name = 'tenant_id'
        ) THEN
            tenant_expr := format('%I::text = %s', 'tenant_id', claim_expr);
        ELSE
            RAISE NOTICE 'Skipping % because no tenant column was found', table_record.table_name;
            CONTINUE;
        END IF;

        policy_name := table_record.table_name || ' tenant isolate';

        IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = table_record.table_name
              AND policyname = policy_name
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR ALL USING (%s) WITH CHECK (%s)',
                policy_name,
                table_record.table_name,
                tenant_expr,
                tenant_expr
            );
        END IF;
    END LOOP;
END $$;

-- Re-run the validation queries above after this block.
