ALTER TABLE public."FlowCondition"
  ADD COLUMN IF NOT EXISTS "kind" TEXT;

ALTER TABLE public."FlowCondition"
  ADD COLUMN IF NOT EXISTS "type" TEXT;

UPDATE public."FlowCondition"
SET "kind" = COALESCE("kind", "type", 'containsText')
WHERE "kind" IS NULL;

UPDATE public."FlowCondition"
SET "type" = COALESCE("type", "kind", 'containsText')
WHERE "type" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'FlowCondition'
      AND column_name = 'kind'
      AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public."FlowCondition"
    WHERE "kind" IS NULL
  ) THEN
    ALTER TABLE public."FlowCondition"
      ALTER COLUMN "kind" SET NOT NULL;
  END IF;
END $$;
