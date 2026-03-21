-- ============================================
-- OmniReply AI — Database Schema Setup
-- Run this in Supabase SQL Editor for a fresh setup
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "Tenant" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "name" TEXT NOT NULL,
  "businessType" TEXT DEFAULT 'general',
  "plan" TEXT DEFAULT 'free',
  "maxDailyMessages" INT DEFAULT 100,
  "isActive" BOOLEAN DEFAULT true,
  "aiPersonality" TEXT DEFAULT 'professional',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "User" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL UNIQUE,
  "password" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT DEFAULT 'owner',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId");

CREATE TABLE IF NOT EXISTS "WhatsAppSession" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId" UUID NOT NULL UNIQUE REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "sessionId" TEXT DEFAULT 'primary',
  "phone" TEXT,
  "status" TEXT DEFAULT 'disconnected',
  "state" TEXT DEFAULT 'DISCONNECTED',
  "qr" TEXT,
  "qrCreatedAt" TIMESTAMPTZ,
  "reason" TEXT,
  "lastActive" TIMESTAMPTZ,
  "lastSeenAt" TIMESTAMPTZ,
  "connectedAt" TIMESTAMPTZ,
  "disconnectedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "WhatsAppSession_tenantId_idx" ON "WhatsAppSession"("tenantId");

ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "sessionId" TEXT DEFAULT 'primary';
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "state" TEXT DEFAULT 'DISCONNECTED';
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "qr" TEXT;
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "qrCreatedAt" TIMESTAMPTZ;
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ;
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "connectedAt" TIMESTAMPTZ;
ALTER TABLE "WhatsAppSession" ADD COLUMN IF NOT EXISTS "disconnectedAt" TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "KnowledgeEntry" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "KnowledgeEntry_tenantId_idx" ON "KnowledgeEntry"("tenantId");
CREATE INDEX IF NOT EXISTS "KnowledgeEntry_category_idx" ON "KnowledgeEntry"("tenantId", "category");

CREATE TABLE IF NOT EXISTS "Lead" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "phone" TEXT NOT NULL,
  "name" TEXT,
  "firstMessage" TEXT,
  "messageCount" INT DEFAULT 1,
  "lastContact" TIMESTAMPTZ DEFAULT NOW(),
  "tags" TEXT[] DEFAULT '{}',
  "lastManualReplyAt" TIMESTAMPTZ,
  "humanOverrideUntil" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_tenant_phone_idx" ON "Lead"("tenantId", "phone");
CREATE INDEX IF NOT EXISTS "Lead_tenantId_idx" ON "Lead"("tenantId");

CREATE TABLE IF NOT EXISTS "MessageLog" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "direction" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "language" TEXT,
  "aiModel" TEXT,
  "repliedBy" TEXT DEFAULT 'NONE',
  "repliedAt" TIMESTAMPTZ,
  "pendingReplyId" UUID,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "MessageLog_tenantId_idx" ON "MessageLog"("tenantId");
CREATE INDEX IF NOT EXISTS "MessageLog_phone_idx" ON "MessageLog"("tenantId", "phone");
CREATE INDEX IF NOT EXISTS "MessageLog_pendingReplyId_idx" ON "MessageLog"("pendingReplyId");

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
  "value" JSONB,
  "config" JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
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

CREATE TABLE IF NOT EXISTS "Broadcast" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "message" TEXT NOT NULL,
  "recipients" TEXT[] DEFAULT '{}',
  "sentCount" INT DEFAULT 0,
  "failedCount" INT DEFAULT 0,
  "status" TEXT DEFAULT 'pending',
  "scheduledAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "Broadcast_tenantId_idx" ON "Broadcast"("tenantId");

CREATE TABLE IF NOT EXISTS "DailyStat" (
  "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "date" DATE NOT NULL,
  "messagesIn" INT DEFAULT 0,
  "messagesOut" INT DEFAULT 0,
  "aiResponses" INT DEFAULT 0,
  "newLeads" INT DEFAULT 0,
  "broadcastsSent" INT DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyStat_tenant_date_idx" ON "DailyStat"("tenantId", "date");
CREATE INDEX IF NOT EXISTS "DailyStat_tenantId_idx" ON "DailyStat"("tenantId");

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastManualReplyAt" TIMESTAMPTZ;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "humanOverrideUntil" TIMESTAMPTZ;
ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "repliedBy" TEXT DEFAULT 'NONE';
ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMPTZ;
ALTER TABLE "MessageLog" ADD COLUMN IF NOT EXISTS "pendingReplyId" UUID;
