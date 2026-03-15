// ============================================
// OmniReply AI — Shared TypeScript Types
// ============================================

export interface TenantConfig {
    id: string;
    name: string;
    businessType: string;
    dailyMessageLimit: number;
    aiPauseDuration: number;
    defaultLanguage: string;
}

export type WhatsAppSessionState =
    | 'DISCONNECTED'
    | 'QR'
    | 'CONNECTING'
    | 'CONNECTED'
    | 'ERROR';

export interface WhatsAppStatus {
    tenantId: string;
    sessionId: string | null;
    state: WhatsAppSessionState;
    qr: string | null;
    qrCreatedAt: string | null;
    reason: string | null;
    phoneNumber: string | null;
    updatedAt: string;
    lastSeenAt: string | null;
    connectedAt: string | null;
    disconnectedAt: string | null;
}

export interface IncomingMessage {
    tenantId: string;
    senderJid: string;
    senderName?: string;
    content: string;
    timestamp: Date;
    isFromOwner: boolean;
}

export interface AIResponse {
    content: string;
    language: string;
    knowledgeUsed: string[];
    tokensUsed?: number;
}

export interface LeadData {
    phoneNumber: string;
    name?: string;
    tenantId: string;
}

export interface BroadcastRequest {
    tenantId: string;
    message: string;
    recipients: string[];
    scheduledAt?: Date;
}

export interface HumanOverrideEntry {
    chatJid: string;
    pausedAt: Date;
    resumeAt: Date;
}

export interface RateLimitStatus {
    tenantId: string;
    dailyCount: number;
    dailyLimit: number;
    canSend: boolean;
}
