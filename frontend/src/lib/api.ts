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

// If NEXT_PUBLIC_API_URL is set, call backend directly.
// Otherwise use same-origin (/api/*), which works with Vercel rewrites.
const API_BASE = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL);

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
        headers['Authorization'] = `Bearer ${token}`;
    }

    let res: Response;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers,
        });
    } catch (err) {
        throw new Error('Cannot connect to server. Please check that the backend URL is correct and running.');
    }

    let data: any;
    try {
        data = await res.json();
    } catch {
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

// ── Auth ──
export const api = {
    auth: {
        register: (body: { email: string; password: string; name: string; businessName: string; businessType?: string }) =>
            request<{ token: string; user: any; tenant: any }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),

        login: (body: { email: string; password: string }) =>
            request<{ token: string; user: any }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),

        me: () => request<{ user: any; tenant: any }>('/api/auth/me'),
    },

    // ── WhatsApp ──
    whatsapp: {
        connect: () => request<{ message: string; status: any }>('/api/whatsapp/connect', { method: 'POST' }),
        disconnect: () => request<{ message: string }>('/api/whatsapp/disconnect', { method: 'POST' }),
        status: () => request<{ status: any }>('/api/whatsapp/status'),
        qr: () => request<{ qr: string }>('/api/whatsapp/qr'),
    },

    // ── Knowledge ──
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

    // ── Leads ──
    leads: {
        list: (params?: { search?: string; page?: number; limit?: number }) => {
            const q = new URLSearchParams();
            if (params?.search) q.set('search', params.search);
            if (params?.page) q.set('page', String(params.page));
            if (params?.limit) q.set('limit', String(params.limit));
            return request<{ leads: any[]; total: number; page: number; limit: number }>(`/api/leads?${q.toString()}`);
        },
    },

    // ── Broadcasts ──
    broadcasts: {
        list: () => request<{ broadcasts: any[]; total: number }>('/api/broadcast'),
        get: (id: string) => request<{ broadcast: any }>(`/api/broadcast/${id}`),
        create: (body: { message: string; recipients: string[]; scheduledAt?: string }) =>
            request<{ broadcast: any }>('/api/broadcast', { method: 'POST', body: JSON.stringify(body) }),
    },

    // ── Tenant ──
    tenant: {
        settings: () => request<{ tenant: any }>('/api/tenant/settings'),
        update: (body: any) =>
            request<{ tenant: any }>('/api/tenant/settings', { method: 'PUT', body: JSON.stringify(body) }),
        dashboard: () => request<any>('/api/tenant/dashboard'),
        analytics: (days?: number) =>
            request<any>(`/api/tenant/analytics${days ? `?days=${days}` : ''}`),
    },
};
