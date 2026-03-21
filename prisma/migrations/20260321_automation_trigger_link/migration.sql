ALTER TABLE public."FlowTrigger"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public."FlowAction"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public."FlowCondition"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public."FlowCondition"
  ADD COLUMN IF NOT EXISTS "triggerId" UUID;

UPDATE public."FlowCondition" AS condition
SET "triggerId" = trigger."id"
FROM public."FlowTrigger" AS trigger
WHERE condition."triggerId" IS NULL
  AND condition."flowId" = trigger."flowId";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'FlowCondition_triggerId_fkey'
  ) THEN
    ALTER TABLE public."FlowCondition"
      ADD CONSTRAINT "FlowCondition_triggerId_fkey"
      FOREIGN KEY ("triggerId") REFERENCES public."FlowTrigger"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "FlowCondition_triggerId_idx" ON public."FlowCondition"("triggerId");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'FlowCondition'
      AND column_name = 'triggerId'
      AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public."FlowCondition"
    WHERE "triggerId" IS NULL
  ) THEN
    ALTER TABLE public."FlowCondition"
      ALTER COLUMN "triggerId" SET NOT NULL;
  END IF;
END $$;
