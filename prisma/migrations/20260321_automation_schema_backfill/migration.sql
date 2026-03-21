ALTER TABLE public."TenantAutomationSettings"
  ADD COLUMN IF NOT EXISTS "enableHumanOverride" BOOLEAN DEFAULT true;

ALTER TABLE public."TenantAutomationSettings"
  ADD COLUMN IF NOT EXISTS "humanOverrideMinutes" INT DEFAULT 30;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'TenantAutomationSettings'
      AND column_name = 'pauseOnHumanReply'
  ) THEN
    EXECUTE '
      UPDATE public."TenantAutomationSettings"
      SET "enableHumanOverride" = COALESCE("enableHumanOverride", "pauseOnHumanReply")
      WHERE "pauseOnHumanReply" IS NOT NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'TenantAutomationSettings'
      AND column_name = 'humanOverridePauseMinutes'
  ) THEN
    EXECUTE '
      UPDATE public."TenantAutomationSettings"
      SET "humanOverrideMinutes" = COALESCE("humanOverrideMinutes", "humanOverridePauseMinutes")
      WHERE "humanOverridePauseMinutes" IS NOT NULL
    ';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public."FlowTrigger" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "flowId" UUID NOT NULL UNIQUE REFERENCES public."AutomationFlow"("id") ON DELETE CASCADE,
  "tenantId" UUID NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "type" TEXT DEFAULT 'INCOMING_MESSAGE',
  "value" JSONB,
  "config" JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public."FlowTrigger"
  ADD COLUMN IF NOT EXISTS "tenantId" UUID REFERENCES public."Tenant"("id") ON DELETE CASCADE;

ALTER TABLE public."FlowTrigger"
  ADD COLUMN IF NOT EXISTS "value" JSONB;

ALTER TABLE public."FlowTrigger"
  ADD COLUMN IF NOT EXISTS "config" JSONB;

ALTER TABLE public."FlowTrigger"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public."FlowTrigger"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS "FlowTrigger_flowId_key" ON public."FlowTrigger"("flowId");
CREATE INDEX IF NOT EXISTS "FlowTrigger_tenantId_idx" ON public."FlowTrigger"("tenantId");
