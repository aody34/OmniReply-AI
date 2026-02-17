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

export interface WhatsAppStatus {
    tenantId: string;
    status: 'connected' | 'disconnected' | 'authenticating' | 'qr_ready';
    qrCode?: string;
    phoneNumber?: string;
    lastActive?: Date;
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
