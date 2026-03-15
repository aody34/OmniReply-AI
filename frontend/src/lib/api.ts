// ============================================
// OmniReply AI — API Client
// Typed fetch wrappers with JWT management
// ============================================

function normalizeApiBase(raw: string | undefined): string {
    if (!raw) return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';

    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return withProtocol.endsWith('/') ? withProtocol.slice(0, -1) : withProtocol;
}

const API_BASE = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL);

export type WhatsAppState = 'DISCONNECTED' | 'QR' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export type WhatsAppStatusPayload = {
    tenantId: string;
    sessionId: string | null;
    state: WhatsAppState;
    qr: string | null;
    qrCreatedAt: string | null;
    reason: string | null;
    phoneNumber: string | null;
    updatedAt: string;
    lastSeenAt: string | null;
    connectedAt: string | null;
    disconnectedAt: string | null;
    serverTime: string;
};

export type AutomationSettingsPayload = {
    autoReplyMode: 'OFF' | 'DELAYED' | 'OFFLINE_ONLY' | 'HYBRID';
    replyDelayMinutes: number;
    offlineGraceMinutes: number;
    workingHours: {
        enabled?: boolean;
        start?: string;
        end?: string;
        timezone?: string;
    } | null;
    enableHumanOverride: boolean;
    humanOverrideMinutes: number;
};

export type FlowCondition = {
    type: 'containsText' | 'languageIs' | 'businessHoursOnly' | 'contactTag' | 'messageCountThreshold';
    operator?: string | null;
    value?: any;
    sortOrder?: number | null;
};

export type FlowAction = {
    type: 'sendText' | 'sendTemplate' | 'addTag' | 'createLead' | 'updateLead' | 'callAIReply' | 'wait';
    config?: any;
    sortOrder?: number | null;
    templateId?: string | null;
};

export type AutomationFlowInput = {
    name: string;
    enabled: boolean;
    priority: number;
    trigger?: { type: 'INCOMING_MESSAGE'; config?: any };
    conditions: FlowCondition[];
    actions: FlowAction[];
};

function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('omnireply_token');
}

export function setToken(token: string): void {
    localStorage.setItem('omnireply_token', token);
}

export function clearToken(): void {
    localStorage.removeItem('omnireply_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let res: Response;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers,
        });
    } catch {
        throw new Error('Cannot connect to server. Please check that the backend URL is correct and running.');
    }

    let data: any = null;
    try {
        data = await res.json();
    } catch {
        if (res.status === 204) {
            return {} as T;
        }
        if (res.status === 502) {
            throw new Error('Backend is unreachable (502). Check Railway deployment and service health.');
        }
        throw new Error(`Server returned invalid response (${res.status})`);
    }

    if (!res.ok) {
        const errorMessage =
            (typeof data?.error === 'string' && data.error) ||
            (typeof data?.message === 'string' && data.message) ||
            '';

        if (res.status === 502) {
            throw new Error(errorMessage || 'Backend is unreachable (502). Check Railway deployment and service health.');
        }

        throw new Error(errorMessage || `Request failed (${res.status})`);
    }

    return data as T;
}

export const api = {
    auth: {
        register: (body: { email: string; password: string; name: string; businessName: string; businessType?: string }) =>
            request<{ token: string; user: any; tenant: any }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),

        login: (body: { email: string; password: string }) =>
            request<{ token: string; user: any }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),

        me: () => request<{ user: any; tenant: any }>('/api/auth/me'),
    },

    heartbeat: {
        ping: () => request<{ ok: boolean; timestamp: string }>('/api/heartbeat', { method: 'POST' }),
    },

    whatsapp: {
        connect: (body?: { force?: boolean }) =>
            request<{ message: string; status: WhatsAppStatusPayload }>('/api/whatsapp/connect', {
                method: 'POST',
                body: JSON.stringify(body || {}),
            }),
        disconnect: () => request<{ message: string; status: WhatsAppStatusPayload }>('/api/whatsapp/disconnect', { method: 'POST' }),
        status: (options: RequestInit = {}) => request<WhatsAppStatusPayload>('/api/whatsapp/status', options),
        qr: () => request<{ qr: string; updatedAt: string; qrCreatedAt: string | null; tenantId: string }>('/api/whatsapp/qr'),
    },

    knowledge: {
        list: (category?: string) =>
            request<{ entries: any[]; total: number }>(`/api/knowledge${category ? `?category=${category}` : ''}`),
        create: (body: { category: string; title: string; content: string }) =>
            request<{ entry: any }>('/api/knowledge', { method: 'POST', body: JSON.stringify(body) }),
        update: (id: string, body: any) =>
            request<{ entry: any }>(`/api/knowledge/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
        delete: (id: string) =>
            request<{ message: string }>(`/api/knowledge/${id}`, { method: 'DELETE' }),
    },

    leads: {
        list: (params?: { search?: string; page?: number; limit?: number }) => {
            const q = new URLSearchParams();
            if (params?.search) q.set('search', params.search);
            if (params?.page) q.set('page', String(params.page));
            if (params?.limit) q.set('limit', String(params.limit));
            const query = q.toString();
            return request<{ leads: any[]; total: number; page: number; limit: number }>(`/api/leads${query ? `?${query}` : ''}`);
        },
    },

    broadcasts: {
        list: () => request<{ broadcasts: any[]; total: number }>('/api/broadcast'),
        get: (id: string) => request<{ broadcast: any }>(`/api/broadcast/${id}`),
        create: (body: { message: string; recipients: string[]; scheduledAt?: string }) =>
            request<{ broadcast: any }>('/api/broadcast', { method: 'POST', body: JSON.stringify(body) }),
    },

    tenant: {
        settings: () => request<{ tenant: any }>('/api/tenant/settings'),
        update: (body: { name?: string; businessType?: string; aiPersonality?: string; maxDailyMessages?: number }) =>
            request<{ tenant: any }>('/api/tenant/settings', { method: 'PUT', body: JSON.stringify(body) }),
        dashboard: () => request<any>('/api/tenant/dashboard'),
        analytics: (days?: number) =>
            request<any>(`/api/tenant/analytics${days ? `?days=${days}` : ''}`),
    },

    settings: {
        get: () => request<{ settings: AutomationSettingsPayload; ownerActivity: { lastActiveAt: string | null; offline: boolean } }>('/api/settings'),
        update: (body: AutomationSettingsPayload) =>
            request<{ settings: AutomationSettingsPayload }>('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
    },

    automations: {
        list: () => request<{ flows: any[] }>('/api/automations'),
        create: (body: AutomationFlowInput) =>
            request<{ flow: any }>('/api/automations', { method: 'POST', body: JSON.stringify(body) }),
        update: (id: string, body: AutomationFlowInput) =>
            request<{ flow: any }>(`/api/automations/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
        delete: (id: string) =>
            request<{ message: string }>(`/api/automations/${id}`, { method: 'DELETE' }),
    },

    templates: {
        list: () => request<{ templates: any[] }>('/api/templates'),
        create: (body: { name: string; content: string; variables: string[] }) =>
            request<{ template: any }>('/api/templates', { method: 'POST', body: JSON.stringify(body) }),
        update: (id: string, body: { name: string; content: string; variables: string[] }) =>
            request<{ template: any }>(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
        delete: (id: string) =>
            request<{ message: string }>(`/api/templates/${id}`, { method: 'DELETE' }),
    },
};
