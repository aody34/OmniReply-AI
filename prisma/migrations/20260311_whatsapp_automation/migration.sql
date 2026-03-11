-- OmniReply AI
-- WhatsApp automation + delayed reply queue migration

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE "Lead"
    ADD COLUMN IF NOT EXISTS "lastManualReplyAt" TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS "humanOverrideUntil" TIMESTAMPTZ;

ALTER TABLE "MessageLog"
    ADD COLUMN IF NOT EXISTS "repliedBy" TEXT DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS "pendingReplyId" UUID;

CREATE TABLE IF NOT EXISTS "Template" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "variables" JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "Template_tenantId_idx" ON "Template"("tenantId");

CREATE TABLE IF NOT EXISTS "AutomationFlow" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN DEFAULT true,
  "priority" INT DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "AutomationFlow_tenant_priority_idx" ON "AutomationFlow"("tenantId", "enabled", "priority");

CREATE TABLE IF NOT EXISTS "FlowTrigger" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "flowId" UUID NOT NULL UNIQUE REFERENCES "AutomationFlow"("id") ON DELETE CASCADE,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "type" TEXT DEFAULT 'INCOMING_MESSAGE',
  "config" JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "FlowTrigger_tenantId_idx" ON "FlowTrigger"("tenantId");
ALTER TABLE "FlowTrigger" ADD COLUMN IF NOT EXISTS "tenantId" UUID REFERENCES "Tenant"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "FlowTrigger_tenantId_idx" ON "FlowTrigger"("tenantId");

CREATE TABLE IF NOT EXISTS "FlowCondition" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "flowId" UUID NOT NULL REFERENCES "AutomationFlow"("id") ON DELETE CASCADE,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "operator" TEXT,
  "value" JSONB,
  "sortOrder" INT DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE "FlowCondition" ADD COLUMN IF NOT EXISTS "tenantId" UUID REFERENCES "Tenant"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "FlowCondition_flow_idx" ON "FlowCondition"("flowId", "sortOrder");
CREATE INDEX IF NOT EXISTS "FlowCondition_tenantId_idx" ON "FlowCondition"("tenantId");

CREATE TABLE IF NOT EXISTS "FlowAction" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "flowId" UUID NOT NULL REFERENCES "AutomationFlow"("id") ON DELETE CASCADE,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "config" JSONB,
  "sortOrder" INT DEFAULT 0,
  "templateId" UUID REFERENCES "Template"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE "FlowAction" ADD COLUMN IF NOT EXISTS "tenantId" UUID REFERENCES "Tenant"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "FlowAction_flow_idx" ON "FlowAction"("flowId", "sortOrder");
CREATE INDEX IF NOT EXISTS "FlowAction_tenantId_idx" ON "FlowAction"("tenantId");
CREATE INDEX IF NOT EXISTS "FlowAction_templateId_idx" ON "FlowAction"("templateId");

CREATE TABLE IF NOT EXISTS "TenantAutomationSettings" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId" UUID NOT NULL UNIQUE REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "autoReplyMode" TEXT DEFAULT 'DELAYED',
  "replyDelayMinutes" INT DEFAULT 20,
  "offlineGraceMinutes" INT DEFAULT 10,
  "workingHours" JSONB,
  "enableHumanOverride" BOOLEAN DEFAULT true,
  "humanOverrideMinutes" INT DEFAULT 30,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "TenantAutomationSettings_tenantId_idx" ON "TenantAutomationSettings"("tenantId");

CREATE TABLE IF NOT EXISTS "OwnerActivity" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "lastActiveAt" TIMESTAMPTZ DEFAULT NOW(),
  "lastHeartbeatAt" TIMESTAMPTZ,
  "lastManualReplyAt" TIMESTAMPTZ,
  "source" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("tenantId", "userId")
);
CREATE INDEX IF NOT EXISTS "OwnerActivity_tenant_lastActive_idx" ON "OwnerActivity"("tenantId", "lastActiveAt");

CREATE TABLE IF NOT EXISTS "PendingReply" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "messageLogId" UUID,
  "phone" TEXT NOT NULL,
  "status" TEXT DEFAULT 'pending',
  "sourceType" TEXT DEFAULT 'DEFAULT',
  "scheduledAt" TIMESTAMPTZ NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "attempts" INT DEFAULT 0,
  "payload" JSONB,
  "lastError" TEXT,
  "sentAt" TIMESTAMPTZ,
  "cancelledAt" TIMESTAMPTZ,
  "flowId" UUID REFERENCES "AutomationFlow"("id") ON DELETE SET NULL,
  "templateId" UUID REFERENCES "Template"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "PendingReply_queue_idx" ON "PendingReply"("tenantId", "status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "PendingReply_tenant_phone_idx" ON "PendingReply"("tenantId", "phone");
CREATE INDEX IF NOT EXISTS "PendingReply_messageLogId_idx" ON "PendingReply"("messageLogId");
