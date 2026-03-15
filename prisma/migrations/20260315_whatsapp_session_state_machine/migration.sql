ALTER TABLE "WhatsAppSession"
  ADD COLUMN IF NOT EXISTS "sessionId" TEXT DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS "state" TEXT DEFAULT 'DISCONNECTED',
  ADD COLUMN IF NOT EXISTS "qr" TEXT,
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "connectedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "disconnectedAt" TIMESTAMPTZ;

UPDATE "WhatsAppSession"
SET "state" = CASE
  WHEN LOWER(COALESCE("status", '')) = 'connected' THEN 'CONNECTED'
  WHEN LOWER(COALESCE("status", '')) = 'qr_ready' THEN 'QR'
  WHEN LOWER(COALESCE("status", '')) IN ('authenticating', 'connecting') THEN 'CONNECTING'
  WHEN LOWER(COALESCE("status", '')) = 'error' THEN 'ERROR'
  ELSE 'DISCONNECTED'
END
WHERE "state" IS NULL OR "state" = 'DISCONNECTED';

UPDATE "WhatsAppSession"
SET "sessionId" = COALESCE("sessionId", 'primary'),
    "lastSeenAt" = COALESCE("lastSeenAt", "lastActive"),
    "connectedAt" = CASE
      WHEN "connectedAt" IS NOT NULL THEN "connectedAt"
      WHEN "state" = 'CONNECTED' THEN COALESCE("updatedAt", NOW())
      ELSE NULL
    END,
    "disconnectedAt" = CASE
      WHEN "disconnectedAt" IS NOT NULL THEN "disconnectedAt"
      WHEN "state" IN ('DISCONNECTED', 'ERROR') THEN COALESCE("updatedAt", NOW())
      ELSE NULL
    END;
