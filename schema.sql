-- ============================================
-- OmniReply AI — Database Schema Setup
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TENANTS (Business accounts)
CREATE TABLE IF NOT EXISTS "Tenant" (
  "id"              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "name"            TEXT NOT NULL,
  "businessType"    TEXT DEFAULT 'general',
  "plan"            TEXT DEFAULT 'free',
  "maxDailyMessages" INT DEFAULT 100,
  "isActive"        BOOLEAN DEFAULT true,
  "aiPersonality"   TEXT DEFAULT 'professional',
  "createdAt"       TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ DEFAULT NOW()
);

-- USERS (Business owners / admins)
CREATE TABLE IF NOT EXISTS "User" (
  "id"        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"  UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "email"     TEXT NOT NULL UNIQUE,
  "password"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "role"      TEXT DEFAULT 'owner',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId");

-- WHATSAPP SESSIONS
CREATE TABLE IF NOT EXISTS "WhatsAppSession" (
  "id"         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"   UUID NOT NULL UNIQUE REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "phone"      TEXT,
  "status"     TEXT DEFAULT 'disconnected',
  "lastActive" TIMESTAMPTZ,
  "createdAt"  TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "WhatsAppSession_tenantId_idx" ON "WhatsAppSession"("tenantId");

-- KNOWLEDGE BASE (RAG data per tenant)
CREATE TABLE IF NOT EXISTS "KnowledgeEntry" (
  "id"        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"  UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "category"  TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "content"   TEXT NOT NULL,
  "isActive"  BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "KnowledgeEntry_tenantId_idx" ON "KnowledgeEntry"("tenantId");
CREATE INDEX IF NOT EXISTS "KnowledgeEntry_category_idx" ON "KnowledgeEntry"("tenantId", "category");

-- LEADS (CRM contacts)
CREATE TABLE IF NOT EXISTS "Lead" (
  "id"           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"     UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "phone"        TEXT NOT NULL,
  "name"         TEXT,
  "firstMessage" TEXT,
  "messageCount" INT DEFAULT 1,
  "lastContact"  TIMESTAMPTZ DEFAULT NOW(),
  "tags"         TEXT[] DEFAULT '{}',
  "createdAt"    TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_tenant_phone_idx" ON "Lead"("tenantId", "phone");
CREATE INDEX IF NOT EXISTS "Lead_tenantId_idx" ON "Lead"("tenantId");

-- MESSAGE LOG
CREATE TABLE IF NOT EXISTS "MessageLog" (
  "id"        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"  UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "direction" TEXT NOT NULL,
  "phone"     TEXT NOT NULL,
  "message"   TEXT NOT NULL,
  "language"  TEXT,
  "aiModel"   TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "MessageLog_tenantId_idx" ON "MessageLog"("tenantId");
CREATE INDEX IF NOT EXISTS "MessageLog_phone_idx" ON "MessageLog"("tenantId", "phone");

-- BROADCASTS (Bulk messaging)
CREATE TABLE IF NOT EXISTS "Broadcast" (
  "id"          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"    UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "message"     TEXT NOT NULL,
  "recipients"  TEXT[] DEFAULT '{}',
  "sentCount"   INT DEFAULT 0,
  "failedCount" INT DEFAULT 0,
  "status"      TEXT DEFAULT 'pending',
  "scheduledAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "Broadcast_tenantId_idx" ON "Broadcast"("tenantId");

-- DAILY STATS (Analytics)
CREATE TABLE IF NOT EXISTS "DailyStat" (
  "id"              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  "tenantId"        UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "date"            DATE NOT NULL,
  "messagesIn"      INT DEFAULT 0,
  "messagesOut"     INT DEFAULT 0,
  "aiResponses"     INT DEFAULT 0,
  "newLeads"        INT DEFAULT 0,
  "broadcastsSent"  INT DEFAULT 0,
  "createdAt"       TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyStat_tenant_date_idx" ON "DailyStat"("tenantId", "date");
CREATE INDEX IF NOT EXISTS "DailyStat_tenantId_idx" ON "DailyStat"("tenantId");
